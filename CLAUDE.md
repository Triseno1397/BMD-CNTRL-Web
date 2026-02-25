# CLAUDE.md — ATEM Control Application

## Project Identity

A professional-grade ATEM switcher control application built for live production environments. Quality bar: it should feel like Blackmagic Design shipped it.

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
- **Frontend:** React (Vite) — component-per-feature, no global state soup
- **Backend:** Node.js (Express) — thin HTTP + WebSocket bridge to ATEM
- **ATEM Communication:** `atem-connection` npm library (official Blackmagic protocol)
- **State sync:** Backend holds authoritative ATEM state; pushes diffs to frontend via WebSocket
- **Dev access:** Vite dev server bound to `0.0.0.0` — accessible from iPhone on local network without any additional tooling

### State Model
```
ATEM Hardware
    ↕ (atem-connection / UDP)
Node.js Backend  ←→  In-memory state store
    ↕ (WebSocket)
React Frontend   ←→  Derived UI state only
```

Frontend never writes to local state. It sends commands → backend → ATEM → state update → broadcast back.

### Directory Structure
```
/
├── server/
│   ├── index.js          # Express + WebSocket server
│   ├── atem.js           # ATEM connection, command handlers, state emitter
│   └── config.js         # ATEM IP, port, reconnect policy
├── client/
│   ├── src/
│   │   ├── components/   # One folder per feature slice
│   │   ├── hooks/        # useATEMState, useWebSocket
│   │   ├── lib/          # WebSocket client, command helpers
│   │   └── App.jsx
│   └── vite.config.js
├── CLAUDE.md
└── package.json
```

---

## Development Environment

**Platform:** Windows. No Mac dependency.

**Mobile preview:** Vite dev server on `0.0.0.0:5173`. Access from iPhone via `http://<machine-LAN-IP>:5173`. No tunnel required on local network.

**ATEM not available:** Backend must run in a **mock mode** (`ATEM_MOCK=true`) that simulates state and responds to commands locally. Frontend is unaware of mock vs. real. UI is fully testable without hardware.

---

## Build Phases

### Phase 1 — M/E Core (current)

Deliver as a single vertical slice. Each item below is complete before the next begins.

| # | Feature | Done when |
|---|---------|-----------|
| 1 | WebSocket state sync | Frontend receives live ATEM state object |
| 2 | Camera source grid | 8 buttons (data-driven labels), correct PGM/PVW highlight |
| 3 | CUT | Executes cut, UI reflects result |
| 4 | AUTO + MIX transition | Executes auto, rate configurable |
| 5 | USK1 on-air toggle | Button reflects true on-air state |
| 6 | DSK1 on-air toggle | Button reflects true on-air state |
| 7 | Connection status indicator | Always visible; shows connected / reconnecting / disconnected |

### Phase 2 — AUX Bus Routing

Single AUX bus, source selector, true state reflection. Architecture from Phase 1 must require no structural changes to support this.

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
## Agent Operating Model
This project follows the 3-layer architecture defined in AGENTS.md.
Deliverables here are a running Node.js server + React client, not cloud documents.
Intermediates (build artifacts, temp configs) go in `.tmp/` per AGENTS.md convention.
Directives for each feature live in `directives/`.
