# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Identity

A professional-grade Blackmagic Design device control application for live production environments. Controls ATEM switchers, VideoHub routers, HyperDeck recorders, and Teranex converters from a unified interface. Quality bar: it should feel like Blackmagic Design shipped it.

---

## Core Principles

**Reliability over features.** Every component must be deterministic and failure-safe.

1. UI state is always derived from real ATEM state — never local assumptions.
2. No silent failures. Every connection state, command result, and error must surface visibly.
3. Connection status is always unambiguous. The user always knows if the app is live, reconnecting, or disconnected.
4. No ghost toggles. A button reflects the switcher, not a local guess.
5. Architecture stays modular. Nothing is hard-coded that would block scaling to multiple M/Es, AUX buses, or switcher models.

---

## UI Design Language

Mirror ATEM hardware aesthetics:

- Dark chassis background (`#1a1a1a` / `#222`)
- Light-gray rounded source buttons (idle state)
- **Preview** = green highlight
- **Program** = red/amber highlight
- CUT and AUTO as large, full-width action bars
- Clear visual separation between Preview and Program rows
- Monospace or tight sans-serif labels, no decorative type
- No gradients, no drop shadows, no consumer UI patterns

---

## Architecture

### Stack
- **Frontend:** React (Vite) — component-per-feature, hamburger drawer navigation
- **Backend:** Node.js (Express) — thin HTTP + WebSocket bridge to BMD devices
- **ATEM Communication:** `atem-connection` npm library (official Blackmagic protocol)
- **VideoHub Communication:** Custom TCP protocol implementation (BMD VideoHub protocol, port 9990)
- **HyperDeck Communication:** Custom TCP protocol implementation (BMD HyperDeck protocol, port 9993)
- **Teranex Communication:** Custom TCP protocol implementation (BMD Teranex protocol, port 9800)
- **State sync:** Backend holds authoritative device state; pushes combined state to frontend via WebSocket
- **Dev access:** Vite dev server bound to `0.0.0.0` — accessible from iPhone on local network

### State Model
```
ATEM Hardware     VideoHub Hardware    HyperDeck Hardware    Teranex Hardware
    ↕ (UDP)           ↕ (TCP:9990)         ↕ (TCP:9993)         ↕ (TCP:9800)
                              Node.js Backend
                                    ↕
                           Combined state store
                                    ↕ (WebSocket)
                              React Frontend
```

Frontend never writes to local state. It sends commands → backend → device → state update → broadcast back.

### WebSocket Protocol

**Server → Client (state broadcasts):**
```json
{
  "type": "state",
  "data": {
    "atem": {...},
    "videohub": {...},
    "hyperdecks": [{...}],
    "teranexes": [{...}],
    "deviceStatus": {
      "atem": "connected",
      "videohub": "disconnected",
      "hyperdecks": { "connected": 2, "total": 3 },
      "teranexes": { "connected": 1, "total": 1 }
    },
    "configuredDevices": ["atem", "videohub", "hyperdeck", "teranex"]
  }
}
```

**Client → Server (commands):**
```json
{ "type": "command", "device": "atem", "command": "cut", "params": { "me": 0 } }
```

**ATEM commands** (map directly to `atem-connection` API):
- `cut` — Swap program/preview (`{ me: 0 }`)
- `autoTransition` — Execute AUTO transition (`{ me: 0 }`)
- `changePreviewInput` — Select preview source (`{ input: 1, me: 0 }`)
- `changeProgramInput` — Select program source (`{ input: 1, me: 0 }`)
- `setUpstreamKeyerOnAir` — Toggle USK (`{ onAir: true, me: 0, keyer: 0 }`)
- `setDownstreamKeyerOnAir` — Toggle DSK (`{ onAir: true, keyer: 0 }`)
- `fadeToBlack` — FTB toggle (`{ me: 0 }`)
- `setAuxSource` — Route AUX bus (`{ input: 1, auxBus: 0 }`)

**VideoHub commands:**
- `setRoute` — Route input to output (`{ input: 1, output: 0 }`)

**HyperDeck commands** (map to HyperDeck Ethernet Protocol):
All commands include `deck` parameter to target a specific HyperDeck (0-indexed).
- `play` — Start playback (`{ deck: 0 }`)
- `stop` — Stop playback/recording (`{ deck: 0 }`)
- `record` — Start recording (`{ deck: 0 }`)
- `goto` — Go to clip/timecode (`{ deck: 0, clip: 1 }` or `{ deck: 0, timecode: "00:01:30:00" }`)
- `jog` — Jog forward/backward (`{ deck: 0, timecode: "+00:00:01:00" }`)
- `shuttle` — Variable speed playback (`{ deck: 0, speed: 200 }` = 2x)
- `slotSelect` — Select active slot (`{ deck: 0, slot: 1 }`)

**Teranex commands** (map to Teranex Ethernet Protocol):
All commands include `unitId` parameter to target a specific Teranex unit.
- `setVideoInput` — Select video input (`{ unitId: "teranex_1", videoSource: "HDMI" }`)
- `setAudioInput` — Select audio input (`{ unitId: "teranex_1", audioSource: "Embedded" }`)
- `setVideoOutput` — Set output format (`{ unitId: "teranex_1", videoMode: "1080p2398" }`)
- `setAspectRatio` — Set aspect ratio (`{ unitId: "teranex_1", aspectRatio: "Letterbox" }`)
- `setTestPattern` — Activate test pattern (`{ unitId: "teranex_1", output: "SMPTE Bars" }`)
- `setTestPatternMotion` — Toggle pattern motion (`{ unitId: "teranex_1", enabled: true }`)
- `setNoSignal` — Set no-signal pattern (`{ unitId: "teranex_1", noSignal: "Grid" }`)
- `setOutputSource` — Set output source (`{ unitId: "teranex_1", source: "Freeze" }`)
- `setTransitionRate` — Set transition rate (`{ unitId: "teranex_1", rate: 3 }`)
- `renameUnit` — Rename unit (`{ unitId: "teranex_1", name: "Main Converter" }`)

### Directory Structure
```
/
├── server/
│   ├── index.js          # Express + WebSocket server entry point
│   ├── atem.js           # ATEM connection, command handlers, state emitter
│   ├── videohub.js       # VideoHub TCP client (real mode)
│   ├── videohub-mock.js  # VideoHub mock implementation
│   ├── hyperdeck-manager.js # HyperDeck TCP client (real mode)
│   ├── hyperdeck-mock.js    # HyperDeck mock implementation
│   ├── teranex.js        # Teranex TCP client (real mode)
│   ├── teranex-mock.js   # Teranex mock implementation
│   ├── websocket.js      # WebSocket server, client management, state broadcast
│   ├── config.js         # Device IPs, ports, environment config
│   ├── device-config.js  # Device configuration CRUD (persistent JSON)
│   ├── network-scanner.js # Network scanner for BMD device discovery
│   └── test-atem.js      # ATEM testing utilities
├── data/
│   └── device-config.json # Persistent device configuration
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AtemPage/           # ATEM switcher control page
│   │   │   ├── VideoHubPage/       # VideoHub routing matrix page
│   │   │   ├── HyperDecksPage/     # HyperDeck recorder control page
│   │   │   ├── TeranexPage/        # Teranex AV converter control page
│   │   │   ├── SettingsPage/       # Device configuration & network scanner
│   │   │   ├── NavigationDrawer/   # Hamburger menu slide-in drawer
│   │   │   ├── CameraSourceGrid/   # 8-camera PGM/PVW grid with tap-to-cut
│   │   │   ├── AUXPanel/           # AUX bus routing (dropup menu)
│   │   │   ├── AutoButton/         # AUTO transition button
│   │   │   ├── KeyerButton/        # Upstream Keyer (USK) toggle
│   │   │   ├── DSKButton/          # Downstream Keyer (DSK) toggle
│   │   │   ├── FTBButton/          # Fade to Black button
│   │   │   ├── BARSButton/         # Color Bars source button
│   │   │   ├── ConnectionIndicator/ # WebSocket connection status
│   │   │   ├── DestinationRow/     # VideoHub output row (expandable)
│   │   │   └── VhConnStatus/       # VideoHub connection status
│   │   ├── hooks/
│   │   │   └── useATEMState.js     # WebSocket state sync hook
│   │   ├── lib/
│   │   │   └── websocket.js        # WebSocket client, command helpers
│   │   ├── App.jsx                 # Main app shell (drawer navigation)
│   │   └── main.jsx                # React entry point
│   └── vite.config.js
├── directives/           # Feature specs and implementation notes
├── CLAUDE.md
└── package.json
```

**Note:** Both root and client packages use ES modules (`"type": "module"`) — use `import/export` syntax, not `require()`.

---

## Development Commands

**Two separate processes** — server and client run independently:

```bash
# Terminal 1: Backend server (mock mode by default)
npm install          # Root dependencies (server)
npm run dev          # Starts server with nodemon on :3000 (HTTP) and :3001 (WS)

# Terminal 2: Frontend client
cd client
npm install          # Client dependencies
npm run dev          # Starts Vite dev server on :5173
npm run lint         # ESLint check
npm run build        # Production build to client/dist/
```

**Environment configuration** (create `.env` in root):
```
ATEM_MOCK=true              # true = no hardware needed
ATEM_IP=192.168.1.240       # Only used when ATEM_MOCK=false
VIDEOHUB_MOCK=true          # true = no hardware needed
VIDEOHUB_IP=192.168.19.240  # Only used when VIDEOHUB_MOCK=false
HYPERDECK_MOCK=true         # true = no hardware needed

# HyperDeck configuration (supports up to 8 decks)
# Pattern: HYPERDECK_N_IP and HYPERDECK_N_NAME where N is 1-8
HYPERDECK_1_IP=192.168.1.241
HYPERDECK_1_NAME=Record A
HYPERDECK_2_IP=192.168.1.242
HYPERDECK_2_NAME=Record B
# HYPERDECK_3_IP=...
# HYPERDECK_3_NAME=...

# Teranex configuration (supports up to 4 units)
# Pattern: TERANEX_N_IP and TERANEX_N_NAME where N is 1-4
TERANEX_MOCK=true               # true = no hardware needed
TERANEX_1_IP=192.168.1.250
TERANEX_1_NAME=Main Converter
TERANEX_2_IP=192.168.1.251
TERANEX_2_NAME=Projector Feed
# TERANEX_3_IP=...
# TERANEX_3_NAME=...

SERVER_PORT=3000
WS_PORT=3001
```

**Testing without hardware:**
- Backend starts in mock mode by default (ATEM, VideoHub, HyperDecks, Teranex)
- ATEM mock simulates 8 camera inputs, M/E 0, USK1, DSK1
- VideoHub mock simulates 20×20 routing matrix
- HyperDeck mock simulates 2 decks with transport state, clips, timecode
- Teranex mock simulates 2 units with input/output format conversion
- WebSocket test: `wscat -c ws://localhost:3000`
- Health check: `curl http://localhost:3000/health`
- Device API: `curl http://localhost:3000/api/devices`

---

## Navigation System

The app uses a **hamburger drawer navigation** (replacing the previous tab bar):

- **Hamburger icon** (top-left, 44×44px touch target) opens a slide-in drawer
- **Drawer** slides in from left (280px width, 250ms ease-out) with dimmed backdrop
- **Device pages** shown with connection status LEDs (green/amber/red)
- **Settings** always visible at bottom of drawer
- **Dynamic filtering**: only shows pages for configured device types
- **First-run experience**: if no devices configured, shows Settings page automatically

### Connection Status LEDs
- **Green**: Device connected
- **Amber**: Device connecting or partial (some of multi-device type connected)
- **Red**: Device disconnected

---

## Device Configuration REST API

Device configuration is stored in `data/device-config.json` and managed via REST API.

### Endpoints

**GET /api/devices** — List all configured devices with live status
```json
[
  { "id": "atem_1", "type": "atem", "name": "Main Switcher", "ip": "192.168.1.240", "port": 9910, "status": "connected" },
  { "id": "hyperdeck_1", "type": "hyperdeck", "name": "CAM 1 ISO", "ip": "192.168.1.50", "port": 9993, "status": "connected" }
]
```

**POST /api/devices** — Add a new device
```json
// Request
{ "type": "hyperdeck", "name": "CAM 2 ISO", "ip": "192.168.1.51" }
// Response
{ "id": "hyperdeck_2", "type": "hyperdeck", "name": "CAM 2 ISO", "ip": "192.168.1.51", "port": 9993, "status": "disconnected" }
```

**PUT /api/devices/:id** — Update device name or IP
```json
// Request
{ "name": "New Name", "ip": "192.168.1.52" }
// Response
{ "id": "hyperdeck_2", "type": "hyperdeck", "name": "New Name", "ip": "192.168.1.52", "port": 9993, "status": "connected" }
```

**DELETE /api/devices/:id** — Remove a device
```json
// Response
{ "success": true }
```

**POST /api/scan** — Scan network for BMD devices
```json
// Request (optional subnet)
{ "subnet": "192.168.1.0/24" }
// Response
{
  "status": "complete",
  "found": [
    { "ip": "192.168.1.50", "port": 9993, "type": "hyperdeck", "name": "HyperDeck", "alreadyConfigured": false },
    { "ip": "192.168.1.60", "port": 9990, "type": "videohub", "name": "VideoHub", "alreadyConfigured": false }
  ]
}
```

### Device Config Schema (`data/device-config.json`)
```json
{
  "version": 1,
  "devices": [
    { "id": "atem_1", "type": "atem", "name": "Main Switcher", "ip": "192.168.1.240", "port": 9910 },
    { "id": "hyperdeck_1", "type": "hyperdeck", "name": "CAM 1 ISO", "ip": "192.168.1.50", "port": 9993 }
  ]
}
```

### .env vs device-config.json Priority
1. If `data/device-config.json` exists, devices are loaded from there
2. If config is empty/missing, devices are migrated from `.env` (ATEM_IP, VIDEOHUB_IP, HYPERDECK_N_IP, TERANEX_N_IP)
3. Once migrated, all changes go to `device-config.json`
4. `.env` still controls mock mode (ATEM_MOCK, VIDEOHUB_MOCK, etc.)

### Network Scanner Limitations
- ATEM switchers use UDP protocol; TCP port scan may not detect them reliably. Add manually if not discovered.
- Full /24 subnet scan takes 15-30 seconds with parallel probing.
- In mock mode, scanner returns simulated discovered devices.

---

## Network Discovery Strategy

**Device IPs are dynamic.** Every job/venue has different gear and network configuration. Never assume IPs are static — always discover devices fresh when arriving on-site.

### Deployment Workflow
1. Connect laptop (server) to the production network
2. Get iPhone on the same network
3. Run network discovery to find all BMD devices
4. Update `device-config.json` with discovered devices
5. Start/restart server to connect

### BMD Device Ports Reference
| Device Type | Port | Protocol | Detection Method |
|-------------|------|----------|------------------|
| **ATEM** | 9910 | UDP | UDP packet exchange (TCP 9990 also responds for monitoring) |
| **VideoHub** | 9990 | TCP | Text protocol preamble: `VIDEOHUB DEVICE:` |
| **HyperDeck** | 9993 | TCP | Text protocol preamble |
| **Teranex** | 9800 | TCP | Text protocol preamble: `TERANEX DEVICE:` |

### Multi-Phase Discovery Process

**Phase 1 — Passive Discovery**
```bash
# Windows
ipconfig                    # Find active interfaces and subnets
arp -a                      # Check ARP table for known devices
```

**Phase 2 — Active Port Scan**
Scan the local subnet(s) for BMD ports. Use parallel TCP probes with 500ms timeout:
- Ports: 9800 (Teranex), 9910 (ATEM), 9990 (VideoHub), 9993 (HyperDeck)
- Batch size: 20-30 concurrent connections
- Note: ATEM 9910 requires UDP probe, not TCP

**Phase 3 — Protocol Verification**
For each discovered device, connect and read the protocol preamble to identify:
```
# VideoHub/Teranex/HyperDeck — TCP text protocol
PROTOCOL PREAMBLE:
Version: X.X

[DEVICE TYPE]:
Model name: [model]
Friendly name: [user-assigned name]
...
```

**Phase 4 — ATEM UDP Verification**
ATEM uses UDP on port 9910. Send a connection initiation packet and wait for response:
```javascript
const initPacket = Buffer.from([
  0x10, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
]);
```

### Quick Discovery Commands (Node.js)
```javascript
import net from 'net';
import dgram from 'dgram';

// TCP port check (VideoHub, HyperDeck, Teranex)
async function checkTcp(ip, port, timeout = 500) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, ip);
  });
}

// Read device preamble
async function readPreamble(ip, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let data = '';
    socket.setTimeout(3000);
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('close', () => resolve(data));
    socket.on('error', () => resolve(null));
    socket.connect(port, ip);
  });
}
```

### Typical Production Network Layout
```
Router/Switch (e.g., 192.168.19.1)
    │
    ├── ATEM Constellation (192.168.19.x:9910)
    ├── VideoHub (192.168.19.x:9990)
    ├── Teranex units (192.168.19.x:9800)
    ├── HyperDecks (192.168.19.x:9993)
    │
    ├── Laptop/Server (192.168.19.x)
    └── iPhone (192.168.19.x) → connects to server via WebSocket
```

---

## Development Environment

**Platform:** Windows.

**Mobile preview:** Vite dev server binds to `0.0.0.0:5173` — access from iPhone via `http://<machine-LAN-IP>:5173`.

**Mock mode:** Backend simulates ATEM, VideoHub, HyperDeck (multiple decks), and Teranex (multiple units) state and command responses. Frontend code is identical for mock vs. real — no conditional logic needed.

---

## Build Phases

### Phase 1 — Foundation ✓ (Complete)

**Confirmed working on real ATEM hardware.**

| Feature | Status |
|---------|--------|
| WebSocket state sync | ✓ |
| Camera source grid (1-8) with tap-to-cut | ✓ |
| CUT | ✓ |
| AUTO + MIX transition | ✓ |
| USK1 on-air toggle | ✓ |
| DSK1 on-air toggle | ✓ |
| FTB (Fade to Black) | ✓ |
| Color Bars (BARS) | ✓ |
| Connection status indicator | ✓ |
| AUX bus routing (dropup panel) | ✓ |
| Tab-based navigation | ✓ |
| VideoHub routing matrix | ✓ |
| VideoHub lock awareness | ✓ |
| Mock mode support (ATEM + VideoHub) | ✓ |

### Phase 2 — HyperDeck Master Control ✓ (Complete)

**Ready for hardware testing.**

Full deck control for HyperDeck recorders:

| Feature | Status |
|---------|--------|
| Transport controls (Play, Stop, Record) | ✓ |
| Jog/Shuttle control | ✓ |
| Clip list display | ✓ |
| Timecode display | ✓ |
| Slot selection (SD card slots) | ✓ |
| Recording format display | ✓ |
| Connection status indicator | ✓ |
| Mock mode support | ✓ |

### Phase 3 — Teranex AV Control ✓ (Complete)

**Ready for hardware testing.**

Full control for Teranex AV standards converters:

| Feature | Status |
|---------|--------|
| Multi-unit support (up to 4 units) | ✓ |
| Video input selection (SDI, HDMI, Optical) | ✓ |
| Audio input selection (Embedded, AES, Analog) | ✓ |
| Output format conversion | ✓ |
| Aspect ratio control | ✓ |
| Test pattern generation with motion | ✓ |
| Output source switching (Input, Black, Still, Freeze) | ✓ |
| Transition rate control | ✓ |
| No-signal pattern selection | ✓ |
| Signal status indicators | ✓ |
| Unit rename with persistence | ✓ |
| Connection status indicator | ✓ |
| Mock mode support | ✓ |

### Phase 4 — Navigation & Settings ✓ (Complete)

Dynamic navigation and device configuration system:

| Feature | Status |
|---------|--------|
| Hamburger menu navigation (replaces tab bar) | ✓ |
| Slide-in drawer with device pages | ✓ |
| Connection status LEDs in drawer | ✓ |
| Settings page for device configuration | ✓ |
| Network scanner for BMD device discovery | ✓ |
| Device add/edit/delete via REST API | ✓ |
| Persistent device config (JSON file) | ✓ |
| .env migration for backward compatibility | ✓ |
| Dynamic navigation (only show configured devices) | ✓ |
| First-run experience (auto-show Settings) | ✓ |

### Future (not scoped yet)
- Multiple M/Es
- Macro triggers
- Transition type selector (Dip, Wipe, Stinger)
- Multi-AUX routing panel
- Native app packaging (Electron or iOS)

---

## Working Rules for Claude Code

- Build one feature at a time. Do not scaffold future features speculatively.
- After each feature: verify it works end-to-end in mock mode before moving on.
- If a design decision would create a hard-coded assumption (e.g., fixed camera count, fixed M/E index), flag it and use a data-driven approach instead.
- Keep components small and single-purpose.
- Prefer explicit over implicit — no magic, no hidden side effects.
- If something cannot be verified without ATEM hardware, note it clearly in a `TODO(hardware):` comment.
- Never fake UI state to make the demo look good.

---

## Project Organization

- `directives/` — Feature specs and implementation notes (living documents, update as features are built)
- `data/` — Persistent data files (device configuration, created automatically)
- `.env` — Environment variables (gitignored, see template above)
