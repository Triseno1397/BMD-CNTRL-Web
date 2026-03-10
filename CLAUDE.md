# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Identity

A professional-grade Blackmagic Design device control application for live production environments. Controls ATEM switchers, VideoHub routers, and HyperDeck recorders from a unified interface. Quality bar: it should feel like Blackmagic Design shipped it.

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
- **Frontend:** React (Vite) — component-per-feature, tab-based navigation
- **Backend:** Node.js (Express) — thin HTTP + WebSocket bridge to BMD devices
- **ATEM Communication:** `atem-connection` npm library (official Blackmagic protocol)
- **VideoHub Communication:** Custom TCP protocol implementation (BMD VideoHub protocol, port 9990)
- **HyperDeck Communication:** Custom TCP protocol implementation (BMD HyperDeck protocol, port 9993)
- **State sync:** Backend holds authoritative device state; pushes combined state to frontend via WebSocket
- **Dev access:** Vite dev server bound to `0.0.0.0` — accessible from iPhone on local network

### State Model
```
ATEM Hardware     VideoHub Hardware    HyperDeck Hardware
    ↕ (UDP)           ↕ (TCP:9990)         ↕ (TCP:9993)
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
{ "type": "state", "data": { "atem": {...}, "videohub": {...}, "hyperdecks": [{...}, {...}] } }
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

### Directory Structure
```
/
├── server/
│   ├── index.js          # Express + WebSocket server entry point
│   ├── atem.js           # ATEM connection, command handlers, state emitter
│   ├── videohub.js       # VideoHub TCP client (real mode)
│   ├── videohub-mock.js  # VideoHub mock implementation
│   ├── websocket.js      # WebSocket server, client management, state broadcast
│   ├── config.js         # Device IPs, ports, environment config
│   └── test-atem.js      # ATEM testing utilities
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AtemPage/           # ATEM switcher control page
│   │   │   ├── VideoHubPage/       # VideoHub routing matrix page
│   │   │   ├── TabBar/             # Bottom tab navigation
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
│   │   ├── App.jsx                 # Main app shell (tab routing)
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

SERVER_PORT=3000
WS_PORT=3001
```

**Testing without hardware:**
- Backend starts in mock mode by default (ATEM, VideoHub, HyperDecks)
- ATEM mock simulates 8 camera inputs, M/E 0, USK1, DSK1
- VideoHub mock simulates 20×20 routing matrix
- HyperDeck mock simulates 2 decks with transport state, clips, timecode
- WebSocket test: `wscat -c ws://localhost:3001`
- Health check: `curl http://localhost:3000/health`

---

## Development Environment

**Platform:** Windows.

**Mobile preview:** Vite dev server binds to `0.0.0.0:5173` — access from iPhone via `http://<machine-LAN-IP>:5173`.

**Mock mode:** Backend simulates ATEM, VideoHub, and HyperDeck (multiple decks) state and command responses. Frontend code is identical for mock vs. real — no conditional logic needed.

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

### Phase 2 — HyperDeck Master Control (Current)

Full deck control for HyperDeck recorders:

| Feature | Status |
|---------|--------|
| Transport controls (Play, Stop, Record) | |
| Jog/Shuttle control | |
| Clip list display | |
| Timecode display | |
| Slot selection (SD card slots) | |
| Recording format display | |
| Connection status indicator | |
| Mock mode support | |

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
- `.env` — Environment variables (gitignored, see template above)
