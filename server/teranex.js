import { EventEmitter } from 'events';
import { Socket } from 'net';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Protocol constants for Teranex AV
 * Port is read from config.teranexPort (default 9800)
 */

const VIDEO_SOURCES = ['SDI', 'HDMI', 'Optical'];
const AUDIO_SOURCES = ['Embedded', 'AES', 'Analog'];
const ASPECT_RATIOS = ['Anamorphic', 'Letterbox', 'Pillarbox', 'Smart', '14:9', 'Center Cut', 'Zoom', 'Adjust'];
const TEST_PATTERNS = ['None', 'SMPTE Bars', 'Color Bars 75%', 'Grid', 'Multiburst', 'Black'];
const NO_SIGNAL_OPTIONS = ['Black', 'Grid', 'Color Bars'];
const OUTPUT_SOURCES = ['Input', 'Black', 'Still', 'Freeze'];

/**
 * Map protocol key names (with spaces) to camelCase property names
 */
const KEY_MAP = {
  'Auto detection enabled': 'autoDetectionEnabled',
  'Auto detection prefer PsF': 'autoDetectionPreferPsF',
  'Video source': 'videoSource',
  'Video mode': 'videoMode',
  'Audio source': 'audioSource',
  'Signal present': 'signalPresent',
  'Timecode present': 'timecodePresent',
  'Closed captioning present': 'closedCaptioningPresent',
  'Wide SD aspect': 'wideSdAspect',
  'HDMI 3D Full': 'hdmi3DFull',
  'Video pixel format': 'videoPixelFormat',
  'Aspect ratio': 'aspectRatio',
  'DualLink': 'dualLink',
  'Output': 'output',
  'No signal': 'noSignal',
  'Horizontal pattern motion': 'horizontalMotion',
  'Output source': 'outputSource',
  'Transition rate': 'transitionRate',
  'Model name': 'modelName',
  'Version': 'protocolVersion',
  'Gain': 'gain',
  'Black': 'black',
  'Saturation': 'saturation',
  'Hue': 'hue',
  'RY': 'ry',
  'BY': 'by',
  'Sharp': 'sharp',
  'Enabled': 'enabled',
  'Bias': 'bias',
  'Split screen': 'splitScreen',
  'Red overlay': 'redOverlay'
};

/**
 * Reverse map for sending commands
 */
const REVERSE_KEY_MAP = Object.entries(KEY_MAP).reduce((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {});

/**
 * Parse a boolean value from protocol string
 */
function parseBoolean(value) {
  return value === 'true';
}

/**
 * Parse a numeric value from protocol string
 */
function parseNumber(value) {
  const num = parseInt(value, 10);
  return isNaN(num) ? value : num;
}

/**
 * Parse a value, converting booleans and numbers appropriately
 */
function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = parseFloat(value);
  if (!isNaN(num) && value.match(/^-?\d+\.?\d*$/)) return num;
  return value;
}

/**
 * Format a command for the Teranex protocol
 * @param {string} blockName - Block header (e.g., 'VIDEO OUTPUT')
 * @param {Object} properties - camelCase key-value pairs
 * @returns {string} Formatted command string
 */
function formatCommand(blockName, properties) {
  let cmd = `${blockName}:\n`;
  for (const [key, value] of Object.entries(properties)) {
    const protocolKey = REVERSE_KEY_MAP[key] || key;
    cmd += `${protocolKey}: ${value}\n`;
  }
  cmd += '\n';
  return cmd;
}

/**
 * Teranex Manager
 * TCP client for Blackmagic Teranex AV devices (port 9800)
 * Supports up to 4 units with independent connections
 *
 * Protocol: Text-based, blocks separated by blank lines (\n\n)
 * Same family as VideoHub protocol.
 */
class TeranexManager extends EventEmitter {
  constructor() {
    super();
    this.units = new Map();       // Map<unitId, state>
    this.sockets = new Map();     // Map<unitId, Socket>
    this.buffers = new Map();     // Map<unitId, string>
    this.reconnectTimers = new Map();
    this.reconnectDelays = new Map();
    this.names = {};
    this.namesFile = path.join(__dirname, '..', 'data', 'teranex-names.json');
    this.maxReconnectDelay = 30000;
  }

  /**
   * Load custom unit names from disk
   */
  async loadNames() {
    try {
      const data = await fs.readFile(this.namesFile, 'utf-8');
      this.names = JSON.parse(data);
    } catch {
      this.names = {};
    }
  }

  /**
   * Save custom unit names to disk
   */
  async saveNames() {
    try {
      const dir = path.dirname(this.namesFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.namesFile, JSON.stringify(this.names, null, 2));
    } catch (error) {
      console.error('Failed to save Teranex names:', error.message);
    }
  }

  /**
   * Create default state for a unit
   */
  createDefaultState(unitConfig) {
    const name = this.names[unitConfig.index] || unitConfig.name;
    return {
      id: unitConfig.id,
      index: unitConfig.index,
      name,
      ip: unitConfig.ip,
      connected: false,
      connecting: true,
      device: {
        modelName: '',
        protocolVersion: ''
      },
      videoInput: {
        autoDetectionEnabled: true,
        autoDetectionPreferPsF: false,
        videoSource: 'SDI',
        videoMode: '',
        audioSource: 'Embedded',
        signalPresent: false,
        timecodePresent: 'None',
        closedCaptioningPresent: 'None',
        wideSdAspect: false,
        hdmi3DFull: false,
        videoPixelFormat: 'YCbCr422'
      },
      videoOutput: {
        videoMode: '',
        aspectRatio: 'Anamorphic',
        dualLink: false,
        videoPixelFormat: 'YCbCr422'
      },
      testPattern: {
        output: 'None',
        noSignal: 'Black',
        horizontalMotion: false
      },
      videoAdvanced: {
        outputSource: 'Input',
        transitionRate: 0
      },
      procAmp: {
        gain: 0,
        black: 0,
        saturation: 0,
        hue: 0,
        ry: 0,
        by: 0,
        sharp: 0
      }
    };
  }

  /**
   * Initialize connections to all configured Teranex units
   */
  async connect() {
    console.log('Teranex: Starting in REAL mode');

    await this.loadNames();

    if (config.teranexes.length === 0) {
      console.log('Teranex: No units configured');
      return;
    }

    for (const unitConfig of config.teranexes) {
      this.initUnit(unitConfig);
      this.connectUnit(unitConfig.id);
    }
  }

  /**
   * Initialize state for a unit
   */
  initUnit(unitConfig) {
    const state = this.createDefaultState(unitConfig);
    this.units.set(unitConfig.id, state);
    this.buffers.set(unitConfig.id, '');
    this.reconnectDelays.set(unitConfig.id, 1000);
  }

  /**
   * Connect to a single Teranex unit
   */
  connectUnit(unitId) {
    const state = this.units.get(unitId);
    if (!state) return;

    // Clean up existing socket if any
    const existingSocket = this.sockets.get(unitId);
    if (existingSocket) {
      existingSocket.destroy();
    }

    const socket = new Socket();
    this.sockets.set(unitId, socket);

    socket.on('connect', () => {
      console.log(`✓ Teranex [${state.name}] connected to ${state.ip}:${config.teranexPort}`);
      state.connected = true;
      state.connecting = false;
      this.reconnectDelays.set(unitId, 1000);
      this.emit('stateChange', this.getAllState());
    });

    socket.on('data', (chunk) => {
      this.handleData(unitId, chunk);
    });

    socket.on('close', () => {
      console.log(`Teranex [${state.name}]: Connection closed`);
      state.connected = false;
      state.connecting = false;
      this.emit('stateChange', this.getAllState());
      this.scheduleReconnect(unitId);
    });

    socket.on('error', (error) => {
      console.error(`Teranex [${state.name}] connection error: ${error.message}`);
      state.connecting = false;
    });

    console.log(`Connecting to Teranex [${state.name}] at ${state.ip}:${config.teranexPort}...`);
    state.connecting = true;
    socket.connect(config.teranexPort, state.ip);
  }

  /**
   * Handle incoming TCP data
   * Critical: TCP delivers data in arbitrary chunks, must buffer and parse complete blocks
   */
  handleData(unitId, chunk) {
    let buffer = this.buffers.get(unitId) || '';
    buffer += chunk.toString('utf8');

    // Normalize \r\n to \n
    buffer = buffer.replace(/\r\n/g, '\n');

    // Process complete blocks (terminated by \n\n)
    let blockEnd;
    while ((blockEnd = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.substring(0, blockEnd);
      buffer = buffer.substring(blockEnd + 2);

      if (block.trim()) {
        this.parseBlock(unitId, block.trim());
      }
    }

    this.buffers.set(unitId, buffer);
  }

  /**
   * Parse a complete protocol block
   */
  parseBlock(unitId, block) {
    const state = this.units.get(unitId);
    if (!state) return;

    const lines = block.split('\n');
    if (lines.length === 0) return;

    // First line is the header (e.g., "VIDEO INPUT:")
    const headerLine = lines[0];
    const header = headerLine.replace(':', '').trim();
    const dataLines = lines.slice(1);

    // Parse key-value pairs
    const properties = {};
    for (const line of dataLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      const camelKey = KEY_MAP[key] || key;
      properties[camelKey] = parseValue(value);
    }

    // Map block to state
    switch (header) {
      case 'PROTOCOL PREAMBLE':
        if (properties.protocolVersion) {
          state.device.protocolVersion = properties.protocolVersion;
        }
        break;

      case 'TERANEX DEVICE':
        if (properties.modelName) {
          state.device.modelName = properties.modelName;
          console.log(`Teranex [${state.name}]: ${properties.modelName}`);
        }
        break;

      case 'VIDEO INPUT':
        Object.assign(state.videoInput, properties);
        break;

      case 'VIDEO OUTPUT':
        Object.assign(state.videoOutput, properties);
        break;

      case 'VIDEO PROC AMP':
        Object.assign(state.procAmp, properties);
        break;

      case 'TEST PATTERN':
        Object.assign(state.testPattern, properties);
        break;

      case 'VIDEO ADVANCED':
        Object.assign(state.videoAdvanced, properties);
        break;

      case 'NOISE REDUCTION':
        // Store if needed, not used in V1 UI
        break;

      case 'VIDEO ADJUST':
        // Store if needed, not used in V1 UI
        break;

      case 'ACK':
        // Command acknowledged
        break;

      case 'NAK':
        console.error(`Teranex [${state.name}]: Command rejected (NAK)`);
        break;

      default:
        // Unknown block type, ignore
        break;
    }

    // Emit state change after any block
    this.emit('stateChange', this.getAllState());
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect(unitId) {
    const existingTimer = this.reconnectTimers.get(unitId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delay = this.reconnectDelays.get(unitId) || 1000;
    const state = this.units.get(unitId);
    console.log(`Teranex [${state?.name}]: Reconnecting in ${delay / 1000}s...`);

    const timer = setTimeout(() => {
      this.connectUnit(unitId);
      // Increase delay for next attempt
      const newDelay = Math.min(delay * 2, this.maxReconnectDelay);
      this.reconnectDelays.set(unitId, newDelay);
    }, delay);

    this.reconnectTimers.set(unitId, timer);
  }

  /**
   * Get state for all units
   */
  getAllState() {
    return Array.from(this.units.values());
  }

  /**
   * Send command to a unit
   */
  async sendCommand(unitId, command, params) {
    const state = this.units.get(unitId);
    const socket = this.sockets.get(unitId);

    if (!state) {
      throw new Error(`Teranex unit ${unitId} not found`);
    }

    if (!state.connected || !socket) {
      throw new Error(`Teranex [${state.name}] not connected`);
    }

    console.log(`Teranex [${state.name}]: ${command}`, params);

    switch (command) {
      case 'setVideoInput':
        socket.write(formatCommand('VIDEO INPUT', { videoSource: params.videoSource }));
        break;

      case 'setAudioInput':
        socket.write(formatCommand('VIDEO INPUT', { audioSource: params.audioSource }));
        break;

      case 'setVideoOutput':
        socket.write(formatCommand('VIDEO OUTPUT', { videoMode: params.videoMode }));
        break;

      case 'setAspectRatio':
        socket.write(formatCommand('VIDEO OUTPUT', { aspectRatio: params.aspectRatio }));
        break;

      case 'setTestPattern':
        socket.write(formatCommand('TEST PATTERN', { output: params.output }));
        break;

      case 'setTestPatternMotion':
        socket.write(formatCommand('TEST PATTERN', { horizontalMotion: params.enabled }));
        break;

      case 'setNoSignal':
        socket.write(formatCommand('TEST PATTERN', { noSignal: params.noSignal }));
        break;

      case 'setOutputSource':
        socket.write(formatCommand('VIDEO ADVANCED', { outputSource: params.source }));
        break;

      case 'setTransitionRate':
        socket.write(formatCommand('VIDEO ADVANCED', { transitionRate: params.rate }));
        break;

      case 'renameUnit':
        state.name = params.name;
        this.names[state.index] = params.name;
        await this.saveNames();
        this.emit('stateChange', this.getAllState());
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Disconnect all units
   */
  disconnect() {
    for (const [unitId, timer] of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const [unitId, socket] of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    console.log('Teranex: Disconnected all units');
  }
}

// Export singleton instance
export default new TeranexManager();
