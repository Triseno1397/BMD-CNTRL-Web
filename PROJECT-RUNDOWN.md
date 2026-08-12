# BMD CNTRL v2 — Complete Project Rundown

A single-source dump of everything built in this repo: architecture, protocols, state shapes, APIs, component inventory, build depth, and known gaps.

---

## 1. What This Is

A professional-grade control surface for Blackmagic Design live-production hardware. One web app (phone or laptop) that drives four device families over their native network protocols:

| Device | Protocol | Port | Status |
|---|---|---|---|
| ATEM switcher | UDP (via `atem-connection`) | 9910 | Confirmed working on real hardware |
| VideoHub router | Custom TCP text protocol | 9990 | Built, real-mode implemented |
| HyperDeck recorder | Custom TCP text protocol | 9993 | Built, awaiting hardware test |
| Teranex AV converter | Custom TCP text protocol | 9800 | Built, real-mode implemented |

Design brief: it should feel like Blackmagic shipped it. Dark chassis, green = preview, red = program, no gradients, no consumer UI patterns.

**Overall depth:** ~12,200 lines of source across 4 completed build phases. All four device pages, a navigation drawer, a settings page with a network scanner, persistent device config, and full mock modes for every device. This is well past prototype — it's a working application currently pointed at real production hardware.

---

## 2. Stack

**Backend** (`/server`, root `package.json`, ES modules)
- Node.js + Express 4.21
- `ws` 8.18 for WebSocket (attached to the same HTTP server, single port)
- `atem-connection` 3.4 (official Blackmagic protocol library)
- `dotenv` 16.4
- `nodemon` for dev
- Raw `net.Socket` TCP clients hand-written for VideoHub / HyperDeck / Teranex
- No database. State is in-memory; device config persists to a JSON file.

**Frontend** (`/client`, ES modules)
- React 19.2 + Vite 7.3
- No state library, no router, no UI framework, no CSS framework
- Plain CSS per component, BEM-ish naming
- ESLint 9 configured
- Navigation is `useState` + conditional render; page identity lives in `App.jsx`

---

## 3. Repo Map

```
/
├── server/                          # Node backend
│   ├── index.js              (396)  # Express app, REST API, startup wiring, graceful shutdown
│   ├── config.js             ( 77)  # .env loader; mock flags; HyperDeck/Teranex N-scan
│   ├── websocket.js          (253)  # WS server, client set, heartbeat, state broadcast, command routing
│   ├── device-config.js      (279)  # Device CRUD + JSON persistence + .env migration
│   ├── network-scanner.js    (491)  # Subnet discovery, TCP port probe, ATEM UDP probe, preamble parse
│   ├── atem.js               (632)  # ATEM connection + cross-model state normalizer + mock
│   ├── videohub.js           (413)  # VideoHub TCP client (real)
│   ├── videohub-mock.js      (161)  # VideoHub mock (20×20 matrix)
│   ├── hyperdeck-manager.js  (775)  # HyperDeck TCP client (real, multi-deck)
│   ├── hyperdeck-mock.js     (436)  # HyperDeck mock (transport sim, timecode ticking)
│   ├── teranex.js            (579)  # Teranex TCP client (real, multi-unit)
│   ├── teranex-mock.js       (293)  # Teranex mock (2 units)
│   └── test-atem.js          ( 70)  # ATEM test utility
│
├── data/
│   ├── device-config.json           # Persistent device list (source of truth at runtime)
│   └── teranex-names.json           # Teranex custom names, keyed by unit index
│
├── client/
│   ├── vite.config.js        ( 25)  # Binds 0.0.0.0:5173; proxies /api and /ws to :3000
│   └── src/
│       ├── main.jsx          (  8)
│       ├── App.jsx           (155)  # Shell: drawer + header + page switch
│       ├── hooks/
│       │   └── useATEMState.js (278) # THE state hook — WS connect, reconnect, all device state
│       ├── lib/
│       │   └── websocket.js  ( 78)  # Thin WS wrapper: connectATEM(), sendCommand()
│       └── components/
│           ├── AtemPage/           (113)  # Composes the ATEM control surface
│           ├── VideoHubPage/       ( 93)  # Destination list → expandable source picker
│           ├── HyperDecksPage/     (625)  # Deck tabs, transport, slots, clips, jog, settings
│           ├── TeranexPage/        (531)  # Unit tabs, LCD, format matrix, patterns, procamp
│           ├── SettingsPage/       (517)  # Device CRUD UI + network scanner UI
│           ├── NavigationDrawer/   (218)  # Slide-in drawer, status LEDs, dynamic filtering
│           ├── CameraSourceGrid/   ( 79)  # 8-source grid
│           │   └── CameraButton    ( 67)  # Tap-to-preview, tap-again-to-cut
│           ├── AUXPanel/           (110)  # Drop-up AUX routing
│           │   ├── AUXBusList      ( 34)
│           │   └── AUXSourcePicker ( 74)
│           ├── DestinationRow/     (100)  # VideoHub output row (expandable)
│           ├── AutoButton/         ( 31)
│           ├── KeyerButton/        ( 38)  # USK
│           ├── DSKButton/          ( 39)
│           ├── FTBButton/          ( 63)
│           ├── BARSButton/         ( 41)
│           ├── ConnectionIndicator/( 36)
│           ├── VhConnStatus/       ( 19)
│           └── TabBar/             ( 78)  # DEAD CODE — replaced by NavigationDrawer
│
├── CLAUDE.md                        # Project instructions (partially stale — see §12)
├── AGENTS.md / GEMINI.md            # Agent architecture docs
├── README.md                        # STALE — describes Phase 1 only
└── directives/websocket_state_sync.md
```

---

## 4. Runtime Architecture

```
ATEM (UDP 9910)   VideoHub (TCP 9990)   HyperDeck (TCP 9993)   Teranex (TCP 9800)
      │                    │                     │                      │
      └────────────────────┴──────────┬──────────┴──────────────────────┘
                                      │
                        Node backend (single process)
                        ├─ 4 device managers (EventEmitter singletons)
                        ├─ Combined in-memory state store
                        ├─ Express REST API  (:3000/api/*)
                        └─ WebSocket server  (:3000, same port)
                                      │
                                 WebSocket
                                      │
                        React frontend (Vite :5173 dev, served from /client/dist in prod)
```

**The one rule the whole app is built on:** the frontend never writes to its own state. Every button sends a command → backend → device → device reports new state → backend broadcasts → frontend re-renders. There are no optimistic local toggles in the client. (The Teranex *server* module does optimistic updates on its own state, which is a deliberate exception for latency, noted in §12.)

### Startup sequence (`server/index.js:242`)
1. Load `data/device-config.json` (migrating from `.env` if the file doesn't exist)
2. Connect ATEM — non-blocking, failure logged not fatal
3. Connect VideoHub with its config from device-config
4. Connect all HyperDecks
5. Connect all Teranexes
6. Create HTTP server, attach WebSocket server to it
7. Register state providers (`atem`, `videohub`, `hyperdecks`, `teranexes`), device-status provider, configured-devices provider
8. Wire each manager's `stateChange` event → `websocketManager.broadcastState()`
9. Register per-device command handlers
10. Listen on `0.0.0.0:PORT`

Every manager is an `EventEmitter` singleton exporting `connect()`, `getState()`/`getAllState()`, `sendCommand()`, `disconnect()`. Mock and real modules expose the identical interface, so `index.js` swaps them with a dynamic import based on config and nothing downstream knows the difference.

---

## 5. WebSocket Protocol

Single WebSocket on the same port as HTTP. No auth, no rooms, no subscriptions — every client gets every state broadcast.

### Server → Client

**State broadcast** (sent on connect, and on every device `stateChange`):
```json
{
  "type": "state",
  "data": {
    "atem": { /* see §7 */ },
    "videohub": { /* see §7 */ },
    "hyperdecks": [ /* array, see §7 */ ],
    "teranexes":  [ /* array, see §7 */ ],
    "deviceStatus": {
      "atem": "connected",
      "videohub": "disconnected",
      "hyperdecks": { "connected": 2, "total": 3 },
      "teranexes":  { "connected": 1, "total": 2 }
    },
    "configuredDevices": ["atem", "videohub", "teranex"]
  }
}
```

**Command error** (the only per-command response — success is silent, confirmed by the subsequent state broadcast):
```json
{ "type": "commandError", "command": "cut", "error": "ATEM not connected" }
```

### Client → Server
```json
{ "type": "command", "device": "atem", "command": "cut", "params": { "me": 0 } }
```
`device` defaults to `"atem"` if omitted; `params` also accepts the legacy key `args`.

### Connection resilience
- **Server:** 30-second ping/pong heartbeat; unresponsive clients are terminated and dropped from the client set. `perMessageDeflate: false` for latency.
- **Client** (`useATEMState.js`): exponential backoff reconnect (1s → 30s cap, 10 attempts), 10-second connect timeout, reconnect on `window.online`, reconnect on tab becoming visible, guard flag against concurrent connect attempts, and cleanup of all timers on unmount. Connection status is one of `connecting | connected | reconnecting | disconnected | error | failed`.

---

## 6. Command Reference

### ATEM (`device: "atem"`) — maps 1:1 onto `atem-connection` methods
| Command | Params |
|---|---|
| `cut` | `{ me: 0 }` |
| `autoTransition` | `{ me: 0 }` |
| `changePreviewInput` | `{ input: 1, me: 0 }` |
| `changeProgramInput` | `{ input: 1, me: 0 }` |
| `setUpstreamKeyerOnAir` | `{ onAir: true, me: 0, keyer: 0 }` |
| `setDownstreamKeyerOnAir` | `{ onAir: true, keyer: 0 }` |
| `fadeToBlack` | `{ me: 0 }` |
| `setAuxSource` | `{ input: 1, auxBus: 0 }` |

`buildCommandArgs()` (`atem.js:425`) translates the params object into the positional argument array each `atem-connection` method expects. Unknown commands fall back to `Object.values(args)`.

### VideoHub (`device: "videohub"`)
| Command | Params |
|---|---|
| `route` | `{ output: 0, input: 1 }` |

Sends `VIDEO OUTPUT ROUTING:\n<out> <in>\n\n` and **waits for ACK/NAK with a 5-second timeout** — a NAK or timeout rejects and surfaces as a `commandError`. Routing a locked output (`lock === 'L'`) throws before it hits the wire.

> Note: CLAUDE.md documents this as `setRoute`. The actual implemented name in both client and server is `route`.

### HyperDeck (`device: "hyperdeck"`) — all params carry `deckId` (or `'all'` to broadcast)
| Command | Params | Wire command |
|---|---|---|
| `play` | `{ deckId, speed? }` | `play` / `play: speed: N` |
| `stop` | `{ deckId }` | `stop` |
| `record` | `{ deckId }` | `record` |
| `goto` | `{ deckId, clipId }` or `{ deckId, timecode }` | `goto: clip id: N` / `goto: timecode: TC` |
| `jog` | `{ deckId, timecode: "+00:00:00:05" }` | `jog: timecode: TC` |
| `shuttle` | `{ deckId, speed: 1600 }` | `shuttle: speed: N` |
| `slotSelect` | `{ deckId, slot: 1 }` | `slot select: slot id: N` |
| `configuration` | `{ deckId, videoInput?, audioInput?, fileFormat?, audioCodec?, loop?, singleClip? }` | `configuration: ...` |
| `remoteEnable` | `{ deckId, enable: true }` | `remote: enable: true` |
| `clipsGet` | `{ deckId }` | `clips get` |

`deckId: 'all'` iterates every connected deck; per-deck failures are logged, not fatal.

### Teranex (`device: "teranex"`) — all params carry `unitId`
| Command | Params |
|---|---|
| `setVideoInput` | `{ unitId, videoSource: "SDI" \| "HDMI" \| "Optical" }` |
| `setAudioInput` | `{ unitId, audioSource: "Embedded" \| "AES" \| "Analog" }` |
| `setVideoOutput` | `{ unitId, videoMode: "1080p2398" }` |
| `setAspectRatio` | `{ unitId, aspectRatio: "Letterbox" }` |
| `setTestPattern` | `{ unitId, output: "SMPTE Bars" }` |
| `setTestPatternMotion` | `{ unitId, enabled: true }` |
| `setNoSignal` | `{ unitId, noSignal: "Grid" }` |
| `setOutputSource` | `{ unitId, source: "Freeze" }` |
| `setTransitionRate` | `{ unitId, rate: 3 }` |
| `renameUnit` | `{ unitId, name: "Main Converter" }` |

---

## 7. State Shapes

### ATEM (normalized — `atem.js:74`)
The raw `atem-connection` state differs across ATEM models (Mini vs. Television Studio vs. Constellation) and returns Maps, arrays, or plain objects depending on the field. `normalizeAtemState()` flattens all of that into one guaranteed shape, filling defaults where the model doesn't report a field. This is the single most load-bearing piece of defensive code in the backend.

```js
{
  video: {
    mixEffects: [{
      index, programInput, previewInput,
      transitionSettings: { mix: { rate } },
      transitionPosition: { inTransition, remainingFrames, handlePosition },
      upstreamKeyers: [{ index, onAir, fillSource, cutSource }],
      fadeToBlack: { isFullyBlack, inTransition, remainingFrames, rate }
    }],
    downstreamKeyers: [{ index, onAir, tie, rate, sources: { fillSource, cutSource } }],
    auxilliaries: [ /* inputId per AUX bus */ ]
  },
  inputs: { [id]: { name, longName, internalPortType } },
  info: { /* passthrough */ }
}
```
Guarantees: at least one M/E, at least one DSK, inputs always keyed by ID. Mock uses inputs 1–8 (cameras), 1000 (bars), 3010/3020 (media players).

### VideoHub
```js
{
  connected: bool,
  device: { present, model, inputCount, outputCount },
  inputs:  { [i]: { label } },
  outputs: { [i]: { label, route, lock: 'U'|'O'|'L' } }   // U=unlocked, O=owned, L=locked elsewhere
}
```

### HyperDeck (array, one per deck)
```js
{
  id, index, name, ip, connected, connecting, model,
  transportState: 'stopped'|'play'|'record'|'shuttle forward'|'shuttle reverse'|'jog',
  speed, timecode, displayTimecode, clipId, clipCount, activeSlot,
  slots: { 1: { status, volumeName, recordingTime, recordingTimeRemaining },
           2: { ... } },
  clips: [{ id, name, duration, format }],
  configuration: { videoInput, audioInput, fileFormat, audioCodec, loop, singleClip },
  remoteEnabled: bool
}
```

### Teranex (array, one per unit)
```js
{
  id, index, name, ip, connected, connecting,
  device:       { modelName, protocolVersion },
  videoInput:   { autoDetectionEnabled, autoDetectionPreferPsF, videoSource, videoMode,
                  audioSource, signalPresent, timecodePresent, closedCaptioningPresent,
                  wideSdAspect, hdmi3DFull, videoPixelFormat },
  videoOutput:  { videoMode, aspectRatio, dualLink, videoPixelFormat },
  testPattern:  { output, noSignal, horizontalMotion },
  videoAdvanced:{ outputSource, transitionRate },
  procAmp:      { gain, black, saturation, hue, ry, by, sharp }
}
```

---

## 8. TCP Protocol Implementations (the hard part)

All three custom clients solve the same core problem: **TCP delivers arbitrary chunks, not messages.** Each buffers incoming bytes and only parses complete units.

### VideoHub / Teranex — block protocol
Blocks are separated by blank lines (`\n\n`). First line is a header (`VIDEOHUB DEVICE:`, `VIDEO INPUT:`), following lines are `Key: value`. On connect the device dumps full state, then sends incremental blocks for every change. Both clients accumulate into a buffer, split on `\n\n`, and dispatch by header.

- **VideoHub** handles: `PROTOCOL PREAMBLE`, `VIDEOHUB DEVICE`, `INPUT LABELS`, `OUTPUT LABELS`, `VIDEO OUTPUT ROUTING`, `VIDEO OUTPUT LOCKS`, `ACK`, `NAK`.
- **Teranex** handles: `PROTOCOL PREAMBLE`, `TERANEX DEVICE`, `VIDEO INPUT`, `VIDEO OUTPUT`, `VIDEO PROC AMP`, `TEST PATTERN`, `VIDEO ADVANCED`, `ACK`, `NAK`. It maintains a `KEY_MAP` translating protocol keys (`'Auto detection prefer PsF'`) to camelCase, plus a reverse map for outbound commands.

### HyperDeck — line protocol with response codes
Lines terminated by `\r\n`. Responses are prefixed with a 3-digit code:
- `1xx` — multi-line response header; subsequent lines are `key: value` data until a blank line
- `2xx` — success; resolves the oldest pending command promise
- `5xx` — **async notification** (508 transport, 502 slot, 510 remote, 511 configuration) pushed by the deck without being asked
- other — error; rejects the pending command

On connect it fires an init sequence: `device info`, `transport info`, `slot info` ×2, `clips get`, `configuration`, `remote`, then `notify: transport: true slot: true remote: true configuration: true` to subscribe to push updates. Timecode notifications are throttled to 4 Hz before broadcasting, so a playing deck doesn't flood every WebSocket client at frame rate.

### Reconnection
Every real client has independent exponential backoff (1s doubling to a 30s cap), per-device (or per-deck/per-unit, tracked in a Map). Command sends have 5-second timeouts. Socket write failures mark the device disconnected and emit a state change so the UI can't lie about connectivity.

---

## 9. REST API

Served from the same Express app on port 3000.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Mock flags, per-device connection counts, WS client count |
| `GET` | `/api/devices` | All configured devices, each annotated with live `status` |
| `POST` | `/api/devices` | Add device — `{ type, name, ip }`; port is inferred from type |
| `PUT` | `/api/devices/:id` | Rename / change IP (only these two fields are mutable) |
| `DELETE` | `/api/devices/:id` | Remove device |
| `POST` | `/api/scan` | Network scan — optional `{ subnet, useMock }` |

`POST`/`PUT`/`DELETE` all persist to `data/device-config.json` immediately, and `PUT`/`DELETE` trigger a WebSocket state broadcast so the drawer updates live.

### Network scanner (`network-scanner.js`)
1. Enumerate local IPv4 interfaces, skip internal/link-local, compute subnets from netmask, sort to prefer `192.168.*` → `10.*` → other
2. Generate host IPs (capped at /24 for performance)
3. **Phase 1** — parallel TCP probes on 9990/9993/9800, batches of 30, 500 ms timeout
4. **Phase 2** — for anything that answered on TCP 9990, send an ATEM UDP init packet to 9910; if it responds, reclassify that device as an ATEM (ATEMs expose a VideoHub-ish TCP surface but are controlled over UDP)
5. Deduplicate by `ip:type`, mark each with `alreadyConfigured`
6. `readDevicePreamble()` exists for pulling model/friendly-name from a device's protocol preamble (implemented, not currently called by the scan path)

A mock scanner returns four fake devices when everything is in mock mode.

---

## 10. Frontend Detail

### `useATEMState()` — the only state source
One hook, called once in `App.jsx`, owns the WebSocket and returns everything:
```js
{ atemState, videohubState, hyperdecksState, teranexesState,
  deviceStatus, configuredDevices, connectionStatus, error, commandError, sendCommand }
```
`sendCommand(command, params, device)` — device defaults to `'atem'`. If the socket isn't open, it sets a `commandError` rather than failing silently.

WS URL is auto-derived: in dev it hits `ws://<hostname>:3000` directly (so a phone on the LAN works); in prod it uses `window.location.host` and upgrades to `wss:` under HTTPS.

### Navigation
`NavigationDrawer` renders only nav items whose type appears in `configuredDevices` (pushed from the server). Each item carries a status LED: green = connected, amber = connecting or partial (some of N connected), red = disconnected. Settings is always pinned at the bottom. Escape closes; body scroll locks while open.

`App.jsx` derives the active page: user selection wins; otherwise if zero devices are configured it opens Settings (first-run experience); otherwise it defaults to the first configured device type.

### Page inventory
- **AtemPage** — camera grid, AUTO bar, USK1/DSK1 column, BARS/FTB column, AUX drop-up. Every value is read straight out of `atemState`; error banners for both WS errors and command errors.
- **CameraButton** — tap once → `changePreviewInput`; tap again while previewed → `cut`. That's the entire tap-to-cut behavior, and it's derived purely from `programInput`/`previewInput`.
- **VideoHubPage** — destination list; tap a row to expand an inline source picker; locked outputs (`'L'`) render a padlock and are non-interactive.
- **HyperDecksPage** — the largest component (625 lines JSX, 1149 lines CSS). ALL-DECKS broadcast transport bar, per-deck tabs with recording LEDs, timecode display, dual slot cards with time-remaining color thresholds, six-button transport, big RECORD button (disabled unless the active slot is mounted), collapsible drag jog control, clip browser with CUE buttons, collapsible settings panel with format presets, and a REMOTE OFF warning with a one-click enable.
- **TeranexPage** — unit tabs, hardware-style LCD readout (IN/OUT/TEST/NO-SIGNAL rows), IN/OUT mode toggle, video+audio source rows, and a format matrix that understands which frame types and rates are legal per resolution (`OUTPUT_FORMATS`) and disables the impossible combinations. Video modes are parsed/composed between UI components and wire strings (`1080p2398` ⇄ `{1080, P, 23.98}`). Plus aspect ratio, test patterns with motion, output source, transition-rate slider, no-signal pattern, and signal/TC/CC status LEDs. Inline unit rename persists to disk.
- **SettingsPage** — network scan with results list and one-click add, grouped device cards with inline rename and confirm-to-delete, manual add form with IP pattern validation.

---

## 11. Configuration

### `.env` (gitignored) — controls **mock mode** and provides legacy/migration IPs
```
ATEM_MOCK=false
ATEM_IP=192.168.19.24
VIDEOHUB_MOCK=false
VIDEOHUB_IP=192.168.19.23
HYPERDECK_MOCK=false
TERANEX_MOCK=false
TERANEX_1_IP=192.168.19.28
TERANEX_1_NAME=Teranex AV2
TERANEX_2_IP=192.168.19.29
TERANEX_2_NAME=Teranex AV
SERVER_PORT=3000
```
HyperDecks scan `HYPERDECK_1..8_IP/_NAME`; Teranexes scan `TERANEX_1..4_IP/_NAME`.

Mock defaults are asymmetric and worth knowing: `ATEM_MOCK` defaults to **false** (`=== 'true'`), while VideoHub/HyperDeck/Teranex default to **true** (`!== 'false'`).

### `data/device-config.json` — runtime source of truth for *which devices exist*
```json
{ "version": 1, "devices": [ { "id", "type", "name", "ip", "port" } ] }
```
Priority: if this file exists, it wins. If it's missing, devices are migrated out of `.env` and the file is written. From then on all changes go through the REST API. `.env` continues to control mock mode only.

**Current live config in this repo (real production gear):**
| Device | Name | IP |
|---|---|---|
| ATEM | Holley ATEM 4 M/E Constellation 4K | 192.168.19.24 |
| VideoHub | HOLLEY Blackmagic Videohub 40×40 12G | 192.168.19.23 |
| Teranex 1 | Teranex AV2 | 192.168.19.28 |
| Teranex 2 | Teranex AV | 192.168.19.29 |

No HyperDecks are currently configured. All mock modes are off — this repo is pointed at real hardware.

### `data/teranex-names.json`
Teranex custom names, keyed by **unit index** (not device id), written by the `renameUnit` command. Separate from device-config on purpose — it survives independently of the device list.

---

## 12. Mock Mode

Every device has a full mock with the identical interface, so the entire frontend runs with zero hardware and zero conditional client code.

- **ATEM mock** — 8 cameras, bars (1000), 2 media players, M/E 0, USK1, DSK1, 10 AUX buses. Genuinely simulates transition timing: AUTO and FTB set `inTransition`, emit an immediate state change, then complete after `rate × 33ms` and emit again — so transition-in-progress UI states are exercised.
- **VideoHub mock** — 20×20 matrix, named demo inputs/outputs, one deliberately locked output (index 19) so the lock path gets tested.
- **HyperDeck mock** — 2 decks, transport state machine, ticking timecode during playback, clips, slots.
- **Teranex mock** — 2 units with differing formats (one SDI/1080i5994→720p50 anamorphic, one HDMI/1080p25→2160p50 letterbox).

Health check: `curl http://localhost:3000/health` · WS test: `wscat -c ws://localhost:3000`

---

## 13. Build Phase Status

| Phase | Scope | State |
|---|---|---|
| **1 — Foundation** | WS state sync, camera grid, CUT, AUTO/MIX, USK1, DSK1, FTB, BARS, connection indicator, AUX routing, VideoHub matrix + lock awareness, mocks | ✅ Complete, **confirmed on real ATEM hardware** |
| **2 — HyperDeck** | Transport, jog/shuttle, clip list, timecode, slot select, format display, connection status, mock | ✅ Code complete, **not yet tested on real deck** |
| **3 — Teranex** | Multi-unit, video/audio input, output format, aspect, test patterns + motion, output source, transition rate, no-signal, signal LEDs, rename+persist, mock | ✅ Code complete, real-mode client implemented |
| **4 — Navigation & Settings** | Hamburger drawer, status LEDs, settings page, network scanner, device CRUD REST API, JSON persistence, .env migration, dynamic nav, first-run flow | ✅ Complete |

**Not scoped yet:** multiple M/Es, macro triggers, transition-type selector (dip/wipe/stinger), multi-AUX panel, native packaging (Electron/iOS).

---

## 14. Deployment

- **Dev:** two processes — `npm run dev` (server, nodemon, :3000) and `cd client && npm run dev` (Vite, :5173 bound to `0.0.0.0` so a phone on the LAN can reach it).
- **Prod:** `npm run build` builds the client into `client/dist`; `server/index.js` serves that statically and mounts a SPA catch-all. HTTP and WebSocket share one port. `config.serverPort` reads `PORT` first (Render/Heroku-style), then `SERVER_PORT`, then 3000 — so it drops into a cloud host as-is.
- The client auto-detects `wss:` under HTTPS, so a TLS-terminating proxy works without config.

---

## 15. Known Gaps, Bugs, and Stale Docs

Things worth knowing before you build on this.

**Real bugs**
1. **ATEM connection status is never actually false.** `normalizeAtemState()` never writes a `connected` field, and every status check is `state?.connected !== false`. Since `undefined !== false`, a disconnected ATEM reports **`"connected"`** to the drawer LED, the Settings page, and `/health`. This directly violates the project's "connection status is always unambiguous" principle and should be fixed first — `atem.js` needs to track and expose a real `connected` boolean.
2. **Adding a device does not connect it.** `POST /api/devices` writes config and returns `status: 'disconnected'` — there's an explicit `TODO` at `server/index.js:94`. The device only comes online after a server restart. Same for IP changes via `PUT`.
3. **CORS middleware is unreachable for GET.** It's registered *after* the `app.get('*')` SPA catch-all, so GET responses never carry CORS headers. It only takes effect for POST/PUT/DELETE. Move it above the routes.
4. **The SPA catch-all swallows unknown API GETs** — a typo'd `/api/whatever` returns `index.html` with a 200 instead of a 404.
5. **HyperDeck `recordingTimeRemaining` is displayed but never parsed** from the real device (only `recordingTime` is). The slot "time free" readout will read 0 on real hardware.
6. **Settings page per-device status is aggregate, not per-device** — with 3 HyperDecks, if any one is connected all three show green. Noted in a comment at `SettingsPage.jsx:225`.

**Intentional deviations worth knowing**
- **Teranex does optimistic state updates server-side** (`teranex.js:477`) — it writes the new value into local state immediately after a successful socket write, before the device confirms. This is a deliberate latency trade-off but it's the one place the app can display a value the hardware hasn't acknowledged.
- **Vite's `/ws` proxy is dead config** — `useATEMState` connects straight to `:3000` in dev rather than through the proxy.
- **`TabBar/` is dead code** — superseded by `NavigationDrawer`, never deleted.

**Stale documentation**
- `README.md` still describes Phase 1 as the current frontier and lists the camera grid, CUT, and AUTO as unimplemented. It is roughly four phases out of date.
- `CLAUDE.md` still documents a separate `WS_PORT=3001`. There is no second port — the WebSocket rides on the HTTP server. It also documents the VideoHub command as `setRoute`; the implemented name is `route`.

**Hardware caveats**
- ATEM allows only one control connection at a time — ATEM Software Control must be closed for this app to connect.
- ATEM won't reliably show up in a TCP port scan (it's UDP); the scanner works around this but manual add is the fallback.
- Media player input IDs (3010/3020) in the ATEM mock carry a `TODO(hardware)` — unverified against the target model.

**Uncommitted work in the tree right now:** 32 files, +1,337 / −260 lines. Biggest changes are ATEM state normalization (`atem.js` +227), the network scanner (+268), and the client reconnection logic (`useATEMState.js` +266). This is the cloud-deployment and resilience work sitting on top of the last commit.
