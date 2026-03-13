import { EventEmitter } from 'events';
import { Socket } from 'net';
import config from './config.js';

/**
 * HyperDeck Manager
 * TCP client for Blackmagic HyperDeck devices (port 9993)
 *
 * Protocol: Line-delimited text commands and responses
 * Async notifications start with 5xx codes
 *
 * State shape per deck:
 * {
 *   id: 'hyperdeck_1',
 *   name: 'HyperDeck 1',
 *   ip: '192.168.x.x',
 *   connected: boolean,
 *   connecting: boolean,
 *   model: 'HyperDeck Studio HD Plus',
 *   transportState: 'stopped' | 'play' | 'record' | 'shuttle forward' | 'shuttle reverse' | 'jog',
 *   speed: number (100 = 1x),
 *   timecode: '00:00:00:00',
 *   displayTimecode: '00:00:00:00',
 *   clipId: number,
 *   clipCount: number,
 *   activeSlot: 1 | 2,
 *   slots: { 1: {...}, 2: {...} },
 *   clips: [...],
 *   configuration: {...},
 *   remoteEnabled: boolean
 * }
 */
class HyperDeckManager extends EventEmitter {
  constructor() {
    super();
    this.decks = new Map(); // Map of deckId -> deck state
    this.sockets = new Map(); // Map of deckId -> socket
    this.buffers = new Map(); // Map of deckId -> TCP buffer
    this.reconnectTimers = new Map();
    this.reconnectDelays = new Map();
    this.pendingCommands = new Map(); // Map of deckId -> array of pending promises
    this.lastTimecodeEmit = new Map(); // For throttling timecode updates
  }

  /**
   * Initialize all configured HyperDeck connections
   */
  async connect() {
    const deckConfigs = config.hyperdecks;

    if (deckConfigs.length === 0) {
      console.log('No HyperDecks configured');
      return;
    }

    console.log(`Initializing ${deckConfigs.length} HyperDeck connection(s)...`);

    for (const deckConfig of deckConfigs) {
      this.initializeDeck(deckConfig);
      this.connectDeck(deckConfig.id);
    }
  }

  /**
   * Initialize deck state
   */
  initializeDeck(deckConfig) {
    const deckState = {
      id: deckConfig.id,
      index: deckConfig.index,
      name: deckConfig.name,
      ip: deckConfig.ip,
      connected: false,
      connecting: false,
      model: null,
      transportState: 'stopped',
      speed: 0,
      timecode: '00:00:00:00',
      displayTimecode: '00:00:00:00',
      clipId: null,
      clipCount: 0,
      activeSlot: 1,
      slots: {
        1: { status: 'empty', volumeName: null, recordingTime: 0, recordingTimeRemaining: 0 },
        2: { status: 'empty', volumeName: null, recordingTime: 0, recordingTimeRemaining: 0 }
      },
      clips: [],
      configuration: {
        videoInput: null,
        audioInput: null,
        fileFormat: null,
        audioCodec: null,
        loop: false,
        singleClip: false
      },
      remoteEnabled: true
    };

    this.decks.set(deckConfig.id, deckState);
    this.buffers.set(deckConfig.id, '');
    this.reconnectDelays.set(deckConfig.id, 1000);
    this.pendingCommands.set(deckConfig.id, []);
  }

  /**
   * Connect to a specific deck
   */
  connectDeck(deckId) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    deck.connecting = true;
    this.emit('stateChange', this.getAllState());

    const socket = new Socket();
    this.sockets.set(deckId, socket);

    socket.on('connect', () => {
      console.log(`✓ HyperDeck ${deck.name} connected to ${deck.ip}:${config.hyperdeckPort}`);
      deck.connected = true;
      deck.connecting = false;
      this.reconnectDelays.set(deckId, 1000); // Reset reconnect delay

      // Request initial state
      this.requestInitialState(deckId);
    });

    socket.on('data', (chunk) => {
      this.handleData(deckId, chunk);
    });

    socket.on('close', () => {
      console.log(`HyperDeck ${deck.name}: Connection closed`);
      deck.connected = false;
      deck.connecting = false;
      this.sockets.delete(deckId);
      this.emit('stateChange', this.getAllState());
      this.scheduleReconnect(deckId);
    });

    socket.on('error', (error) => {
      console.error(`HyperDeck ${deck.name} connection error:`, error.message);
      deck.connected = false;
      deck.connecting = false;
    });

    console.log(`Connecting to HyperDeck ${deck.name} at ${deck.ip}:${config.hyperdeckPort}...`);
    socket.connect(config.hyperdeckPort, deck.ip);
  }

  /**
   * Request initial state from a deck after connection
   */
  async requestInitialState(deckId) {
    try {
      // Request device info
      await this.sendRawCommand(deckId, 'device info');

      // Request transport info
      await this.sendRawCommand(deckId, 'transport info');

      // Request slot info for both slots
      await this.sendRawCommand(deckId, 'slot info: slot id: 1');
      await this.sendRawCommand(deckId, 'slot info: slot id: 2');

      // Request clips
      await this.sendRawCommand(deckId, 'clips get');

      // Request configuration
      await this.sendRawCommand(deckId, 'configuration');

      // Request remote status
      await this.sendRawCommand(deckId, 'remote');

      // Enable notifications
      await this.sendRawCommand(deckId, 'notify: transport: true slot: true remote: true configuration: true');

      this.emit('stateChange', this.getAllState());
    } catch (error) {
      console.error(`Failed to get initial state from ${deckId}:`, error.message);
    }
  }

  /**
   * Handle incoming TCP data from a deck
   */
  handleData(deckId, chunk) {
    let buffer = this.buffers.get(deckId) || '';
    buffer += chunk.toString('utf8');

    // Process complete lines (terminated by \r\n)
    let lineEnd;
    while ((lineEnd = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.substring(0, lineEnd);
      buffer = buffer.substring(lineEnd + 2);

      if (line.trim()) {
        this.parseLine(deckId, line);
      }
    }

    this.buffers.set(deckId, buffer);
  }

  /**
   * Parse a single response line
   */
  parseLine(deckId, line) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    // Check for response code (3 digits followed by space or colon)
    const codeMatch = line.match(/^(\d{3})[\s:]/);

    if (codeMatch) {
      const code = parseInt(codeMatch[1], 10);
      const content = line.substring(4).trim();

      if (code >= 500 && code < 600) {
        // Async notification
        this.handleNotification(deckId, code, content);
      } else if (code >= 200 && code < 300) {
        // Success response
        this.handleResponse(deckId, code, content);
      } else if (code >= 100 && code < 200) {
        // Informational / multi-line response header
        this.handleResponseHeader(deckId, code, content);
      } else if (code >= 100) {
        // Error response
        this.handleError(deckId, code, content);
      }
    } else {
      // Data line (part of multi-line response)
      this.handleDataLine(deckId, line);
    }
  }

  /**
   * Handle async notification (5xx codes)
   */
  handleNotification(deckId, code, content) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    switch (code) {
      case 500: // connection info
        // Parse connection info if needed
        break;

      case 508: // transport info
        this.parseTransportInfo(deck, content);
        this.throttledEmit(deckId);
        break;

      case 502: // slot info
        this.parseSlotInfo(deck, content);
        this.emit('stateChange', this.getAllState());
        break;

      case 510: // remote info
        this.parseRemoteInfo(deck, content);
        this.emit('stateChange', this.getAllState());
        break;

      case 511: // configuration
        this.parseConfiguration(deck, content);
        this.emit('stateChange', this.getAllState());
        break;
    }
  }

  /**
   * Handle success response (2xx codes)
   */
  handleResponse(deckId, code, content) {
    // Resolve pending command if any
    const pending = this.pendingCommands.get(deckId);
    if (pending && pending.length > 0) {
      const { resolve } = pending.shift();
      resolve({ code, content });
    }
  }

  /**
   * Handle response header (1xx codes)
   */
  handleResponseHeader(deckId, code, content) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    // Store the response type for parsing subsequent data lines
    deck._currentResponse = { code, content, data: [] };
  }

  /**
   * Handle data line (part of multi-line response)
   */
  handleDataLine(deckId, line) {
    const deck = this.decks.get(deckId);
    if (!deck || !deck._currentResponse) return;

    // Check if this is an empty line (end of multi-line response)
    if (line === '' || line === '\r') {
      this.processMultiLineResponse(deckId, deck._currentResponse);
      deck._currentResponse = null;
      return;
    }

    // Parse key: value pairs
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      deck._currentResponse.data.push({ key, value });
    }
  }

  /**
   * Process completed multi-line response
   */
  processMultiLineResponse(deckId, response) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    const { code, content, data } = response;

    // Convert data array to object
    const dataObj = {};
    for (const { key, value } of data) {
      dataObj[key] = value;
    }

    if (content.includes('device info') || code === 204) {
      this.parseDeviceInfo(deck, dataObj);
    } else if (content.includes('transport info') || code === 208) {
      this.parseTransportInfoObj(deck, dataObj);
    } else if (content.includes('slot info') || code === 202) {
      this.parseSlotInfoObj(deck, dataObj);
    } else if (content.includes('clips') || code === 205) {
      this.parseClipsObj(deck, dataObj);
    } else if (content.includes('configuration') || code === 211) {
      this.parseConfigurationObj(deck, dataObj);
    } else if (content.includes('remote') || code === 209) {
      this.parseRemoteInfoObj(deck, dataObj);
    }

    this.emit('stateChange', this.getAllState());
  }

  /**
   * Handle error response
   */
  handleError(deckId, code, content) {
    console.error(`HyperDeck ${deckId} error ${code}: ${content}`);

    const pending = this.pendingCommands.get(deckId);
    if (pending && pending.length > 0) {
      const { reject } = pending.shift();
      reject(new Error(`${code}: ${content}`));
    }
  }

  /**
   * Parse device info from data object
   */
  parseDeviceInfo(deck, data) {
    if (data['model name']) {
      deck.model = data['model name'];
    }
  }

  /**
   * Parse transport info from notification line
   */
  parseTransportInfo(deck, content) {
    const pairs = this.parseKeyValuePairs(content);

    if (pairs.status) {
      deck.transportState = pairs.status;
    }
    if (pairs.speed !== undefined) {
      deck.speed = parseInt(pairs.speed, 10);
    }
    if (pairs.timecode) {
      deck.timecode = pairs.timecode;
      deck.displayTimecode = pairs.timecode;
    }
    if (pairs['display timecode']) {
      deck.displayTimecode = pairs['display timecode'];
    }
    if (pairs['clip id'] !== undefined) {
      deck.clipId = parseInt(pairs['clip id'], 10);
    }
  }

  /**
   * Parse transport info from data object
   */
  parseTransportInfoObj(deck, data) {
    if (data.status) {
      deck.transportState = data.status;
    }
    if (data.speed !== undefined) {
      deck.speed = parseInt(data.speed, 10);
    }
    if (data.timecode) {
      deck.timecode = data.timecode;
      deck.displayTimecode = data.timecode;
    }
    if (data['display timecode']) {
      deck.displayTimecode = data['display timecode'];
    }
    if (data['clip id'] !== undefined) {
      deck.clipId = parseInt(data['clip id'], 10);
    }
    if (data['clip count'] !== undefined) {
      deck.clipCount = parseInt(data['clip count'], 10);
    }
    if (data['active slot'] !== undefined) {
      deck.activeSlot = parseInt(data['active slot'], 10);
    }
  }

  /**
   * Parse slot info from notification line
   */
  parseSlotInfo(deck, content) {
    const pairs = this.parseKeyValuePairs(content);
    const slotId = parseInt(pairs['slot id'], 10);

    if (slotId === 1 || slotId === 2) {
      const slot = deck.slots[slotId];
      if (pairs.status) slot.status = pairs.status;
      if (pairs['volume name']) slot.volumeName = pairs['volume name'];
      if (pairs['recording time'] !== undefined) {
        slot.recordingTime = parseInt(pairs['recording time'], 10);
      }
    }
  }

  /**
   * Parse slot info from data object
   */
  parseSlotInfoObj(deck, data) {
    const slotId = parseInt(data['slot id'], 10);

    if (slotId === 1 || slotId === 2) {
      const slot = deck.slots[slotId];
      if (data.status) slot.status = data.status;
      if (data['volume name']) slot.volumeName = data['volume name'];
      if (data['recording time'] !== undefined) {
        slot.recordingTime = parseInt(data['recording time'], 10);
      }
    }
  }

  /**
   * Parse clips from data object
   */
  parseClipsObj(deck, data) {
    // Clips response has numbered entries: 1, 2, 3, etc.
    const clips = [];

    for (const [key, value] of Object.entries(data)) {
      const clipId = parseInt(key, 10);
      if (!isNaN(clipId)) {
        // Parse clip info: "name duration format"
        const parts = value.split(' ');
        clips.push({
          id: clipId,
          name: parts[0] || `Clip ${clipId}`,
          duration: parts[1] || '00:00:00:00',
          format: parts.slice(2).join(' ') || 'Unknown'
        });
      }
    }

    deck.clips = clips;
    deck.clipCount = clips.length;
  }

  /**
   * Parse configuration from notification line
   */
  parseConfiguration(deck, content) {
    const pairs = this.parseKeyValuePairs(content);
    this.applyConfiguration(deck, pairs);
  }

  /**
   * Parse configuration from data object
   */
  parseConfigurationObj(deck, data) {
    this.applyConfiguration(deck, data);
  }

  /**
   * Apply configuration to deck state
   */
  applyConfiguration(deck, data) {
    if (data['video input']) {
      deck.configuration.videoInput = data['video input'];
    }
    if (data['audio input']) {
      deck.configuration.audioInput = data['audio input'];
    }
    if (data['file format']) {
      deck.configuration.fileFormat = data['file format'];
    }
    if (data['audio codec']) {
      deck.configuration.audioCodec = data['audio codec'];
    }
    if (data['loop'] !== undefined) {
      deck.configuration.loop = data['loop'] === 'true';
    }
    if (data['single clip'] !== undefined) {
      deck.configuration.singleClip = data['single clip'] === 'true';
    }
  }

  /**
   * Parse remote info from notification line
   */
  parseRemoteInfo(deck, content) {
    const pairs = this.parseKeyValuePairs(content);
    if (pairs.enabled !== undefined) {
      deck.remoteEnabled = pairs.enabled === 'true';
    }
  }

  /**
   * Parse remote info from data object
   */
  parseRemoteInfoObj(deck, data) {
    if (data.enabled !== undefined) {
      deck.remoteEnabled = data.enabled === 'true';
    }
  }

  /**
   * Parse key: value pairs from a line
   */
  parseKeyValuePairs(line) {
    const pairs = {};
    // Match key: value patterns
    const regex = /(\w[\w\s]*?):\s*([^\s:]+(?:\s+[^\s:]+)*?)(?=\s+\w[\w\s]*?:|$)/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      pairs[match[1].trim()] = match[2].trim();
    }

    return pairs;
  }

  /**
   * Throttle state change emissions for timecode updates
   */
  throttledEmit(deckId) {
    const now = Date.now();
    const last = this.lastTimecodeEmit.get(deckId) || 0;

    // Emit at most 4 times per second
    if (now - last >= 250) {
      this.lastTimecodeEmit.set(deckId, now);
      this.emit('stateChange', this.getAllState());
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect(deckId) {
    const existingTimer = this.reconnectTimers.get(deckId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delay = this.reconnectDelays.get(deckId) || 1000;
    const deck = this.decks.get(deckId);

    console.log(`HyperDeck ${deck?.name}: Reconnecting in ${delay / 1000}s...`);

    const timer = setTimeout(() => {
      // Double delay for next attempt, up to 30s max
      const newDelay = Math.min(delay * 2, 30000);
      this.reconnectDelays.set(deckId, newDelay);

      this.connectDeck(deckId);
    }, delay);

    this.reconnectTimers.set(deckId, timer);
  }

  /**
   * Get state for all decks
   */
  getAllState() {
    return Array.from(this.decks.values());
  }

  /**
   * Send raw command string to a deck
   * Includes 5-second timeout to prevent hanging on unresponsive decks
   */
  async sendRawCommand(deckId, command) {
    const socket = this.sockets.get(deckId);
    const deck = this.decks.get(deckId);

    if (!socket || !deck?.connected) {
      throw new Error(`Deck ${deckId} is not connected`);
    }

    const COMMAND_TIMEOUT_MS = 5000;

    return new Promise((resolve, reject) => {
      const pending = this.pendingCommands.get(deckId);

      // Create timeout to reject if no response
      const timeoutId = setTimeout(() => {
        // Remove this pending command from queue
        const idx = pending.findIndex(p => p.timeoutId === timeoutId);
        if (idx !== -1) {
          pending.splice(idx, 1);
        }
        reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS}ms: ${command}`));
      }, COMMAND_TIMEOUT_MS);

      // Wrap resolve/reject to clear timeout
      const wrappedResolve = (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      };
      const wrappedReject = (error) => {
        clearTimeout(timeoutId);
        reject(error);
      };

      pending.push({ resolve: wrappedResolve, reject: wrappedReject, timeoutId });

      socket.write(command + '\r\n');
    });
  }

  /**
   * Send command to a deck or all decks
   * @param {string} deckId - Deck ID or 'all' for broadcast
   * @param {string} command - Command name
   * @param {Object} params - Command parameters
   */
  async sendCommand(deckId, command, params = {}) {
    if (deckId === 'all') {
      const results = [];
      for (const deck of this.decks.values()) {
        if (deck.connected) {
          try {
            results.push(await this.executeCommand(deck.id, command, params));
          } catch (error) {
            console.error(`Broadcast command failed for ${deck.name}:`, error.message);
          }
        }
      }
      return results;
    } else {
      return this.executeCommand(deckId, command, params);
    }
  }

  /**
   * Execute command on a specific deck
   */
  async executeCommand(deckId, command, params) {
    const deck = this.decks.get(deckId);
    if (!deck?.connected) {
      throw new Error(`Deck ${deckId} is not connected`);
    }

    let rawCommand;

    switch (command) {
      case 'play':
        rawCommand = params.speed ? `play: speed: ${params.speed}` : 'play';
        break;
      case 'stop':
        rawCommand = 'stop';
        break;
      case 'record':
        rawCommand = 'record';
        break;
      case 'goto':
        if (params.clipId !== undefined) {
          rawCommand = `goto: clip id: ${params.clipId}`;
        } else if (params.timecode) {
          rawCommand = `goto: timecode: ${params.timecode}`;
        }
        break;
      case 'jog':
        rawCommand = `jog: timecode: ${params.timecode}`;
        break;
      case 'shuttle':
        rawCommand = `shuttle: speed: ${params.speed}`;
        break;
      case 'slotSelect':
        rawCommand = `slot select: slot id: ${params.slot}`;
        break;
      case 'configuration':
        rawCommand = this.buildConfigCommand(params);
        break;
      case 'remoteEnable':
        rawCommand = `remote: enable: ${params.enable ? 'true' : 'false'}`;
        break;
      case 'clipsGet':
        rawCommand = 'clips get';
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    if (rawCommand) {
      console.log(`HyperDeck ${deck.name}: Sending "${rawCommand}"`);
      return this.sendRawCommand(deckId, rawCommand);
    }
  }

  /**
   * Build configuration command string
   */
  buildConfigCommand(params) {
    const parts = ['configuration:'];

    if (params.videoInput) parts.push(`video input: ${params.videoInput}`);
    if (params.audioInput) parts.push(`audio input: ${params.audioInput}`);
    if (params.fileFormat) parts.push(`file format: ${params.fileFormat}`);
    if (params.audioCodec) parts.push(`audio codec: ${params.audioCodec}`);
    if (params.loop !== undefined) parts.push(`loop: ${params.loop}`);
    if (params.singleClip !== undefined) parts.push(`single clip: ${params.singleClip}`);

    return parts.join(' ');
  }

  /**
   * Disconnect all decks
   */
  disconnect() {
    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all sockets
    for (const [deckId, socket] of this.sockets) {
      socket.destroy();
      const deck = this.decks.get(deckId);
      if (deck) deck.connected = false;
    }
    this.sockets.clear();

    console.log('HyperDeck Manager: Disconnected');
  }
}

// Export singleton instance
export default new HyperDeckManager();
