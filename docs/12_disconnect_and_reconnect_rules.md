# 12_disconnect_and_reconnect_rules.md
## MANDATE: The District Game — Disconnect, Reconnect, AFK, and Forfeit Rules
Version: v0.1 (implementation-ready draft)  
Depends on:
- `02_digital_ruleset.md` (turn loop + timers)
- `03_game_state_machine.md` (connection overlay + timeouts)
- `05_networking_protocol.md` (resume, snapshots, event sequencing)

This document defines **exact policies** for:
- disconnect detection
- reconnect grace windows
- how turns proceed while a player is disconnected
- AFK behavior (timeouts)
- forfeits and match termination
- UX requirements (what the user sees)

Goal: prevent stalling and preserve a fair, fast experience.

---

## 1. Definitions

### 1.1 Connection States (Overlay)
Per player:
- `CONNECTED`
- `DISCONNECTED_GRACE`
- `FORFEITED`

### 1.2 “Disconnect”
A disconnect occurs if:
- WebSocket closes unexpectedly, OR
- heartbeat fails (missing PONG within threshold), OR
- network error triggers socket teardown

### 1.3 “AFK / Timeout”
A player is AFK if they fail to take an action before the **turn timer** expires while still technically connected.

---

## 2. Core Policy Summary (v0.1)

1) The match **never pauses** for disconnects (recommended).  
2) If a player is disconnected or AFK on their turn, the server will:
   - **auto-play** a legal move if possible
   - otherwise **auto-pass**
3) A disconnected player has a **grace period** to return:
   - if they return within grace, they resume normally
4) If grace expires:
   - player **forfeits the match**

This keeps the game moving and prevents “rage disconnect to freeze”.

---

## 3. Timers (Recommended Defaults)

### 3.1 Heartbeat
- Server sends `PING` every **10s**
- Client must respond with `PONG` within **5s**
- If no PONG for **30s** → considered disconnected

### 3.2 Reconnect Grace
- `RECONNECT_GRACE_SECONDS = 45`

### 3.3 Turn Timer
- `TURN_SECONDS = 25`

### 3.4 Crisis Declaration Timer
- `CRISIS_SECONDS = 10`

These values should be configurable server-side.

---

## 4. Behavior While Disconnected

### 4.1 If Disconnected Player is NOT Active
- Game continues for others as normal.
- Disconnected player’s state remains “frozen” only in the sense they cannot send intents.
- Their hand remains private; no additional leakage.

### 4.2 If Disconnected Player IS Active
- Their turn timer continues counting down.
- On timer expiry, apply **Auto-Action** (Section 6).

---

## 5. Reconnect Behavior

### 5.1 Resume Flow
When a player reconnects, client sends `HELLO` with:
- `resume.room_id`
- `resume.last_event_seq`

Server response:
- If server can replay missing events → send events in order
- Else → send `FULL_SNAPSHOT`

### 5.2 Snapshot Contents (Required)
On successful resume, server must send:
- current room/match/round phases
- active seat
- timers remaining
- public board state
- private hand for that player
- last applied `event_seq`

### 5.3 UX Requirements
Client must show:
- “Reconnecting…” banner when disconnected
- “Reconnected” brief toast (1s) when back
- If forfeited: “You forfeited due to disconnect” modal

---

## 6. Auto-Action Rules (AFK + Disconnect)

Auto-actions must be deterministic and logged.

### 6.1 When Auto-Action Triggers
Auto-action triggers when:
- turn timer expires while player is `CONNECTED` (AFK)
- turn timer expires while player is `DISCONNECTED_GRACE`

### 6.2 Auto-Action Selection (Deterministic)
If at least one legal play exists:
1) Enumerate all legal placements:
   - all cards in hand × all legal districts × all free slots on their side
2) Sort deterministically by:
   1. `district_index` ascending (D0..D6)
   2. `slot_index` ascending (0..2)
   3. `card_def_id` lexicographic
3) Choose:
   - Option A (recommended): pick the **first** in the sorted list (pure deterministic)
   - Option B: pick random among legal moves using server RNG seed (also deterministic if seeded)

**Recommendation:** Option A for maximum auditability.

If no legal play exists:
- auto-pass

### 6.3 Crisis Auto-Declare
If a Crisis card was played and declaration timer expires:
- Enumerate all legal declarations:
  - colors: 6
  - values: 2..10
- Choose deterministically:
  - Option A: first by canonical order:
    - color order: institution, base, media, capital, ideology, logistics
    - value order: 2..10
  - Option B: random with server RNG seed

**Recommendation:** Option A.

### 6.4 Broadcasting Auto-Actions
When auto-action happens, server emits the same gameplay events as a normal action, plus a flag:

Example: `CARD_PLAYED.payload.source = "AUTO"`

```json
{
  "type": "CARD_PLAYED",
  "payload": {
    "seat": "RIGHT",
    "source": "AUTO",
    "district_id": "D2",
    "slot_index": 0,
    "card": { "..."}
  }
}
This is important for transparency.
7. Forfeit Rules
7.1 When Forfeit Happens
A player forfeits if:
they remain disconnected beyond grace (RECONNECT_GRACE_SECONDS)
OR they voluntarily forfeit (optional feature) using FORFEIT_MATCH intent
7.2 Consequences
On forfeit:
Match ends immediately.
Remaining players:
If 2 players remain (typical in 3-player game):
winner is determined by a fixed policy below.
7.3 Winner Determination on Forfeit (3-player)
Policy options:
Option A (Recommended v0.1): “Remaining players win by standings”
If one player forfeits:
the match continues? (not recommended; complicated)
Instead:
end match immediately
the winner is the player with the higher current match advantage:
match score (round wins)
current round claimed districts
if still tied: best configuration achieved so far
if still tied: coinflip (logged)
This yields a deterministic and fast resolution.
Option B: Continue as 2-player
Not recommended because it changes the game’s nature.
Recommendation: Option A.

7.4 Broadcast
Server emits:
PLAYER_FORFEITED(seat, reason)
MATCH_RESULT(winner, reason="FORFEIT")
8. AFK Escalation (Optional but Strongly Recommended)
Even if a player stays connected but repeatedly times out, it ruins experience.
8.1 AFK Strike System
Each turn timeout = 1 AFK strike
If strikes reach 3 in one match:
forfeit the player
8.2 Strike Reset
strikes reset each match (not persistent)
8.3 UX
show warning on 2 strikes:
“One more timeout and you will forfeit.”
9. Lobby Disconnect Rules (Pre-Game)
9.1 During ROOM_OPEN / READY_CHECK
reserve seat for LOBBY_GRACE_SECONDS = 60
if player returns, restore
if grace expires, remove them from room
9.2 During ROOM_LOADING
do not block forever
after loading timer, start match anyway
disconnected player will be subject to turn timers and potential forfeits
10. Edge Cases
10.1 Disconnect During Crisis Declaration
crisis timer continues
if it expires: auto-declare (Section 6.3)
10.2 Disconnect During Snapshot Catch-up
client may reconnect again; server uses last_event_seq to resume
if repeated reconnect storms occur, throttle resume attempts
10.3 Server Restart (Optional)
If you want resilience:
store room registry + last snapshot in Redis
on restart: attempt to restore active rooms
If not implemented in v0.1:
server restart ends rooms; clients see “Match ended (server restart)”
11. Telemetry (For Tuning)
Record per match:
disconnect count per seat
total disconnect duration
AFK strikes
auto-actions taken
forfeits
Use these to tune timers.
12. Implementation Checklist
 Heartbeat detection with thresholds
 Connection overlay states per player
 Reconnect grace timer (45s)
 Deterministic auto-play and auto-declare crisis
 Emit source="AUTO" for auto-actions
 Forfeit on grace expiry
 Match resolution on forfeit (policy implemented)
 Lobby grace behavior (60s)
 Optional AFK strike system (3 strikes)
 Snapshot on reconnect with timers remaining