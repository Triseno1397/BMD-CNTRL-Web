# WebSocket State Sync Directive

## Goal

Maintain authoritative ATEM state in the backend and synchronize it to all connected frontend clients in real-time via WebSocket.

## How It Works

### State Flow

```
ATEM Hardware (or Mock)
    ↓ (UDP events)
Backend State Store (in-memory)
    ↓ (WebSocket broadcast)
All Connected Clients
```

1. Backend connects to ATEM (real hardware or mock)
2. Backend maintains the current ATEM state in memory
3. When ATEM state changes, backend broadcasts the new state to all WebSocket clients
4. When a new client connects, it immediately receives the current state
5. Frontend never stores state locally - it's always derived from backend

### Components

**server/atem.js**
- Manages connection to ATEM hardware (or mock)
- Maintains in-memory state store
- Emits `stateChange` events when state updates

**server/websocket.js**
- WebSocket server listening on WS_PORT (default: 3001)
- Manages connected clients
- Broadcasts state updates to all clients
- Sends initial state on new connections

**server/index.js**
- Main entry point
- Wires ATEM state changes to WebSocket broadcasts
- Provides HTTP health check endpoint

## Mock Mode

Mock mode allows full development and testing without ATEM hardware.

**Enable mock mode:**
```bash
# In .env file
ATEM_MOCK=true
```

**What mock mode does:**
- Simulates realistic ATEM state structure
- Supports 8 camera inputs (Camera 1-8)
- Initializes M/E 0 with Camera 1 on program, Camera 2 on preview
- Includes USK1 and DSK1 (both off)
- Broadcasts state to clients just like real mode

**Disable mock mode (use real ATEM):**
```bash
# In .env file
ATEM_MOCK=false
ATEM_IP=192.168.1.240  # Your ATEM's IP address
```

## Testing

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "mockMode": true,
  "connectedClients": 0,
  "timestamp": "2026-02-24T..."
}
```

### Test 2: WebSocket Connection

Using browser console or `wscat`:

```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket server
wscat -c ws://localhost:3001
```

Expected result:
- Immediate message with current ATEM state
- State is valid JSON
- State contains `video.mixEffects[0]`, `inputs`, etc.

### Test 3: State Structure Validation

After connecting via WebSocket, verify the state contains:

```json
{
  "type": "state",
  "data": {
    "video": {
      "mixEffects": [
        {
          "index": 0,
          "programInput": 1,
          "previewInput": 2,
          "transitionSettings": {...},
          "upstreamKeyers": [...]
        }
      ],
      "downstreamKeyers": [...]
    },
    "inputs": {
      "1": { "name": "Camera 1", ... },
      "2": { "name": "Camera 2", ... },
      ...
    }
  }
}
```

## Edge Cases

### Client Reconnection
- Clients should reconnect automatically if connection drops
- On reconnection, client receives fresh state immediately
- No state is lost during brief disconnections

### State Size
- Current mock state is ~2KB (manageable)
- Real ATEM state can be larger (10-50KB depending on model)
- WebSocket has no practical size limits for this use case
- If needed, implement state diffing in future (send only changes)

### Multiple Clients
- All clients receive the same state simultaneously
- No client-specific state filtering (all see everything)
- Clients are responsible for rendering only what they need

### ATEM Disconnection (Real Mode)
- If ATEM hardware disconnects, backend detects it
- Backend logs disconnection
- TODO: Notify clients of disconnection status
- TODO: Auto-reconnect logic

## Future Enhancements

1. **Command handling**: Accept commands from clients (cut, auto, etc.)
2. **State diffing**: Send only changed portions of state
3. **Connection status**: Explicit connection state in messages
4. **Authentication**: Secure WebSocket connections
5. **Multiple switchers**: Support connecting to multiple ATEMs

## Related Files

- `server/atem.js` - ATEM state management
- `server/websocket.js` - WebSocket server
- `server/index.js` - Main application entry point
- `server/config.js` - Configuration loader
- `.env` - Environment variables
