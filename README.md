# ATEM Control Application

A professional-grade ATEM switcher control application built for live production environments.

**Quality bar:** It should feel like Blackmagic Design shipped it.

## Current Status

**Phase 1, Feature 1: WebSocket State Sync ✓**

The backend skeleton is complete with:
- WebSocket server for real-time state synchronization
- Mock mode for development without ATEM hardware
- Express HTTP server with health check endpoint
- Modular architecture ready for frontend integration

## Quick Start

### Prerequisites

- Node.js 18+ installed
- ATEM switcher (optional - mock mode available)

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

Edit `.env` file:

```bash
# Mock mode (no hardware needed)
ATEM_MOCK=true

# Real ATEM mode (requires hardware)
ATEM_MOCK=false
ATEM_IP=192.168.1.240

# Server ports
SERVER_PORT=3000
WS_PORT=3001
```

### Running the Server

```bash
# Production mode
npm start

# Development mode (auto-restart on file changes)
npm run dev
```

Expected output:
```
=== ATEM Control Server ===

ATEM Mock Mode: ENABLED
✓ Mock ATEM state initialized
✓ WebSocket server listening on port 3001
✓ HTTP server listening on port 3000 (all interfaces)

Server ready!
- Health check: http://localhost:3000/health
- WebSocket: ws://localhost:3001

Press Ctrl+C to stop
```

## Testing

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "mockMode": true,
  "connectedClients": 0,
  "timestamp": "2026-02-24T..."
}
```

### WebSocket Test

Using `wscat`:

```bash
# Install wscat globally
npm install -g wscat

# Connect to WebSocket server
wscat -c ws://localhost:3001
```

You should immediately receive the current ATEM state as JSON.

Using browser console:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('ATEM State:', message.data);
};
```

## Project Structure

```
/
├── server/
│   ├── index.js          # Main entry point, Express + WebSocket setup
│   ├── atem.js           # ATEM connection, state management, mock mode
│   ├── websocket.js      # WebSocket server, client management
│   └── config.js         # Environment configuration loader
├── directives/
│   └── websocket_state_sync.md  # Directive for state sync pattern
├── execution/            # (Reserved for Python tools)
├── .tmp/                 # (Temporary/intermediate files)
├── .env                  # Environment variables (DO NOT COMMIT)
├── package.json
├── CLAUDE.md             # Project instructions for AI agents
├── AGENTS.md             # 3-layer architecture documentation
└── README.md             # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ATEM_MOCK` | Enable mock mode (true/false) | `true` |
| `ATEM_IP` | ATEM switcher IP address | `192.168.1.240` |
| `SERVER_PORT` | HTTP server port | `3000` |
| `WS_PORT` | WebSocket server port | `3001` |

## Architecture

### State Flow

```
ATEM Hardware (or Mock)
    ↕ (atem-connection / UDP)
Node.js Backend  ←→  In-memory state store
    ↕ (WebSocket)
React Frontend   ←→  Derived UI state only
```

### Core Principles

1. **UI state is always derived from real ATEM state** - never local assumptions
2. **No silent failures** - every error surfaces visibly
3. **Connection status is always unambiguous** - live, reconnecting, or disconnected
4. **No ghost toggles** - buttons reflect the switcher, not local guesses
5. **Architecture stays modular** - no hardcoded assumptions

## Mock Mode

Mock mode simulates a realistic ATEM switcher:

- **8 camera inputs** (Camera 1-8)
- **M/E 0** with Camera 1 on program, Camera 2 on preview
- **USK1** (upstream keyer 1) - off
- **DSK1** (downstream keyer 1) - off
- **Transition settings** - Mix transition, 30 frame rate

No ATEM hardware required. Perfect for:
- Frontend development
- Testing UI components
- Demos and screenshots
- CI/CD pipelines

## Development

### Server Ports

- **HTTP Server**: `0.0.0.0:3000` (accessible from network)
- **WebSocket**: `0.0.0.0:3001` (accessible from network)

Access from mobile device on same network:
- Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Connect to: `http://<your-ip>:3000` (frontend, when built)
- WebSocket connects automatically to same IP

### Next Steps (Not Yet Implemented)

Phase 1 remaining features:
- [ ] Feature 2: Camera source grid UI
- [ ] Feature 3: CUT button
- [ ] Feature 4: AUTO + MIX transition
- [ ] Feature 5: USK1 on-air toggle
- [ ] Feature 6: DSK1 on-air toggle
- [ ] Feature 7: Connection status indicator

See [CLAUDE.md](CLAUDE.md) for full roadmap.

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::3000
```

Solution: Change `SERVER_PORT` or `WS_PORT` in `.env`, or stop the process using that port.

### Cannot connect to real ATEM

Ensure:
1. `ATEM_MOCK=false` in `.env`
2. `ATEM_IP` is correct (check ATEM's network settings)
3. ATEM is on the same network
4. No firewall blocking UDP traffic
5. ATEM Software Control is NOT connected (only one connection allowed)

## Contributing

Follow the guidelines in [CLAUDE.md](CLAUDE.md):
- Build one feature at a time
- Verify in mock mode before moving on
- Keep components small and single-purpose
- No speculative features
- Add `TODO(hardware):` comments for untestable ATEM-specific code

## License

ISC
