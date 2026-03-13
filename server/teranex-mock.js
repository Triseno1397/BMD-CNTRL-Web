import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Teranex Mock Manager
 * Simulates Teranex AV units for development without hardware
 *
 * State shape per unit matches the real Teranex protocol:
 * {
 *   id, name, connected, device: { modelName, protocolVersion },
 *   videoInput: { videoSource, videoMode, audioSource, signalPresent, ... },
 *   videoOutput: { videoMode, aspectRatio, ... },
 *   testPattern: { output, noSignal, horizontalMotion },
 *   videoAdvanced: { outputSource, transitionRate },
 *   procAmp: { gain, black, saturation, hue, ry, by, sharp }
 * }
 */
class TeranexMockManager extends EventEmitter {
  constructor() {
    super();
    this.units = [];
    this.names = {};
    this.namesFile = path.join(__dirname, '..', 'data', 'teranex-names.json');
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
   * Create default state for a mock unit
   */
  createMockUnit(index, defaultName) {
    const name = this.names[index] || defaultName;
    return {
      id: `teranex_${index + 1}`,
      index,
      name,
      connected: true,
      connecting: false,
      device: {
        modelName: 'Teranex AV',
        protocolVersion: '1.0'
      },
      videoInput: {
        autoDetectionEnabled: true,
        autoDetectionPreferPsF: false,
        videoSource: index === 0 ? 'SDI' : 'HDMI',
        videoMode: index === 0 ? '1080i5994' : '1080p25',
        audioSource: 'Embedded',
        signalPresent: true,
        timecodePresent: 'None',
        closedCaptioningPresent: 'None',
        wideSdAspect: false,
        hdmi3DFull: false,
        videoPixelFormat: 'YCbCr422'
      },
      videoOutput: {
        videoMode: index === 0 ? '720p50' : '2160p50',
        aspectRatio: index === 0 ? 'Anamorphic' : 'Letterbox',
        dualLink: false,
        videoPixelFormat: 'YCbCr422'
      },
      testPattern: {
        output: 'None',
        noSignal: 'Grid',
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
   * Initialize mock units
   */
  async connect() {
    console.log('Teranex: Starting in MOCK mode');

    await this.loadNames();

    // Create 2 mock units for testing
    this.units = [
      this.createMockUnit(0, 'Main Converter'),
      this.createMockUnit(1, 'Projector Feed')
    ];

    console.log(`✓ Teranex mock: ${this.units.length} units initialized`);

    // Emit initial state after a short delay to simulate connection
    setTimeout(() => {
      this.emit('stateChange', this.getAllState());
    }, 100);
  }

  /**
   * Get state for all units
   */
  getAllState() {
    return this.units;
  }

  /**
   * Get state for a specific unit
   */
  getUnitState(unitId) {
    return this.units.find(u => u.id === unitId);
  }

  /**
   * Send command to a unit
   */
  async sendCommand(unitId, command, params) {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      throw new Error(`Teranex unit ${unitId} not found`);
    }

    console.log(`Teranex Mock [${unit.name}]: ${command}`, params);

    switch (command) {
      case 'setVideoInput':
        this.handleSetVideoInput(unit, params);
        break;
      case 'setAudioInput':
        this.handleSetAudioInput(unit, params);
        break;
      case 'setVideoOutput':
        this.handleSetVideoOutput(unit, params);
        break;
      case 'setAspectRatio':
        this.handleSetAspectRatio(unit, params);
        break;
      case 'setTestPattern':
        this.handleSetTestPattern(unit, params);
        break;
      case 'setTestPatternMotion':
        this.handleSetTestPatternMotion(unit, params);
        break;
      case 'setNoSignal':
        this.handleSetNoSignal(unit, params);
        break;
      case 'setOutputSource':
        this.handleSetOutputSource(unit, params);
        break;
      case 'setTransitionRate':
        this.handleSetTransitionRate(unit, params);
        break;
      case 'renameUnit':
        await this.handleRenameUnit(unit, params);
        break;
      default:
        console.warn(`Teranex Mock: Unknown command: ${command}`);
    }
  }

  handleSetVideoInput(unit, params) {
    if (params.videoSource) {
      unit.videoInput.videoSource = params.videoSource;
    }
    this.emitStateChange();
  }

  handleSetAudioInput(unit, params) {
    if (params.audioSource) {
      unit.videoInput.audioSource = params.audioSource;
    }
    this.emitStateChange();
  }

  handleSetVideoOutput(unit, params) {
    if (params.videoMode) {
      unit.videoOutput.videoMode = params.videoMode;
    }
    this.emitStateChange();
  }

  handleSetAspectRatio(unit, params) {
    if (params.aspectRatio) {
      unit.videoOutput.aspectRatio = params.aspectRatio;
    }
    this.emitStateChange();
  }

  handleSetTestPattern(unit, params) {
    if (params.output !== undefined) {
      unit.testPattern.output = params.output;
    }
    this.emitStateChange();
  }

  handleSetTestPatternMotion(unit, params) {
    if (params.enabled !== undefined) {
      unit.testPattern.horizontalMotion = params.enabled;
    }
    this.emitStateChange();
  }

  handleSetNoSignal(unit, params) {
    if (params.noSignal) {
      unit.testPattern.noSignal = params.noSignal;
    }
    this.emitStateChange();
  }

  handleSetOutputSource(unit, params) {
    if (params.source) {
      unit.videoAdvanced.outputSource = params.source;
    }
    this.emitStateChange();
  }

  handleSetTransitionRate(unit, params) {
    if (params.rate !== undefined) {
      unit.videoAdvanced.transitionRate = params.rate;
    }
    this.emitStateChange();
  }

  async handleRenameUnit(unit, params) {
    if (params.name) {
      unit.name = params.name;
      this.names[unit.index] = params.name;
      await this.saveNames();
    }
    this.emitStateChange();
  }

  /**
   * Emit state change with small delay to simulate network latency
   */
  emitStateChange() {
    setTimeout(() => {
      this.emit('stateChange', this.getAllState());
    }, 50);
  }

  /**
   * Disconnect (no-op for mock)
   */
  disconnect() {
    console.log('Teranex Mock: Disconnected');
  }
}

// Export singleton instance
export default new TeranexMockManager();
