# 06_lobby_and_matchmaking.md
## MANDATE: The District Game — Lobby, Rooms, and Matchmaking (Online)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `03_game_state_machine.md` (Room machine + phases)
- `05_networking_protocol.md` (CREATE_ROOM / JOIN_ROOM / READY flow)

This document defines the **player experience** and **server rules** for:
- private rooms (invite code)
- lobby readiness flow
- loading / match start handoff
- optional public matchmaking queue (recommended but not required for MVP)

> Hard constraint: the game is always **3 players** per match.

---

## 1. Goals

1) Let players form groups fast (like Zynga Poker): **create → invite → ready → start**.
2) Support smooth UX:
   - instant join feedback
   - no blocking UI during network calls
   - clear “who is ready / who is loading”
3) Prevent common lobby problems:
   - grief-ready toggling
   - host abandoning at the last second
   - long loading stalls / dead lobbies
4) Make it deterministic and easy to implement using the existing room phases.

---

## 2. Lobby Types

### 2.1 Private Room (MVP Required)
- A player creates a room and receives an **invite code**.
- Friends join via invite code.
- Once 3 players are in, the group readies up and starts.

### 2.2 Public Matchmaking (Optional, Recommended)
- A player hits “Play” and is placed in a queue.
- When 3 players are available, the server creates a match room and assigns seats automatically.

You can ship MVP with private rooms only, then add matchmaking later with minimal refactor.

---

## 3. Room Identity and Invite Codes

### 3.1 Room ID vs Invite Code
- `room_id`: server internal identifier (UUID-like).
- `invite_code`: short code shown to players (6–8 chars), e.g. `K7M2Q9`.

**Rules**
- `invite_code` maps 1:1 to an active room.
- Codes must be unique among active rooms.
- When a room is closed, its code may be recycled after a cooldown (recommended 10 minutes).

### 3.2 Joining Rules
- A player can join only if:
  - room exists
  - room is in a joinable phase (`ROOM_OPEN` or `ROOM_READY_CHECK`)
  - room is not full (max 3 seats)
  - player is not banned/kicked (optional)

---

## 4. Player Identity in Lobby

Each player in a room has:
- `player_id` (stable for the session)
- `display_name` (editable)
- `seat` (LEFT/RIGHT/INDEP) — assigned at match start (or earlier if you prefer)
- `ready` (boolean)
- `loading_state`: `NOT_LOADED | LOADING | LOADED`
- `connection_state`: `CONNECTED | DISCONNECTED_GRACE`

**Important UX**
- Show connection state in lobby immediately (red dot / reconnecting indicator).

---

## 5. Room Phases and UX

This section maps **UI screens** to **RoomPhase** (from `03_game_state_machine.md`).

### 5.1 ROOM_OPEN (Joinable Lobby)
**Player sees**
- Room header: invite code + copy button
- 3 seat slots (empty slots show “Invite player”)
- Leave button

**Host sees**
- “Start” button disabled until 3/3 seats are filled

**Non-host sees**
- “Waiting for host”

**Transitions**
- If 3 players present:
  - host may trigger `START_READY_CHECK`
  - or auto-trigger ready check after a short delay (recommended 2s)

---

### 5.2 ROOM_READY_CHECK
**Player sees**
- Ready button (toggle)
- list of players with ready indicators
- optional: “Kick” (host only, see 8.2)

**Rules**
- Ready check requires **all 3 players ready**.
- If any player unreads, the match cannot start.

**Anti-grief recommendations**
- Minimum cooldown on toggling ready (e.g., 500ms).
- If a player toggles > N times in short window, throttle.

**Exit**
- All ready → `ROOM_LOADING`
- Someone leaves → `ROOM_OPEN`
- Host cancels → `ROOM_OPEN`

---

### 5.3 ROOM_LOADING (Asset Sync Gate)
Purpose: avoid the “one player stuck at 0% forever” problem.

**Player sees**
- loading overlay with each player’s status:
  - Loaded / Loading… / Not Loaded
- small spinner + “Optimizing effects…”

**Rules**
- Each client sends `CLIENT_LOADED(asset_manifest_version)`
- Server starts `LOADING_TIMER` (recommended 30s)

**On timer expiry**
- Recommended behavior: proceed into match anyway and let the lagging client stream assets.
- If the lagging client fails to load critical assets and crashes, reconnect policy will handle it.

---

### 5.4 ROOM_IN_MATCH
Lobby UI transitions into match UI:
- fade out lobby
- show “Round 1” splash
- then hand + districts appear

This is where Match Machine begins.

---

### 5.5 ROOM_POST_MATCH (Optional)
After match result:
- show scoreboard
- options:
  - “Rematch” (all 3 must accept)
  - “Back to Lobby”
  - “Leave”

---

## 6. Matchmaking (Optional Public Queue)

### 6.1 Player Entry Points
- “Play (Public)” places player into queue.
- “Play with Friends” creates a private room.

### 6.2 Matchmaking Constraints (v0.1 simple)
- First-come-first-served grouping into 3.
- Optional soft region preference (lowest latency).
- Optional MMR later.

### 6.3 Matchmaking Flow
1) Client sends `QUEUE_JOIN(mode="public")` (new intent; not in 05 yet)
2) Server responds with queue status
3) When matched:
   - server creates a room
   - assigns 3 players
   - pushes `MATCH_FOUND(room_id)` then `MATCH_LOADING_BEGIN`

### 6.4 Cancel
- Client can `QUEUE_LEAVE()`
- Server confirms removal

> If you want, I can extend `05_networking_protocol.md` with the queue intents/events cleanly.

---

## 7. Seat Assignment Policy

You have two good options:

### Option A (Recommended): Assign seats at MATCH_STARTED
- In lobby, show players without seat labels (or show neutral).
- When match starts, server assigns LEFT/RIGHT/INDEP randomly (or by join order).
- Pros: simpler lobby, less conflict.
- Cons: players can’t pre-plan roles.

### Option B: Assign seats on join order
- Seat 1 = LEFT, Seat 2 = RIGHT, Seat 3 = INDEP
- Pros: predictable.
- Cons: encourages seat-sniping.

**Recommendation**
- Use Option A (random) for fairness unless your community strongly prefers fixed roles.

---

## 8. Host Privileges and Moderation

### 8.1 Host Definition
- The creator of the room is the host.
- If host leaves before match starts:
  - host is reassigned to the longest-present remaining player (or next join order).

### 8.2 Kick (Optional but helpful)
Host may kick a player during `ROOM_OPEN` or `ROOM_READY_CHECK`:
- `KICK_PLAYER(player_id)` intent (not in 05 yet)
- Kicked player cannot rejoin for X minutes (recommended 5)

This prevents deadlock when someone joins and goes AFK.

---

## 9. Disconnections in Lobby

### 9.1 Disconnect During ROOM_OPEN / READY_CHECK
- Mark player `DISCONNECTED_GRACE`
- Keep their seat reserved for a short grace time (recommended 60s)
- If they reconnect:
  - restore them to the same seat/slot
- If grace expires:
  - remove player from room
  - transition back to `ROOM_OPEN` (if needed)

### 9.2 Disconnect During ROOM_LOADING
- Continue loading timer
- If loading completes but player still disconnected:
  - proceed into match (recommended)
  - game rules for timeouts/autoplay apply once in match

---

## 10. UX Requirements for “Zynga Poker Smoothness”

### 10.1 Instant Feedback
Every button press should show immediate local feedback:
- disable button for 150–300ms to prevent double taps
- show optimistic UI state (e.g., ready toggle), but revert if server rejects

### 10.2 Transitions
- Lobby → Loading: fade + status list
- Loading → Match: short splash (0.8–1.2s), then reveal hand + districts
- If reconnecting: show small banner “Reconnecting…”

### 10.3 Fullscreen
- Provide a prominent “Fullscreen” toggle in lobby and match.
- Remember preference locally.

---

## 11. Minimal UI Specification (Lobby)

### 11.1 Screens
1) Home
   - Play Public (optional)
   - Play with Friends (Create Room)
   - Join Room (enter invite code)
2) Lobby Room
   - 3 seats list
   - invite code + copy
   - ready button
   - host controls
3) Loading Overlay
   - per-player load status
4) Match Screen (handled elsewhere)

### 11.2 Lobby Visual Priorities
- Invite code is the primary element in private rooms.
- Ready status is the second.
- Connection status is always visible.

---

## 12. Failure Modes and Handling

### 12.1 Room Not Found
- Show “Room expired or code invalid”
- Offer Create Room button

### 12.2 Room Full
- Show “Room is full”
- Offer Create Room

### 12.3 Version Mismatch
- Show “Update required”
- Force refresh

### 12.4 Stuck Loading
- After 30s, show “Continuing… assets may stream in”
- Enter match anyway (recommended)

---

## 13. Implementation Checklist

- [ ] Private room create/join with invite code
- [ ] Seat capacity fixed at 3
- [ ] Ready check with all-3 requirement
- [ ] Loading gate with per-player loaded status
- [ ] Graceful disconnect handling in lobby
- [ ] Host reassignment if host leaves
- [ ] Clear events: ROOM_STATE drives all lobby UI updates
- [ ] Optional: matchmaking queue for public play

---
