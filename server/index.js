import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';
import atemManager from './atem.js';
import websocketManager from './websocket.js';

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

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    connectedClients: websocketManager.getClientCount(),
    timestamp: new Date().toISOString()
  });
});

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
    // 1. Initialize ATEM connection
    await atemManager.connect();

    // 2. Initialize VideoHub connection
    await videohubManager.connect();

    // 3. Initialize HyperDeck connections
    await hyperdeckManager.connect();

    // 4. Create HTTP server
    const server = http.createServer(app);

    // 5. Initialize WebSocket server (attached to HTTP server)
    websocketManager.initialize(server);

    // 6. Set state providers for each device
    websocketManager.setStateProvider('atem', () => atemManager.getState());
    websocketManager.setStateProvider('videohub', () => videohubManager.getState());
    websocketManager.setStateProvider('hyperdecks', () => hyperdeckManager.getAllState());

    // 7. Wire up state changes to WebSocket broadcasts
    atemManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });
    videohubManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });
    hyperdeckManager.on('stateChange', () => {
      websocketManager.broadcastState();
    });

    // 8. Set command handlers for each device
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

    // 9. Start HTTP server (serves both HTTP and WebSocket)
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
      console.log('\nPress Ctrl+C to stop\n');
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down gracefully...');
      videohubManager.disconnect?.();
      hyperdeckManager.disconnect?.();
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
