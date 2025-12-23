# 10_engineering_architecture.md
## MANDATE: The District Game — Engineering Architecture (Client + Server + Deployment)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `03_game_state_machine.md` (authoritative phases)
- `04_data_model_cards_and_districts.md` (schemas)
- `05_networking_protocol.md` (WebSocket protocol)
- `09_asset_pipeline.md` (asset manifest + atlases)
- `07_ui_layout_spec.md` + `08_animation_and_vfx_styleguide.md` (client rendering/interaction)

This document defines a production-oriented architecture for a **3-player real-time online card game** with:
- browser-first WebGL client (Hearthstone-like feel)
- server-authoritative gameplay (Zynga Poker-like reliability)
- lobbies/rooms + reconnect
- smooth animations + deterministic game logic

---

## 1. High-Level Architecture

### 1.1 Components
1) **Web Client (WebGL)**
   - Rendering, input, animations
   - Sends intents, applies server events
   - Loads assets via manifest/atlases

2) **Realtime Game Server (Authoritative)**
   - Room management (lobby)
   - Match/Round state machine
   - Validates intents, resolves claims
   - Broadcasts events, sends snapshots

3) **Static Asset Hosting**
   - CDN hosting of `asset_manifest.json`, atlases, card fronts, icons
   - Versioned asset URLs for caching

4) **Optional Services (later)**
   - Auth
   - Matchmaking queue
   - Analytics/telemetry
   - Persistence (user profiles, cosmetics)

---

## 2. Technology Recommendations (Practical)

### 2.1 Client (Browser)
- **TypeScript**
- **WebGL Renderer**: PixiJS (recommended) or Phaser
- **UI state**: minimal store (Zustand/Redux-like) or custom reducer
- **Animation**:
  - card transforms: tweens (GSAP or custom)
  - particles/shaders: Pixi filters / custom fragment shaders
- **Asset loading**:
  - manifest-driven preload
  - atlas sprites for card fronts

### 2.2 Server
- **Node.js + TypeScript** (fast iteration) OR **Go** (higher concurrency)
- **Realtime**: WebSocket
- Optional framework: **Colyseus** (rooms + state sync), but you can also build custom.

### 2.3 Data
- In-memory room state (primary)
- Optional persistence:
  - Redis for room registry / short-lived state (reconnect)
  - Postgres for accounts and cosmetics (later)

---

## 3. Client Architecture

### 3.1 Client Modules

#### A) `net/` (Networking)
Responsibilities:
- connect WS
- HELLO/resume
- send intents with `client_intent_id`
- receive events with `event_seq`
- buffer and apply in-order
- request snapshot on gaps

Key classes:
- `WsClient`
- `EventSequencer`
- `IntentDispatcher`

#### B) `state/` (Game State Store)
Responsibilities:
- hold latest authoritative snapshot (public + private)
- derived selectors (legal targets, active seat, claimed counts)
- keep separate:
  - `authoritativeState` (server truth)
  - `uiState` (hover/drag/transient)

Recommended pattern:
- reducer-driven store:
  - `applyEvent(event)` mutates a local immutable model
  - UI queries selectors

#### C) `rules/` (Client-side helpers, NOT authoritative)
Responsibilities:
- compute legal targets *for UX only*
- show previews, highlights
- must match server rules to avoid confusion
- never decide outcomes

#### D) `render/` (WebGL Scene Graph)
Responsibilities:
- create and manage scenes:
  - LobbyScene
  - MatchScene
- map state → sprites and animations
- maintain Z-order (per `07_ui_layout_spec.md`)

#### E) `input/` (Interactions)
Responsibilities:
- pointer/drag logic
- pick tests (card hitboxes, slot hitboxes)
- input gating (disable while awaiting server)

#### F) `vfx/` (Effects)
Responsibilities:
- implement VFX profiles (`08_animation_and_vfx_styleguide.md`)
- intensity scaling by value
- district claim effects
- quality scaling under load

#### G) `assets/` (Manifest & Loading)
Responsibilities:
- load `asset_manifest.json`
- load atlases
- resolve `card_def_id` → sprite frame
- manage caching/version changes

---

### 3.2 Client Data Flow (Authoritative Event Model)
1) receive `EVENT`
2) `EventSequencer` validates `event_seq`
3) `state.applyEvent(event)`
4) `render.sync(state)` updates sprites
5) `vfx.react(event)` plays effects

Local input flow:
1) user drags card
2) UI highlights legal targets (client-side helper)
3) user drops
4) send `PLAY_CARD` intent
5) card enters “pending” state until server confirms via `CARD_PLAYED` event

---

### 3.3 Scene Structure (Web)
- `AppRoot`
  - `LobbyScene`
  - `MatchScene`
  - `OverlayLayer` (modals, toasts, reconnect banner)

Use a single canvas to avoid context churn.

---

## 4. Server Architecture (Authoritative)

### 4.1 Server Modules

#### A) `rooms/`
- create/join/leave
- invite code mapping
- room lifecycle (open → ready → loading → in match)

#### B) `match/`
- match object (BO3)
- round objects
- score tracking and tiebreak

#### C) `round/`
- deck build/shuffle/deal
- district state
- turn loop states

#### D) `rules_engine/`
Pure deterministic evaluation functions:
- validate move legality
- evaluate configurations
- resolve district claims
- determine round/match winner
This must be unit-tested heavily.

#### E) `protocol/`
- parse intents
- validate schema
- route to room/match/round handlers
- build event payloads

#### F) `reconnect/`
- connection overlay state
- resume with `last_event_seq`
- snapshots

#### G) `telemetry/` (optional early)
- record accepted intents + emitted events (for replay/debug)

---

### 4.2 Authoritative Loop
Per room:
- single-threaded event queue per room (recommended)
- process one intent at a time
- emit events in deterministic order

This avoids race conditions and makes replay trivial.

---

### 4.3 Event Log (Recommended)
Each room maintains:
- `event_seq`
- append-only log of events (bounded)
- last full snapshot (cached)

On reconnect:
- if gap small: replay missing events
- else: send full snapshot

---

## 5. Data Storage Strategy (Pragmatic)

### 5.1 MVP (No Accounts)
- ephemeral rooms
- memory-only state
- optional Redis for reconnect survivability during server restarts (not required initially)

### 5.2 Production (Accounts + Cosmetics)
- Auth service (JWT)
- Postgres: users, inventory, cosmetics
- Redis: session tokens, room registry, matchmaking queue

---

## 6. Deployment Topology

### 6.1 Minimal Deployment
- 1× game server
- 1× CDN/static hosting (Netlify/Vercel/S3+CloudFront)
- HTTPS termination (reverse proxy)

### 6.2 Scale-Out
- multiple game server instances
- shared Redis for:
  - invite code → room routing
  - matchmaking queue
- sticky sessions or connection routing:
  - client connects to the correct server based on room mapping

---

## 7. Performance Targets and Constraints

### 7.1 Client
- 60 FPS target on desktop
- asset loading before match start
- keep draw calls low:
  - use atlases
  - batch sprites

### 7.2 Server
- low latency intent processing (< 20ms typical)
- stable room tick (not physics-based; event-driven)
- protect against spam (rate limits)

---

## 8. Security & Fair Play (Baseline)

- server authoritative
- never trust client legality
- only send private hand contents to the owner
- prevent seat spoofing (token-bound seat)
- log suspicious intent patterns

(Full details can later go into `11_security_and_fair_play.md`.)

---

## 9. Testing Strategy (Must-Have)

### 9.1 Rules Engine Unit Tests
- all configuration evaluations
- all tie-break paths
- Ace run rules (A–2–3 and 9–10–A)
- Crisis constraints
- claim trigger conditions

### 9.2 Server Integration Tests
- full match simulation with scripted intents
- reconnect mid-turn
- timeout auto-play

### 9.3 Client Tests (Lightweight)
- event sequencing
- snapshot apply correctness
- input gating logic

---

## 10. Repository Layout (Suggested)

mandate/
client/
src/
net/
state/
rules/
render/
input/
vfx/
assets/
public/
assets_runtime/ (built output or fetched)
server/
src/
rooms/
match/
round/
rules_engine/
protocol/
reconnect/
telemetry/
tools/
asset_pipeline/
docs/
02_digital_ruleset.md
03_game_state_machine.md
...

---

## 11. Build Pipeline Overview

### 11.1 Assets
1) Run asset pipeline:
   - normalize Canva exports
   - build atlases
   - generate manifests
2) Upload to CDN with content hashes.

### 11.2 Client
- build TypeScript bundle
- deploy to static hosting

### 11.3 Server
- build + deploy
- configure environment:
  - WS endpoint
  - asset manifest URL
  - Redis (optional)

---

## 12. MVP Milestone Plan (Vertical Slice)

### Milestone 1 — Local Single-Client Prototype
- render table
- drag & drop card to district
- local-only validation
- placeholder animations

### Milestone 2 — Server Authoritative (2 clients)
- WS intents/events
- server validates moves
- update both clients

### Milestone 3 — Full 3-Player Loop
- lobby create/join
- ready check
- start match
- full round loop with claims
- round end condition

### Milestone 4 — Polish Pass
- VFX profiles
- smooth transitions
- reconnect + timeout
- performance scaling

---

## 13. Non-Goals for v0.1 (Scope Control)

- ranked matchmaking / MMR
- spectators / replays UI (log exists but no UI)
- trading / economy
- mobile portrait mode
- complex cosmetics store

---

## 14. Implementation Checklist

- [ ] Client: WS connect + sequencing
- [ ] Client: scene + zones + drag/drop
- [ ] Client: manifest + atlas loading
- [ ] Server: room lifecycle
- [ ] Server: match/round state machine
- [ ] Server: rules engine + tests
- [ ] Server: snapshots + reconnect
- [ ] Deploy: CDN assets + client + server

---