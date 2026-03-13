import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';
import atemManager from './atem.js';
import websocketManager from './websocket.js';
import deviceConfig from './device-config.js';
import networkScanner from './network-scanner.js';

// Import VideoHub manager (mock or real based on config)
let videohubManager;
if (config.videohubMockMode) {
  videohubManager = (await import('./videohub-mock.js')).default;
} else {
  videohubManager = (await import('./videohub.js')).default;
}

// Import HyperDeck manager (mock or real based on config)
let hyperdeckManager;
if (config.hyperdeckMockMode) {
  hyperdeckManager = (await import('./hyperdeck-mock.js')).default;
} else {
  hyperdeckManager = (await import('./hyperdeck-manager.js')).default;
}

// Import Teranex manager (mock or real based on config)
let teranexManager;
if (config.teranexMockMode) {
  teranexManager = (await import('./teranex-mock.js')).default;
} else {
  teranexManager = (await import('./teranex.js')).default;
}

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// JSON body parser for REST API
app.use(express.json());

// Serve built frontend
app.use(express.static(join(__dirname, '../client/dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    atem: {
      mockMode: config.mockMode,
      connected: atemManager.getState()?.connected !== false
    },
    videohub: {
      mockMode: config.videohubMockMode,
      connected: videohubManager.getState()?.connected || false
    },
    hyperdecks: {
      mockMode: config.hyperdeckMockMode,
      deckCount: hyperdeckManager.getAllState()?.length || 0,
      connectedCount: hyperdeckManager.getAllState()?.filter(d => d.connected).length || 0
    },
    teranexes: {
      mockMode: config.teranexMockMode,
      unitCount: teranexManager.getAllState()?.length || 0,
      connectedCount: teranexManager.getAllState()?.filter(t => t.connected).length || 0
    },
    connectedClients: websocketManager.getClientCount(),
    timestamp: new Date().toISOString()
  });
});

// === Device Configuration REST API ===

// GET /api/devices - List all configured devices with status
app.get('/api/devices', (req, res) => {
  try {
    const devices = deviceConfig.getAll();
    const devicesWithStatus = devices.map(d => ({
      ...d,
      status: getDeviceConnectionStatus(d)
    }));
    res.json(devicesWithStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/devices - Add new device
app.post('/api/devices', async (req, res) => {
  try {
    const { type, name, ip } = req.body;
    const newDevice = await deviceConfig.addDevice({ type, name, ip });

    // TODO: Trigger connection to new device
    // For now, return the device - connection will happen on next restart

    res.json({
      ...newDevice,
      status: 'disconnected'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/devices/:id - Update device (rename, change IP)
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ip } = req.body;
    const updated = await deviceConfig.updateDevice(id, { name, ip });

    // Broadcast state to update all clients with new device name
    websocketManager.broadcastState();

    res.json({
      ...updated,
      status: getDeviceConnectionStatus(updated)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/devices/:id - Remove device
app.delete('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deviceConfig.deleteDevice(id);

    // Broadcast state to update navigation
    websocketManager.broadcastState();

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/scan - Network scan for BMD devices
app.post('/api/scan', async (req, res) => {
  try {
    const { subnet } = req.body;

    // Use mock scanner in mock mode
    const scanner = config.mockMode ? networkScanner.scanNetworkMock : networkScanner.scanNetwork;

    const results = await scanner({ subnet });
    res.json({
      status: 'complete',
      found: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Get connection status for a device
function getDeviceConnectionStatus(device) {
  // This is a simplified version - actual status comes from device managers
  // For now, return based on whether managers report connection
  try {
    switch (device.type) {
      case 'atem': {
        const state = atemManager.getState();
        return state?.connected !== false ? 'connected' : 'disconnected';
      }
      case 'videohub': {
        const state = videohubManager?.getState();
        return state?.connected ? 'connected' : 'disconnected';
      }
      case 'hyperdeck': {
        const decks = hyperdeckManager?.getAllState() || [];
        const deck = decks.find(d => d.id === device.id || d.ip === device.ip);
        if (deck?.connecting) return 'connecting';
        return deck?.connected ? 'connected' : 'disconnected';
      }
      case 'teranex': {
        const units = teranexManager?.getAllState() || [];
        const unit = units.find(u => u.id === device.id || u.ip === device.ip);
        if (unit?.connecting) return 'connecting';
        return unit?.connected ? 'connected' : 'disconnected';
      }
      default:
        return 'disconnected';
    }
  } catch {
    return 'disconnected';
  }
}

// Catch-all: serve index.html for any non-API route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

// CORS headers for development (allow frontend to access from different port)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

/**
 * Initialize and start the server
 */
async function start() {
  console.log('\n=== BMD Control Server ===\n');

  try {
    // 0. Load device configuration
    await deviceConfig.loadConfig();
    console.log('✓ Device configuration loaded');

    // 1. Initialize ATEM connection
    await atemManager.connect();

    // 2. Initialize VideoHub connection
    await videohubManager.connect();

    // 3. Initialize HyperDeck connections
    await hyperdeckManager.connect();

    // 4. Initialize Teranex connections
    await teranexManager.connect();

    // 5. Create HTTP server
    const server = http.createServer(app);

    // 6. Initialize WebSocket server (attached to HTTP server)
    websocketManager.initialize(server);

    // 7. Set state providers for each device
    websocketManager.setStateProvider('atem', () => atemManager.getState());
    websocketManager.setStateProvider('videohub', () => videohubManager.getState());
    websocketManager.setStateProvider('hyperdecks', () => hyperdeckManager.getAllState());
    websocketManager.setStateProvider('teranexes', () => teranexManager.getAllState());

    // 7b. Set device status provider for navigation drawer
    websocketManager.setDeviceStatusProvider(() => {
      const hyperdecks = hyperdeckManager.getAllState() || [];
      const teranexes = teranexManager.getAllState() || [];

      return {
        atem: atemManager.getState()?.connected !== false ? 'connected' : 'disconnected',
        videohub: videohubManager.getState()?.connected ? 'connected' : 'disconnected',
        hyperdecks: {
          connected: hyperdecks.filter(d => d.connected).length,
          total: hyperdecks.length
        },
        teranexes: {
          connected: teranexes.filter(t => t.connected).length,
          total: teranexes.length
        }
      };
    });

    // 7c. Set configured devices provider for dynamic navigation
    websocketManager.setConfiguredDevicesProvider(() => {
      return deviceConfig.getConfiguredTypes();
    });

    // 8. Wire up state changes to WebSocket broadcasts
    atemManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });
    videohubManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });
    hyperdeckManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });
    teranexManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });

    // 9. Set command handlers for each device
    websocketManager.setCommandHandler('atem', async (command, params) => {
      await atemManager.sendCommand(command, params);
    });
    websocketManager.setCommandHandler('videohub', async (command, params) => {
      await videohubManager.sendCommand(command, params);
    });
    websocketManager.setCommandHandler('hyperdeck', async (command, params) => {
      // params should include deckId (or 'all' for broadcast)
      const deckId = params.deckId || params.deck;
      await hyperdeckManager.sendCommand(deckId, command, params);
    });
    websocketManager.setCommandHandler('teranex', async (command, params) => {
      // params should include unitId
      const unitId = params.unitId || params.unit;
      await teranexManager.sendCommand(unitId, command, params);
    });

    // 10. Start HTTP server (serves both HTTP and WebSocket)
    server.listen(config.serverPort, '0.0.0.0', () => {
      console.log(`✓ Server listening on port ${config.serverPort} (HTTP + WebSocket)`);
      console.log(`\nServer ready!`);
      console.log(`- Health check: http://localhost:${config.serverPort}/health`);
      console.log(`- WebSocket: ws://localhost:${config.serverPort}`);
      if (!config.mockMode) {
        console.log(`- ATEM IP: ${config.atemIp}`);
      }
      if (!config.videohubMockMode) {
        console.log(`- VideoHub IP: ${config.videohubIp}`);
      }
      if (!config.hyperdeckMockMode && config.hyperdecks.length > 0) {
        console.log(`- HyperDecks: ${config.hyperdecks.map(d => d.name).join(', ')}`);
      }
      if (!config.teranexMockMode && config.teranexes.length > 0) {
        console.log(`- Teranexes: ${config.teranexes.map(t => t.name).join(', ')}`);
      }
      console.log('\nPress Ctrl+C to stop\n');
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down gracefully...');
      videohubManager.disconnect?.();
      hyperdeckManager.disconnect?.();
      teranexManager.disconnect?.();
      server.close(() => {
        console.log('HTTP server closed');
        websocketManager.wss.close(() => {
          console.log('WebSocket server closed');
          process.exit(0);
        });
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
start();
