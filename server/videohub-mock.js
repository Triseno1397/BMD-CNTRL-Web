import { EventEmitter } from 'events';

/**
 * Mock VideoHub Manager
 * Simulates a 20x20 Blackmagic VideoHub for development without hardware
 *
 * State shape:
 * {
 *   connected: boolean,
 *   device: { present: boolean, model: string, inputCount: number, outputCount: number },
 *   inputs: { [index: number]: { label: string } },
 *   outputs: { [index: number]: { label: string, route: number, lock: 'U' | 'O' | 'L' } }
 * }
 *
 * Lock states:
 * - 'U' = Unlocked
 * - 'O' = Owned (locked by this client)
 * - 'L' = Locked (locked by another client)
 */
class VideoHubMock extends EventEmitter {
  constructor() {
    super();
    this.state = {
      connected: false,
      device: null,
      inputs: {},
      outputs: {}
    };
  }

  /**
   * Initialize mock VideoHub state
   */
  async connect() {
    const inputCount = 20;
    const outputCount = 20;

    this.state = {
      connected: true,
      device: {
        present: true,
        model: 'Smart Videohub 20x20 (Mock)',
        inputCount,
        outputCount
      },
      inputs: {},
      outputs: {}
    };

    // Initialize inputs with default labels
    for (let i = 0; i < inputCount; i++) {
      this.state.inputs[i] = { label: `Input ${i + 1}` };
    }

    // Give some inputs meaningful names for demo
    this.state.inputs[0].label = 'Camera 1';
    this.state.inputs[1].label = 'Camera 2';
    this.state.inputs[2].label = 'Camera 3';
    this.state.inputs[3].label = 'Camera 4';
    this.state.inputs[4].label = 'Graphics';
    this.state.inputs[5].label = 'Playback';
    this.state.inputs[6].label = 'ATEM PGM';
    this.state.inputs[7].label = 'ATEM PVW';

    // Initialize outputs with default routing (output N -> input N)
    for (let i = 0; i < outputCount; i++) {
      this.state.outputs[i] = {
        label: `Output ${i + 1}`,
        route: i < inputCount ? i : 0, // Route to same-numbered input, or 0 if out of range
        lock: 'U' // All unlocked by default
      };
    }

    // Give some outputs meaningful names for demo
    this.state.outputs[0].label = 'Program Monitor';
    this.state.outputs[1].label = 'Preview Monitor';
    this.state.outputs[2].label = 'Multiview';
    this.state.outputs[3].label = 'Record';
    this.state.outputs[4].label = 'Stream';

    // Simulate one locked output for testing
    this.state.outputs[19].label = 'Locked Out';
    this.state.outputs[19].lock = 'L';

    console.log(`✓ VideoHub connected (Mock: ${inputCount}x${outputCount})`);

    // Emit initial state after short delay (simulates real connection)
    setTimeout(() => {
      this.emit('stateChange', this.state);
    }, 100);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Handle commands
   * @param {string} command - Command name
   * @param {Object} params - Command parameters
   */
  async sendCommand(command, params) {
    if (!this.state.connected) {
      throw new Error('VideoHub not connected');
    }

    switch (command) {
      case 'route':
        await this.handleRoute(params);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Route an output to an input
   * @param {Object} params - { output: number, input: number }
   */
  async handleRoute({ output, input }) {
    const outputState = this.state.outputs[output];

    if (!outputState) {
      throw new Error(`Output ${output} not found`);
    }

    if (outputState.lock === 'L') {
      throw new Error(`Output ${output} is locked by another client`);
    }

    const inputState = this.state.inputs[input];
    if (!inputState) {
      throw new Error(`Input ${input} not found`);
    }

    // Update routing
    outputState.route = input;

    console.log(`VideoHub: Routed output ${output} (${outputState.label}) -> input ${input} (${inputState.label})`);

    // Emit state change after short delay (simulates real device response)
    setTimeout(() => {
      this.emit('stateChange', this.state);
    }, 50);
  }

  /**
   * Disconnect (for cleanup)
   */
  disconnect() {
    this.state.connected = false;
    console.log('VideoHub Mock: Disconnected');
  }
}

// Export singleton instance
export default new VideoHubMock();
