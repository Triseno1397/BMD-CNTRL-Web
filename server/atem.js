import { EventEmitter } from 'events';
import { Atem } from 'atem-connection';
import config from './config.js';

class ATEMManager extends EventEmitter {
  constructor() {
    super();
    this.state = null;
    this.connection = null;
  }

  /**
   * Initialize mock ATEM state
   * Mirrors the structure of real atem-connection state
   */
  initializeMockState() {
    this.state = {
      video: {
        mixEffects: [
          {
            index: 0,
            programInput: 1,  // Camera 1 on program
            previewInput: 2,  // Camera 2 on preview
            transitionSettings: {
              mix: {
                rate: 30  // 30 frames (~1 sec at 30fps)
              }
            },
            transitionPosition: {
              inTransition: false,
              remainingFrames: 0,
              handlePosition: 0
            },
            upstreamKeyers: [
              {
                index: 0,
                onAir: false,
                fillSource: 0,
                cutSource: 0
              }
            ],
            fadeToBlack: {
              isFullyBlack: false,
              inTransition: false,
              remainingFrames: 0,
              rate: 30
            }
          }
        ],
        downstreamKeyers: [
          {
            index: 0,
            onAir: false,
            tie: false,
            rate: 30,
            sources: {
              fillSource: 0,
              cutSource: 0
            }
          }
        ],
        auxilliaries: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 10 AUX buses, default to Cam 1
      },
      inputs: {
        0: { name: 'Black', longName: 'Black', internalPortType: 1 },
        1: { name: 'Cam 1', longName: 'Cam 1', internalPortType: 0 },
        2: { name: 'Cam 2', longName: 'Cam 2', internalPortType: 0 },
        3: { name: 'Cam 3', longName: 'Cam 3', internalPortType: 0 },
        4: { name: 'Cam 4', longName: 'Cam 4', internalPortType: 0 },
        5: { name: 'Cam 5', longName: 'Cam 5', internalPortType: 0 },
        6: { name: 'Cam 6', longName: 'Cam 6', internalPortType: 0 },
        7: { name: 'Cam 7', longName: 'Cam 7', internalPortType: 0 },
        8: { name: 'Cam 8', longName: 'Cam 8', internalPortType: 0 },
        1000: { name: 'Bars', longName: 'Color Bars', internalPortType: 2 },
        // TODO(hardware): Verify Media Player input IDs match target ATEM model
        3010: { name: 'MP 1', longName: 'Media Player 1', internalPortType: 4 },
        3020: { name: 'MP 2', longName: 'Media Player 2', internalPortType: 4 }
      }
    };

    console.log('✓ Mock ATEM state initialized');
  }

  /**
   * Initialize real ATEM connection
   * TODO(hardware): This requires physical ATEM hardware to test
   */
  async initializeRealConnection() {
    this.connection = new Atem();

    // DEBUG: Log ALL events to understand what's happening
    this.connection.on('info', (msg) => {
      console.log('[ATEM Info]', msg);
    });

    // Listen for connection state changes
    this.connection.on('connected', () => {
      console.log('✓ Connected to ATEM at', config.atemIp);

      // DEBUG: Log state immediately after connection
      setTimeout(() => {
        console.log('=== State Check (1 second after connect) ===');
        console.log('  MixEffects:', this.connection.state?.video?.mixEffects?.length || 0);
        console.log('  Inputs:', Object.keys(this.connection.state?.inputs || {}).length);
        if (this.connection.state?.video?.mixEffects?.[0]) {
          console.log('  ME0 exists:', true);
        }
        if (Object.keys(this.connection.state?.inputs || {}).length > 0) {
          console.log('  First 5 inputs:', Object.keys(this.connection.state.inputs).slice(0, 5));
        }
      }, 1000);
    });

    this.connection.on('disconnected', () => {
      console.log('✗ Disconnected from ATEM');
    });

    this.connection.on('error', (error) => {
      console.error('ATEM connection error:', error);
    });

    // Listen for state changes from ATEM
    this.connection.on('stateChanged', (state, pathToChange) => {
      this.state = state;

      // DEBUG: Log ALL state updates
      const path = pathToChange.join('.');
      console.log(`[State Update] ${path}`);

      // Extra logging for critical paths
      if (path.startsWith('video.mixEffects')) {
        console.log('  → MixEffects count:', state.video?.mixEffects?.length || 0);
        if (state.video?.mixEffects?.[0]) {
          console.log('  → ME0 preview:', state.video.mixEffects[0].previewInput);
          console.log('  → ME0 program:', state.video.mixEffects[0].programInput);
        }
      }
      if (path.startsWith('inputs')) {
        console.log('  → Total inputs:', Object.keys(state.inputs || {}).length);
      }

      this.emit('stateChange', this.state);
    });

    // Connect to ATEM
    try {
      await this.connection.connect(config.atemIp);
      this.state = this.connection.state;
      console.log('✓ Initial ATEM state received');
      console.log('  MixEffects:', this.state.video?.mixEffects?.length || 0);
      console.log('  Inputs:', Object.keys(this.state.inputs || {}).length);
      console.log('  Note: State may be incomplete, waiting for stateChanged events...');
    } catch (error) {
      console.error('Failed to connect to ATEM:', error.message);
      throw error;
    }
  }

  /**
   * Connect to ATEM (mock or real based on config)
   */
  async connect() {
    if (config.mockMode) {
      console.log('ATEM Mock Mode: ENABLED');
      this.initializeMockState();

      // Emit initial state after a short delay to simulate connection
      setTimeout(() => {
        this.emit('stateChange', this.state);
      }, 100);
    } else {
      console.log('ATEM Mock Mode: DISABLED');
      console.log('Connecting to ATEM at', config.atemIp);
      await this.initializeRealConnection();
    }
  }

  /**
   * Get current ATEM state
   */
  getState() {
    return this.state;
  }

  /**
   * Send command to ATEM
   * @param {string} command - Command name (matches atem-connection API)
   * @param {Object} args - Command arguments
   */
  async sendCommand(command, args) {
    if (config.mockMode) {
      console.log(`Mock command: ${command}`, args);
      await this.handleMockCommand(command, args);
      return;
    }

    // Real ATEM mode
    if (!this.connection) {
      throw new Error('ATEM connection not established');
    }

    // Execute command on real ATEM
    if (typeof this.connection[command] !== 'function') {
      throw new Error(`Unknown command: ${command}`);
    }

    // Call the command with args spread as parameters
    const commandArgs = this.buildCommandArgs(command, args);
    await this.connection[command](...commandArgs);

    console.log(`Executed ATEM command: ${command}`, args);
  }

  /**
   * Build argument array for ATEM command
   */
  buildCommandArgs(command, args) {
    switch (command) {
      case 'cut':
      case 'autoTransition':
        return [args.me ?? 0];
      case 'changePreviewInput':
      case 'changeProgramInput':
        return [args.input, args.me ?? 0];
      case 'setUpstreamKeyerOnAir':
        return [args.onAir, args.me ?? 0, args.keyer ?? 0];
      case 'setDownstreamKeyerOnAir':
        return [args.onAir, args.keyer ?? 0];
      case 'fadeToBlack':
        return [args.me ?? 0];
      case 'setAuxSource':
        // atem-connection API: setAuxSource(source: number, bus?: number)
        // Verified at: https://sofie-automation.github.io/sofie-atem-connection/classes/Atem.html
        return [args.input, args.auxBus ?? 0];
      default:
        // Generic fallback - convert args object to array
        return Object.values(args);
    }
  }

  /**
   * Handle mock command execution
   * Updates mock state and emits stateChange event
   */
  async handleMockCommand(command, args) {
    if (!this.state) {
      throw new Error('Mock state not initialized');
    }

    const me = args.me ?? 0;
    const mixEffect = this.state.video.mixEffects[me];

    if (!mixEffect) {
      throw new Error(`Mix Effect ${me} not found`);
    }

    switch (command) {
      case 'changePreviewInput': {
        const { input } = args;
        if (this.state.inputs[input] === undefined) {
          throw new Error(`Invalid input: ${input}`);
        }
        mixEffect.previewInput = input;
        console.log(`Mock: Preview input changed to ${input}`);
        break;
      }

      case 'cut': {
        // Swap program and preview
        const oldProgram = mixEffect.programInput;
        const oldPreview = mixEffect.previewInput;
        mixEffect.programInput = oldPreview;
        mixEffect.previewInput = oldProgram;
        console.log(`Mock: Cut executed (PGM: ${oldPreview}, PVW: ${oldProgram})`);
        break;
      }

      case 'autoTransition': {
        // Check if already transitioning
        if (mixEffect.transitionPosition.inTransition) {
          throw new Error('Transition already in progress');
        }

        // Get transition rate from settings
        const rate = mixEffect.transitionSettings.mix.rate;

        // Start transition - set in-progress state
        mixEffect.transitionPosition.inTransition = true;
        mixEffect.transitionPosition.remainingFrames = rate;
        mixEffect.transitionPosition.handlePosition = 0;

        // Save old values for swap
        const oldProgram = mixEffect.programInput;
        const oldPreview = mixEffect.previewInput;

        console.log(`Mock: AUTO transition started (${rate} frames)`);

        // Emit immediate state update (transition started)
        setTimeout(() => {
          this.emit('stateChange', this.state);
        }, 10);

        // Complete transition after delay
        setTimeout(() => {
          // Swap program/preview
          mixEffect.programInput = oldPreview;
          mixEffect.previewInput = oldProgram;

          // Reset transition state
          mixEffect.transitionPosition.inTransition = false;
          mixEffect.transitionPosition.remainingFrames = 0;
          mixEffect.transitionPosition.handlePosition = 10000;

          console.log(`Mock: AUTO transition completed (PGM: ${oldPreview}, PVW: ${oldProgram})`);

          // Emit completion state
          this.emit('stateChange', this.state);
        }, rate * 33); // ~33ms per frame at 30fps

        break;
      }

      case 'setUpstreamKeyerOnAir': {
        const { onAir, keyer = 0 } = args;
        const upstreamKeyer = mixEffect.upstreamKeyers[keyer];

        if (!upstreamKeyer) {
          throw new Error(`Upstream Keyer ${keyer} not found on M/E ${me}`);
        }

        upstreamKeyer.onAir = onAir;
        console.log(`Mock: USK${keyer + 1} on M/E${me + 1} turned ${onAir ? 'ON' : 'OFF'}`);
        break;
      }

      case 'setDownstreamKeyerOnAir': {
        const { onAir, keyer = 0 } = args;
        const downstreamKeyer = this.state.video.downstreamKeyers[keyer];

        if (!downstreamKeyer) {
          throw new Error(`Downstream Keyer ${keyer} not found`);
        }

        downstreamKeyer.onAir = onAir;
        console.log(`Mock: DSK${keyer + 1} turned ${onAir ? 'ON' : 'OFF'}`);
        break;
      }

      case 'fadeToBlack': {
        const ftb = mixEffect.fadeToBlack;
        if (ftb.inTransition) {
          // Toggle cancels in-progress FTB
          ftb.inTransition = false;
          ftb.isFullyBlack = false;
          ftb.remainingFrames = 0;
          console.log('Mock: FTB cancelled');
        } else {
          // Start FTB transition
          ftb.inTransition = true;
          ftb.remainingFrames = ftb.rate;
          const rate = ftb.rate;
          const targetBlack = !ftb.isFullyBlack;

          console.log(`Mock: FTB transition started (${rate} frames, target: ${targetBlack ? 'BLACK' : 'LIVE'})`);

          // Emit immediate state update (transition started)
          setTimeout(() => {
            this.emit('stateChange', this.state);
          }, 10);

          // Complete transition after delay
          setTimeout(() => {
            ftb.inTransition = false;
            ftb.isFullyBlack = targetBlack;
            ftb.remainingFrames = 0;
            console.log(`Mock: FTB completed (now ${ftb.isFullyBlack ? 'BLACK' : 'LIVE'})`);
            this.emit('stateChange', this.state);
          }, rate * 33); // ~33ms per frame at 30fps
        }
        break;
      }

      case 'setAuxSource': {
        const { input, auxBus = 0 } = args;

        // Validate AUX bus index (0-9)
        if (auxBus < 0 || auxBus >= this.state.video.auxilliaries.length) {
          throw new Error(`Invalid AUX bus: ${auxBus}`);
        }

        // Validate input exists
        if (this.state.inputs[input] === undefined) {
          throw new Error(`Invalid input: ${input}`);
        }

        this.state.video.auxilliaries[auxBus] = input;
        console.log(`Mock: AUX ${auxBus + 1} routed to input ${input}`);
        break;
      }

      default:
        throw new Error(`Mock mode: Unimplemented command: ${command}`);
    }

    // Emit state change to trigger broadcast
    // Small delay to simulate ATEM response time
    setTimeout(() => {
      this.emit('stateChange', this.state);
    }, 50);
  }
}

export default new ATEMManager();
