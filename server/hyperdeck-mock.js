import { EventEmitter } from 'events';
import config from './config.js';

/**
 * Mock HyperDeck Manager
 * Simulates HyperDeck recorders for development without hardware
 * Reads deck configuration from environment (HYPERDECK_N_IP/NAME)
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
class HyperDeckMock extends EventEmitter {
  constructor() {
    super();
    this.decks = [];
    this.timecodeIntervals = new Map(); // Track playback timecode intervals per deck
  }

  /**
   * Initialize mock HyperDeck decks
   * @param {Array} deviceConfigs - Optional array of device configs from device-config.json
   */
  async connect(deviceConfigs = null) {
    // Use device configs if provided, otherwise fall back to env vars or defaults
    if (deviceConfigs && deviceConfigs.length > 0) {
      this.decks = deviceConfigs.map((deckConfig) => {
        const index = deckConfig.index ?? parseInt(deckConfig.id.split('_')[1], 10) - 1;
        return this.createMockDeck(index, deckConfig.name, deckConfig.ip);
      });
    } else if (config.hyperdecks && config.hyperdecks.length > 0) {
      this.decks = config.hyperdecks.map((deckConfig) =>
        this.createMockDeck(deckConfig.index, deckConfig.name, deckConfig.ip)
      );
    } else {
      // Default: create 2 mock decks if no config
      this.decks = [
        this.createMockDeck(0, 'Record A', '192.168.1.241'),
        this.createMockDeck(1, 'Record B', '192.168.1.242')
      ];
    }

    console.log(`✓ HyperDeck connected (Mock: ${this.decks.length} decks)`);

    // Emit initial state after short delay
    setTimeout(() => {
      this.emit('stateChange', this.getAllState());
    }, 100);
  }

  /**
   * Create a mock deck state object
   */
  createMockDeck(index, name, ip) {
    return {
      id: `hyperdeck_${index + 1}`,
      index,
      name,
      ip,
      connected: true,
      connecting: false,
      model: 'HyperDeck Studio HD Plus (Mock)',
      transportState: 'stopped',
      speed: 100,
      timecode: '00:00:00:00',
      displayTimecode: '00:00:00:00',
      clipId: 1,
      clipCount: 5,
      activeSlot: 1,
      slots: {
        1: {
          status: 'mounted',
          volumeName: 'SSD 1',
          recordingTime: 7200, // 2 hours in seconds
          recordingTimeRemaining: 5400 // 1.5 hours remaining
        },
        2: {
          status: 'mounted',
          volumeName: 'SSD 2',
          recordingTime: 7200,
          recordingTimeRemaining: 7000
        }
      },
      clips: this.createMockClips(),
      configuration: {
        videoInput: 'SDI',
        audioInput: 'embedded',
        fileFormat: 'QuickTimeProResHQ',
        audioCodec: 'PCM',
        loop: false,
        singleClip: false
      },
      remoteEnabled: true
    };
  }

  /**
   * Create mock clip list
   */
  createMockClips() {
    return [
      { id: 1, name: 'Take_001.mov', duration: '00:02:30:00', format: 'ProRes 422 HQ' },
      { id: 2, name: 'Take_002.mov', duration: '00:01:45:00', format: 'ProRes 422 HQ' },
      { id: 3, name: 'Take_003.mov', duration: '00:03:12:00', format: 'ProRes 422 HQ' },
      { id: 4, name: 'Interview_A.mov', duration: '00:15:00:00', format: 'ProRes 422 HQ' },
      { id: 5, name: 'B-Roll_01.mov', duration: '00:05:22:00', format: 'ProRes 422 HQ' }
    ];
  }

  /**
   * Get state for all decks
   */
  getAllState() {
    return this.decks;
  }

  /**
   * Get state for a specific deck
   */
  getDeckState(deckId) {
    return this.decks.find(d => d.id === deckId);
  }

  /**
   * Send command to a specific deck
   * @param {string} deckId - Deck ID ('hyperdeck_1', 'hyperdeck_2', etc.) or 'all'
   * @param {string} command - Command name
   * @param {Object} params - Command parameters
   */
  async sendCommand(deckId, command, params = {}) {
    if (deckId === 'all') {
      // Broadcast to all decks
      for (const deck of this.decks) {
        await this.executeCommand(deck, command, params);
      }
    } else {
      const deck = this.getDeckState(deckId);
      if (!deck) {
        throw new Error(`Deck ${deckId} not found`);
      }
      if (!deck.connected) {
        throw new Error(`Deck ${deckId} is not connected`);
      }
      await this.executeCommand(deck, command, params);
    }

    // Emit state change after command
    setTimeout(() => {
      this.emit('stateChange', this.getAllState());
    }, 50);
  }

  /**
   * Execute command on a specific deck
   */
  async executeCommand(deck, command, params) {
    if (!deck.remoteEnabled && command !== 'remoteEnable') {
      throw new Error('Remote is disabled on this deck');
    }

    console.log(`HyperDeck Mock: ${deck.name} executing ${command}`, params);

    switch (command) {
      case 'play':
        this.handlePlay(deck, params);
        break;
      case 'stop':
        this.handleStop(deck);
        break;
      case 'record':
        this.handleRecord(deck);
        break;
      case 'goto':
        this.handleGoto(deck, params);
        break;
      case 'jog':
        this.handleJog(deck, params);
        break;
      case 'shuttle':
        this.handleShuttle(deck, params);
        break;
      case 'slotSelect':
        this.handleSlotSelect(deck, params);
        break;
      case 'configuration':
        this.handleConfiguration(deck, params);
        break;
      case 'remoteEnable':
        deck.remoteEnabled = params.enable !== false;
        break;
      case 'clipsGet':
        // Just refresh clips - no action needed in mock
        break;
      default:
        console.warn(`HyperDeck Mock: Unknown command ${command}`);
    }
  }

  /**
   * Handle play command
   */
  handlePlay(deck, params) {
    this.stopTimecodeInterval(deck);
    deck.transportState = 'play';
    deck.speed = params.speed || 100;
    this.startTimecodeInterval(deck);
  }

  /**
   * Handle stop command
   */
  handleStop(deck) {
    this.stopTimecodeInterval(deck);
    deck.transportState = 'stopped';
    deck.speed = 0;
  }

  /**
   * Handle record command
   */
  handleRecord(deck) {
    const activeSlot = deck.slots[deck.activeSlot];
    if (activeSlot.status !== 'mounted') {
      throw new Error('No media in active slot');
    }
    if (activeSlot.recordingTimeRemaining <= 0) {
      throw new Error('No recording time remaining');
    }

    this.stopTimecodeInterval(deck);
    deck.transportState = 'record';
    deck.speed = 100;
    this.startTimecodeInterval(deck);
  }

  /**
   * Handle goto command (navigate to clip)
   */
  handleGoto(deck, params) {
    if (params.clipId !== undefined) {
      let targetClipId;

      if (params.clipId === -1) {
        // Previous clip
        targetClipId = Math.max(1, deck.clipId - 1);
      } else if (params.clipId === '+1') {
        // Next clip
        targetClipId = Math.min(deck.clipCount, deck.clipId + 1);
      } else {
        targetClipId = params.clipId;
      }

      if (targetClipId >= 1 && targetClipId <= deck.clipCount) {
        deck.clipId = targetClipId;
        deck.timecode = '00:00:00:00';
        deck.displayTimecode = '00:00:00:00';
      }
    } else if (params.timecode) {
      deck.timecode = params.timecode;
      deck.displayTimecode = params.timecode;
    }
  }

  /**
   * Handle jog command
   */
  handleJog(deck, params) {
    this.stopTimecodeInterval(deck);
    deck.transportState = 'jog';
    deck.speed = 0;

    // Apply timecode offset
    if (params.timecode) {
      const frames = this.timecodeToFrames(deck.timecode);
      const offsetFrames = this.parseTimecodeOffset(params.timecode);
      const newFrames = Math.max(0, frames + offsetFrames);
      deck.timecode = this.framesToTimecode(newFrames);
      deck.displayTimecode = deck.timecode;
    }
  }

  /**
   * Handle shuttle command
   */
  handleShuttle(deck, params) {
    this.stopTimecodeInterval(deck);
    const speed = params.speed || 100;
    deck.speed = speed;

    if (speed > 0) {
      deck.transportState = 'shuttle forward';
    } else if (speed < 0) {
      deck.transportState = 'shuttle reverse';
    } else {
      deck.transportState = 'stopped';
    }

    if (speed !== 0) {
      this.startTimecodeInterval(deck);
    }
  }

  /**
   * Handle slot select command
   */
  handleSlotSelect(deck, params) {
    const slot = params.slot;
    if (slot === 1 || slot === 2) {
      deck.activeSlot = slot;
    }
  }

  /**
   * Handle configuration command
   */
  handleConfiguration(deck, params) {
    if (params.videoInput !== undefined) {
      deck.configuration.videoInput = params.videoInput;
    }
    if (params.audioInput !== undefined) {
      deck.configuration.audioInput = params.audioInput;
    }
    if (params.fileFormat !== undefined) {
      deck.configuration.fileFormat = params.fileFormat;
    }
    if (params.audioCodec !== undefined) {
      deck.configuration.audioCodec = params.audioCodec;
    }
    if (params.loop !== undefined) {
      deck.configuration.loop = params.loop;
    }
    if (params.singleClip !== undefined) {
      deck.configuration.singleClip = params.singleClip;
    }
  }

  /**
   * Start timecode advancement interval for a deck
   */
  startTimecodeInterval(deck) {
    // Advance timecode approximately 4 times per second (simulate 30fps)
    const interval = setInterval(() => {
      const frames = this.timecodeToFrames(deck.timecode);
      const speedMultiplier = deck.speed / 100;
      const framesToAdd = Math.round(7 * speedMultiplier); // ~7 frames per tick at 1x
      const newFrames = Math.max(0, frames + framesToAdd);
      deck.timecode = this.framesToTimecode(newFrames);
      deck.displayTimecode = deck.timecode;

      // Emit throttled state change
      this.emit('stateChange', this.getAllState());
    }, 250); // 4 updates per second

    this.timecodeIntervals.set(deck.id, interval);
  }

  /**
   * Stop timecode advancement interval for a deck
   */
  stopTimecodeInterval(deck) {
    const interval = this.timecodeIntervals.get(deck.id);
    if (interval) {
      clearInterval(interval);
      this.timecodeIntervals.delete(deck.id);
    }
  }

  /**
   * Convert timecode string to frame count (assuming 30fps)
   */
  timecodeToFrames(tc) {
    const parts = tc.split(':').map(Number);
    if (parts.length !== 4) return 0;
    const [hh, mm, ss, ff] = parts;
    return ((hh * 3600 + mm * 60 + ss) * 30) + ff;
  }

  /**
   * Convert frame count to timecode string (assuming 30fps)
   */
  framesToTimecode(frames) {
    const ff = frames % 30;
    const totalSeconds = Math.floor(frames / 30);
    const ss = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const mm = totalMinutes % 60;
    const hh = Math.floor(totalMinutes / 60);

    return [hh, mm, ss, ff].map(n => String(n).padStart(2, '0')).join(':');
  }

  /**
   * Parse timecode offset string (+/-HH:MM:SS:FF)
   */
  parseTimecodeOffset(offset) {
    const sign = offset.startsWith('-') ? -1 : 1;
    const tc = offset.replace(/^[+-]/, '');
    return sign * this.timecodeToFrames(tc);
  }

  /**
   * Disconnect (cleanup)
   */
  disconnect() {
    // Stop all timecode intervals
    for (const deck of this.decks) {
      this.stopTimecodeInterval(deck);
    }

    for (const deck of this.decks) {
      deck.connected = false;
    }

    console.log('HyperDeck Mock: Disconnected');
  }
}

// Export singleton instance
export default new HyperDeckMock();
