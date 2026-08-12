import { WebSocketServer } from 'ws';
import config from './config.js';

/**
 * WebSocket Manager
 * Handles client connections and message routing for multiple devices (ATEM, VideoHub)
 *
 * State message format: { type: 'state', data: { atem: {...}, videohub: {...}, deviceStatus: {...}, configuredDevices: [...] } }
 * Command message format: { type: 'command', device: 'atem'|'videohub', command: '...', params: {...} }
 */
class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.stateProviders = {};   // { atem: fn, videohub: fn }
    this.commandHandlers = {};  // { atem: fn, videohub: fn }
    this.deviceStatusProvider = null;  // Function to get device status
    this.configuredDevicesProvider = null;  // Function to get configured device types
    this.heartbeatInterval = null;  // Interval for ping/pong heartbeat
  }

  /**
   * Set provider for device connection status
   * @param {Function} fn - Function that returns { atem: 'connected'|'disconnected', videohub: ..., hyperdecks: {connected: n, total: n}, teranexes: ... }
   */
  setDeviceStatusProvider(fn) {
    this.deviceStatusProvider = fn;
  }

  /**
   * Set provider for configured device types
   * @param {Function} fn - Function that returns array of configured device types ['atem', 'videohub', ...]
   */
  setConfiguredDevicesProvider(fn) {
    this.configuredDevicesProvider = fn;
  }

  /**
   * Set state provider for a device
   * @param {string} device - Device name ('atem' or 'videohub')
   * @param {Function} fn - Function that returns current state for this device
   */
  setStateProvider(device, fn) {
    this.stateProviders[device] = fn;
  }

  /**
   * Set command handler for a device
   * @param {string} device - Device name ('atem' or 'videohub')
   * @param {Function} fn - Async function that handles commands for this device
   */
  setCommandHandler(device, fn) {
    this.commandHandlers[device] = fn;
  }

  /**
   * Get combined state from all devices
   */
  getCombinedState() {
    const state = {};
    for (const [device, provider] of Object.entries(this.stateProviders)) {
      state[device] = provider();
    }

    // Add device status for navigation drawer LEDs
    if (this.deviceStatusProvider) {
      state.deviceStatus = this.deviceStatusProvider();
    }

    // Add configured device types for dynamic navigation
    if (this.configuredDevicesProvider) {
      state.configuredDevices = this.configuredDevicesProvider();
    }

    return state;
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} httpServer - HTTP server to attach WebSocket to
   */
  initialize(httpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,  // Attach to HTTP server (same port)
      perMessageDeflate: false  // Disable compression for lower latency
    });

    this.wss.on('listening', () => {
      console.log(`✓ WebSocket server attached to HTTP server`);
    });

    // Start heartbeat interval to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (client.isAlive === false) {
          console.log('Terminating unresponsive WebSocket client');
          this.clients.delete(client);
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000); // 30 second heartbeat

    this.wss.on('connection', (ws, request) => {
      const clientIp = request.socket.remoteAddress;
      console.log(`WebSocket client connected from ${clientIp}`);

      // Initialize heartbeat tracking
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Add client to set
      this.clients.add(ws);

      // Send initial combined state
      this.sendInitialState(ws);

      // Handle client disconnection
      ws.on('close', () => {
        console.log(`WebSocket client disconnected from ${clientIp}`);
        this.clients.delete(ws);
      });

      // Handle client errors
      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
        this.clients.delete(ws);
      });

      // Handle incoming messages from client
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('Received message from client:', message);

          if (message.type === 'command') {
            this.handleCommand(ws, message);
          }
        } catch (error) {
          console.error('Failed to parse client message:', error);
        }
      });
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Send initial combined state to a specific client
   */
  sendInitialState(ws) {
    if (ws.readyState !== ws.OPEN) return;

    const combinedState = this.getCombinedState();

    ws.send(JSON.stringify({
      type: 'state',
      data: combinedState
    }));
    console.log('Sent initial state to client (devices:', Object.keys(combinedState).join(', ') + ')');
  }

  /**
   * Broadcast combined state update to all connected clients
   */
  broadcastState() {
    const combinedState = this.getCombinedState();
    const message = JSON.stringify({
      type: 'state',
      data: combinedState
    });

    let sentCount = 0;
    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      console.log(`Broadcasted state to ${sentCount} client(s)`);
    }
  }

  /**
   * Handle command from client
   * Routes to appropriate device handler based on 'device' field
   * @param {WebSocket} ws - Client WebSocket connection
   * @param {Object} message - Command message { device, command, params|args }
   */
  async handleCommand(ws, message) {
    // Support both old format (no device = atem) and new format
    const device = message.device || 'atem';
    const command = message.command;
    // Support both 'params' (new) and 'args' (old) for backward compatibility
    const params = message.params || message.args || {};

    const handler = this.commandHandlers[device];
    if (!handler) {
      this.sendError(ws, command, `Unknown device: ${device}`);
      return;
    }

    try {
      await handler(command, params);
      // Success: no response needed - state broadcast will confirm
    } catch (error) {
      console.error(`Command failed (${device}/${command}):`, error);
      this.sendError(ws, command, error.message);
    }
  }

  /**
   * Send error response to client
   */
  sendError(ws, command, errorMessage) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'commandError',
        command,
        error: errorMessage
      }));
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Shutdown WebSocket server and cleanup
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

export default new WebSocketManager();
