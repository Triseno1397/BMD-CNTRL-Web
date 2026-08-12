import { EventEmitter } from 'events';
import { Socket } from 'net';
import config from './config.js';

/**
 * VideoHub Manager
 * TCP client for Blackmagic VideoHub devices (port 9990)
 *
 * Protocol: Text-based, blocks separated by blank lines (\n\n)
 * Device sends full state dump on connect, then incremental updates.
 *
 * State shape:
 * {
 *   connected: boolean,
 *   device: { present: boolean, model: string, inputCount: number, outputCount: number },
 *   inputs: { [index: number]: { label: string } },
 *   outputs: { [index: number]: { label: string, route: number, lock: 'U' | 'O' | 'L' } }
 * }
 */
class VideoHubManager extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.buffer = ''; // Critical: TCP buffering for incomplete messages
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    // FIX: Add pending command tracking for ACK/NAK validation
    this.pendingCommand = null;
    // Store device config for reconnection
    this.deviceConfig = null;
    this.state = {
      connected: false,
      device: null,
      inputs: {},
      outputs: {}
    };
  }

  /**
   * Connect to VideoHub
   * @param {Object} deviceConfig - Optional device config from device-config.json
   */
  async connect(deviceConfig = null) {
    // Store device config for reconnection (only update if provided)
    if (deviceConfig) {
      this.deviceConfig = deviceConfig;
    }
    // Use stored device config if available, otherwise fall back to env vars
    const ip = this.deviceConfig?.ip || config.videohubIp;
    const port = this.deviceConfig?.port || config.videohubPort;

    return new Promise((resolve, reject) => {
      this.socket = new Socket();

      this.socket.on('connect', () => {
        console.log(`✓ VideoHub connected to ${ip}:${port}`);
        this.state.connected = true;
        this.reconnectDelay = 1000; // Reset reconnect delay on successful connection
        resolve();
      });

      this.socket.on('data', (chunk) => {
        this.handleData(chunk);
      });

      this.socket.on('close', () => {
        console.log('VideoHub: Connection closed');
        this.state.connected = false;
        this.emit('stateChange', this.state);
        this.scheduleReconnect();
      });

      this.socket.on('error', (error) => {
        console.error('VideoHub connection error:', error.message);
        if (!this.state.connected) {
          // Initial connection failed
          reject(error);
        }
      });

      console.log(`Connecting to VideoHub at ${ip}:${port}...`);
      this.socket.connect(port, ip);
    });
  }

  /**
   * Handle incoming TCP data
   * Critical: TCP delivers data in arbitrary chunks, must buffer and parse complete blocks
   */
  handleData(chunk) {
    this.buffer += chunk.toString('utf8');

    // Process complete blocks (terminated by \n\n)
    let blockEnd;
    while ((blockEnd = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.substring(0, blockEnd);
      this.buffer = this.buffer.substring(blockEnd + 2);

      if (block.trim()) {
        this.parseBlock(block.trim());
      }
    }
  }

  /**
   * Parse a complete protocol block
   */
  parseBlock(block) {
    const lines = block.split('\n');
    if (lines.length === 0) return;

    // First line is the header (e.g., "INPUT LABELS:")
    const headerLine = lines[0];
    const header = headerLine.replace(':', '').trim();
    const dataLines = lines.slice(1);

    switch (header) {
      case 'PROTOCOL PREAMBLE':
        this.parseProtocolPreamble(dataLines);
        break;
      case 'VIDEOHUB DEVICE':
        this.parseDeviceInfo(dataLines);
        break;
      case 'INPUT LABELS':
        this.parseInputLabels(dataLines);
        break;
      case 'OUTPUT LABELS':
        this.parseOutputLabels(dataLines);
        break;
      case 'VIDEO OUTPUT ROUTING':
        this.parseRouting(dataLines);
        break;
      case 'VIDEO OUTPUT LOCKS':
        this.parseLocks(dataLines);
        break;
      case 'ACK':
        // FIX: Resolve pending command on ACK
        if (this.pendingCommand) {
          this.pendingCommand.resolve();
          this.pendingCommand = null;
        }
        break;
      case 'NAK':
        console.error('VideoHub: Command rejected (NAK)');
        // FIX: Reject pending command on NAK
        if (this.pendingCommand) {
          this.pendingCommand.reject(new Error('Command rejected by VideoHub'));
          this.pendingCommand = null;
        }
        break;
      default:
        // Unknown block type, ignore
        break;
    }

    // Emit state change after any block
    this.emit('stateChange', this.state);
  }

  /**
   * Parse protocol preamble (version info)
   */
  parseProtocolPreamble(lines) {
    for (const line of lines) {
      if (line.startsWith('Version:')) {
        const version = line.substring('Version:'.length).trim();
        console.log(`VideoHub protocol version: ${version}`);
      }
    }
  }

  /**
   * Parse device info block
   */
  parseDeviceInfo(lines) {
    const device = {
      present: false,
      model: 'Unknown',
      inputCount: 0,
      outputCount: 0
    };

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      switch (key.trim()) {
        case 'Device present':
          device.present = value === 'true';
          break;
        case 'Model name':
          device.model = value;
          break;
        case 'Video inputs':
          device.inputCount = parseInt(value, 10);
          break;
        case 'Video outputs':
          device.outputCount = parseInt(value, 10);
          break;
      }
    }

    this.state.device = device;
    console.log(`VideoHub device: ${device.model} (${device.inputCount}x${device.outputCount})`);
  }

  /**
   * Parse input labels
   * Format: "index label text" (first space separates index from label)
   */
  parseInputLabels(lines) {
    for (const line of lines) {
      const spaceIndex = line.indexOf(' ');
      if (spaceIndex === -1) continue;

      const index = parseInt(line.substring(0, spaceIndex), 10);
      const label = line.substring(spaceIndex + 1);

      if (!isNaN(index)) {
        if (!this.state.inputs[index]) {
          this.state.inputs[index] = {};
        }
        this.state.inputs[index].label = label;
      }
    }
  }

  /**
   * Parse output labels
   * Format: "index label text"
   */
  parseOutputLabels(lines) {
    for (const line of lines) {
      const spaceIndex = line.indexOf(' ');
      if (spaceIndex === -1) continue;

      const index = parseInt(line.substring(0, spaceIndex), 10);
      const label = line.substring(spaceIndex + 1);

      if (!isNaN(index)) {
        if (!this.state.outputs[index]) {
          this.state.outputs[index] = { route: 0, lock: 'U' };
        }
        this.state.outputs[index].label = label;
      }
    }
  }

  /**
   * Parse video output routing
   * Format: "output_index input_index"
   */
  parseRouting(lines) {
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 2) continue;

      const outputIndex = parseInt(parts[0], 10);
      const inputIndex = parseInt(parts[1], 10);

      if (!isNaN(outputIndex) && !isNaN(inputIndex)) {
        if (!this.state.outputs[outputIndex]) {
          this.state.outputs[outputIndex] = { label: `Output ${outputIndex + 1}`, lock: 'U' };
        }
        this.state.outputs[outputIndex].route = inputIndex;
      }
    }
  }

  /**
   * Parse video output locks
   * Format: "output_index lock_state" (U=unlocked, O=owned, L=locked)
   */
  parseLocks(lines) {
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 2) continue;

      const outputIndex = parseInt(parts[0], 10);
      const lockState = parts[1];

      if (!isNaN(outputIndex) && ['U', 'O', 'L'].includes(lockState)) {
        if (!this.state.outputs[outputIndex]) {
          this.state.outputs[outputIndex] = { label: `Output ${outputIndex + 1}`, route: 0 };
        }
        this.state.outputs[outputIndex].lock = lockState;
      }
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    console.log(`VideoHub: Reconnecting in ${this.reconnectDelay / 1000}s...`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Double the delay for next attempt, up to max
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Send command to VideoHub
   */
  async sendCommand(command, params) {
    if (!this.state.connected) {
      throw new Error('VideoHub not connected');
    }

    switch (command) {
      case 'route':
        await this.sendRoute(params.output, params.input);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Send routing command
   * Format: "VIDEO OUTPUT ROUTING:\n<output> <input>\n\n"
   * FIX: Wait for ACK/NAK response with timeout to prevent silent failures
   */
  async sendRoute(output, input) {
    const outputState = this.state.outputs[output];

    if (!outputState) {
      throw new Error(`Output ${output} not found`);
    }

    if (outputState.lock === 'L') {
      throw new Error(`Output ${output} is locked`);
    }

    // FIX: Wait for ACK/NAK with timeout to ensure command success/failure is reported
    return new Promise((resolve, reject) => {
      const COMMAND_TIMEOUT_MS = 5000;

      const timeout = setTimeout(() => {
        if (this.pendingCommand) {
          this.pendingCommand = null;
          reject(new Error('VideoHub command timed out'));
        }
      }, COMMAND_TIMEOUT_MS);

      this.pendingCommand = {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };

      const command = `VIDEO OUTPUT ROUTING:\n${output} ${input}\n\n`;

      try {
        if (!this.socket || !this.socket.writable) {
          clearTimeout(timeout);
          this.pendingCommand = null;
          throw new Error('VideoHub socket not writable');
        }
        this.socket.write(command);
        console.log(`VideoHub: Sending route command - output ${output} -> input ${input}`);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingCommand = null;
        reject(err);
      }
    });
  }

  /**
   * Disconnect from VideoHub
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.state.connected = false;
    console.log('VideoHub: Disconnected');
  }
}

// Export singleton instance
export default new VideoHubManager();
