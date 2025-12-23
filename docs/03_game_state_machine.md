# 03_game_state_machine.md
## MANDATE: The District Game — Game State Machine (Online Play)
Version: v0.2 (implementation-ready draft)  
Depends on: `02_digital_ruleset.md` (Digital Ruleset)

This document defines the **authoritative server-side state machine** for:
- Room (Lobby) lifecycle
- Match lifecycle (Best of 3)
- Round lifecycle
- Turn lifecycle (Play → Claim Check/Resolve → Draw)
- Crisis declaration sub-flow
- Timers, timeouts, and deterministic resolution order
- Reconnect snapshot + resync behavior

---

## 1. Core Principles

### 1.1 Server-Authoritative
Clients send **intents** (“I want to play card X”), the server:
1) validates legality  
2) mutates authoritative state  
3) broadcasts resulting **events** to all clients

### 1.2 Determinism
Given the same:
- shuffled deck order
- sequence of accepted intents
the game must always produce the same outcomes.

### 1.3 Input Locking vs Animation
Rules do **not** depend on animations.
However, the server may set “input windows” and clients may locally gate interaction while effects play.

---

## 2. State Machine Layers

There are 3 nested state machines:

1) **Room Machine**: lobby + readiness + loading
2) **Match Machine**: BO3 across rounds
3) **Round Machine**: turn loop + claim resolution

Additionally there is a **Connection Overlay** (connected/disconnected) that can trigger timeouts.

---

## 3. Canonical Enums (Recommended)

### 3.1 RoomPhase
- `ROOM_OPEN` (joinable)
- `ROOM_READY_CHECK` (ready up)
- `ROOM_LOADING` (clients load assets)
- `ROOM_IN_MATCH`
- `ROOM_POST_MATCH` (results / rematch options)
- `ROOM_CLOSED`

### 3.2 MatchPhase
- `MATCH_INIT`
- `MATCH_ROUND_INIT`
- `MATCH_ROUND_ACTIVE`
- `MATCH_ROUND_END`
- `MATCH_END`

### 3.3 RoundPhase
- `ROUND_SETUP`
- `ROUND_DEAL`
- `ROUND_START`
- `TURN_START`
- `TURN_AWAIT_ACTION`
- `TURN_AWAIT_CRISIS_DECLARATION`
- `TURN_RESOLVE_PLAY`
- `TURN_CLAIM_CHECK`
- `TURN_CLAIM_RESOLVE`
- `TURN_DRAW`
- `TURN_END`
- `ROUND_END_CHECK`
- `ROUND_END`

### 3.4 ConnectionState (Overlay)
- `CONNECTED`
- `DISCONNECTED_GRACE`
- `FORFEITED`

---

## 4. Room Machine (Lobby → Match)

### 4.1 ROOM_OPEN
**Entry invariants**
- Room is joinable.
- Seats fixed at 3.
- No match object exists.

**Allowed intents**
- `JOIN_ROOM(room_id)`
- `LEAVE_ROOM()`
- `SET_DISPLAY_NAME(name)` (optional)
- `SET_COSMETICS(...)` (optional, non-gameplay)

**Transitions**
- When exactly 3 seats filled → allow host (or auto) to trigger ready check:
  - `START_READY_CHECK()` → `ROOM_READY_CHECK`

---

### 4.2 ROOM_READY_CHECK
**Entry actions**
- Set all players: `ready=false`
- Broadcast: `READY_CHECK_STARTED`

**Allowed intents**
- `SET_READY(true/false)`
- `LEAVE_ROOM()`
- Host: `CANCEL_READY_CHECK()`

**Transitions**
- If someone leaves → `ROOM_OPEN`
- If host cancels → `ROOM_OPEN`
- If all 3 ready → `ROOM_LOADING`

---

### 4.3 ROOM_LOADING
Purpose: ensure clients have loaded required assets before authoritative match begins.

**Entry actions**
- Broadcast: `MATCH_LOADING_BEGIN(required_asset_manifest_version)`
- Start `LOADING_TIMER` (recommended 30s)

**Allowed intents**
- `CLIENT_LOADED()` (per client ack)
- `LEAVE_ROOM()`

**Transitions**
- If all 3 send `CLIENT_LOADED()` before timer → `ROOM_IN_MATCH`
- If timer expires:
  - Option A (recommended): proceed anyway, clients continue streaming assets → `ROOM_IN_MATCH`
  - Option B: abort back to ready check (more strict)

---

### 4.4 ROOM_IN_MATCH
**Entry actions**
- Lock room (no new joins)
- Assign roles/seats (Left/Right/Independents)
- Create Match object
- Transition to `MATCH_INIT`

---

### 4.5 ROOM_POST_MATCH
**Entry actions**
- Broadcast results, show scoreboard

**Allowed intents**
- `REQUEST_REMATCH()` (optional)
- `LEAVE_ROOM()`

**Transitions**
- If rematch supported and all 3 agree → `ROOM_READY_CHECK`
- Otherwise → `ROOM_CLOSED` when empty

---

### 4.6 ROOM_CLOSED
Room is destroyed or archived.

---

## 5. Match Machine (Best of 3)

### 5.1 MATCH_INIT
**Entry actions**
- Initialize:
  - `match_score[player]=0`
  - `round_index=1`
  - `districts_won_total[player]=0` (for 1–1–1 tiebreak)
  - `best_config_achieved[player]=None` (track strongest ever achieved)

**Transition**
- → `MATCH_ROUND_INIT`

---

### 5.2 MATCH_ROUND_INIT
**Entry actions**
- Determine `starting_player` by `round_index`
- Create Round object (fresh districts, fresh deck)
- Broadcast: `ROUND_LOADING(round_index, starting_player)`

**Transition**
- → `MATCH_ROUND_ACTIVE` (which delegates to Round Machine)

---

### 5.3 MATCH_ROUND_ACTIVE
Delegates to Round Machine.
- When Round Machine emits `ROUND_WINNER(player)` → `MATCH_ROUND_END`

---

### 5.4 MATCH_ROUND_END
**Entry actions**
- Increment `match_score[winner] += 1`
- Add district counts won in this round into `districts_won_total`
- Update `best_config_achieved` if winner achieved stronger configuration than previously recorded
- Broadcast `ROUND_RESULT(round_index, winner, match_score)`

**Transitions**
- If any player has 2 round wins → `MATCH_END`
- Else if `round_index < 3`:
  - `round_index++` → `MATCH_ROUND_INIT`
- Else (after round 3) → `MATCH_END` (apply 1–1–1 tiebreak)

---

### 5.5 MATCH_END
**Entry actions**
- Determine match winner:
  1) If someone reached 2 round wins → winner
  2) Else 1–1–1 → apply tiebreak:
     - highest `districts_won_total`
     - if tied: highest `best_config_achieved`
     - if still tied: deterministic final fallback (recommended):
       - compare total raw pressure sums across all claimed districts
       - if still tied: random coinflip by server RNG seed (logged)
- Broadcast: `MATCH_RESULT(winner, final_breakdown)`
- Return control to Room Machine: → `ROOM_POST_MATCH`

---

## 6. Round Machine

### 6.1 ROUND_SETUP
**Entry actions**
- Create 7 District objects, all `open`
- Build deck (63 cards)
- Clear:
  - `claimed_districts[player]=0`
  - `round_best_config[player]=None`
- Transition → `ROUND_DEAL`

---

### 6.2 ROUND_DEAL
**Entry actions**
- Shuffle deck (server RNG)
- Deal 6 cards to each player
- Create draw pile from remaining cards
- Broadcast:
  - to each player: `HAND_SNAPSHOT(private_hand)`
  - to all: `PUBLIC_ROUND_SNAPSHOT(districts_empty, draw_count, hand_counts)`
- Transition → `ROUND_START`

---

### 6.3 ROUND_START
**Entry actions**
- Set `active_player = starting_player`
- Broadcast `ROUND_STARTED(active_player)`
- Transition → `TURN_START`

---

## 7. Turn Machine (inside Round)

### 7.1 TURN_START
**Entry actions**
- Start `TURN_TIMER` (recommended 25s)
- Broadcast `TURN_STARTED(active_player, legal_targets_hint_optional)`
- Transition → `TURN_AWAIT_ACTION`

---

### 7.2 TURN_AWAIT_ACTION
**Allowed intents (only active player)**
- `PLAY_CARD(card_id, district_id, slot_index)`
- `PASS()` (only if server confirms no legal moves OR as an allowed digital rule)

**Server validation on PLAY_CARD**
- card exists in hand
- district exists and is open
- slot belongs to that player
- slot available (<3 on that side)
- if card is Crisis: declaration required next

**Transitions**
- Valid non-crisis play → `TURN_RESOLVE_PLAY`
- Valid crisis play → `TURN_AWAIT_CRISIS_DECLARATION`
- PASS → `TURN_DRAW`
- Timer expiry:
  - if there is a legal play: server selects `AUTO_PLAY` (deterministic random among legal plays)
  - else: auto-pass
  - then continue flow exactly as if played/passed

**On invalid intent**
- Reject intent with `INTENT_REJECTED(reason_code)`
- Remain in `TURN_AWAIT_ACTION`

---

### 7.3 TURN_AWAIT_CRISIS_DECLARATION
**Entry actions**
- Start `CRISIS_TIMER` (recommended 10s)
- Broadcast `CRISIS_DECLARATION_REQUIRED(active_player, card_id)`

**Allowed intents (only active player)**
- `DECLARE_CRISIS(card_id, declared_color, declared_value_2_to_10)`

**Validation**
- declaration references the pending crisis card
- declared value is in [2..10] (not Ace)
- declaration not already set

**Transitions**
- On valid declaration → `TURN_RESOLVE_PLAY`
- On timer expiry:
  - server picks a declared (color,value) deterministically:
    - if UI has a last-highlighted selection, use it
    - else random legal (logged)
  - then → `TURN_RESOLVE_PLAY`

**On invalid intent**
- Reject with `INTENT_REJECTED`
- Stay in this state until valid or timeout

---

### 7.4 TURN_RESOLVE_PLAY
**Entry actions**
- Remove played card from hand
- Place it into district slot
- If crisis: store its declared identity and treat as that card for evaluation
- Broadcast:
  - `CARD_PLAYED(player, card_public_representation, district_id, slot_index)`
  - update hand counts for others

**Transition**
- → `TURN_CLAIM_CHECK`

---

### 7.5 TURN_CLAIM_CHECK
**Entry actions**
- Compute claimable districts:
  - any district where ≥2 players completed (3 cards)
  - or any district where a player has AAA (Total Mandate)
- If none → `TURN_DRAW`
- If some → `TURN_CLAIM_RESOLVE`

---

### 7.6 TURN_CLAIM_RESOLVE
**Entry actions**
Resolve all claimable districts in deterministic order:
1) Sort by `district_index` ascending (0..6)
2) For each district:
   - evaluate configurations among players who have 3 cards there
   - pick winner (deterministic tie rules)
   - set district claimed/closed
   - increment `claimed_districts[winner]`
   - update `round_best_config[winner]` if stronger than previous

**Broadcast**
- For each district resolved: `DISTRICT_CLAIMED(district_id, winner, winning_config_summary)`

**Transition**
- → `TURN_DRAW`

---

### 7.7 TURN_DRAW
**Entry actions**
- If draw pile not empty: draw 1 card to active player
- Broadcast:
  - to active player: updated `HAND_SNAPSHOT` delta or full
  - to all: `CARD_DRAWN(player, new_hand_count, draw_pile_count)`

**Transition**
- → `TURN_END`

---

### 7.8 TURN_END
**Entry actions**
- Stop `TURN_TIMER`
- Advance active player clockwise
- Broadcast `TURN_ENDED(previous_active_player)`
- Transition → `ROUND_END_CHECK`

---

## 8. Round End

### 8.1 ROUND_END_CHECK
**Condition**
- If any player has `claimed_districts[player] >= 3` → round ends immediately

**Transitions**
- If winner exists → `ROUND_END`
- Else → `TURN_START`

---

### 8.2 ROUND_END
**Entry actions**
- Determine `round_winner` (first to 3 districts)
- Broadcast:
  - `ROUND_ENDED(winner, claimed_districts, round_best_config)`
- Emit to Match Machine: `ROUND_WINNER(round_winner)`

---

## 9. Connection Overlay (Reconnect / Timeout)

This overlay does not change the base phases but affects timeouts and auto-actions.

### 9.1 On Disconnect
- Mark player `DISCONNECTED_GRACE`
- Start `RECONNECT_TIMER` (recommended 45s)
- If player is active and turn timer expires:
  - auto-play or auto-pass (same rules as normal timeout)

### 9.2 On Reconnect
- Mark player `CONNECTED`
- Send **authoritative snapshot** immediately:
  - RoomPhase + MatchPhase + RoundPhase
  - match score, round index
  - districts full state
  - draw pile count
  - their private hand
  - timers remaining (turn/crisis)
- Client must acknowledge with `SNAPSHOT_ACK(last_event_seq)`

### 9.3 On Grace Expiry
If `RECONNECT_TIMER` expires:
- Apply policy (recommended):
  - player becomes `FORFEITED`
  - match ends with remaining player(s) winner logic (define in disconnect policy doc)

---

## 10. Event Ordering and Idempotency

### 10.1 Sequence Numbers
All server → client events include:
- `event_seq` (monotonic per room)
- `room_id`, `match_id`, `round_id`

Clients ignore duplicate or out-of-order events.

### 10.2 Intent Tokens
Client → server intents include:
- `client_intent_id` unique per client
Server responds with:
- `INTENT_ACCEPTED(client_intent_id)`
or
- `INTENT_REJECTED(client_intent_id, reason)`

Prevents double-submit issues on lag.

---

## 11. Error Handling (Required)

### 11.1 Desync Recovery
If a client detects mismatch:
- client sends `REQUEST_SNAPSHOT()`
- server replies with `FULL_SNAPSHOT(event_seq_current)`

### 11.2 Invalid State Intents
If a client sends an intent not allowed in current phase:
- server rejects and includes `current_phase` in payload

---

## 12. Mermaid Diagrams

### 12.1 High-Level (Room → Match → Round)
```mermaid
stateDiagram-v2
  [*] --> ROOM_OPEN
  ROOM_OPEN --> ROOM_READY_CHECK: start ready
  ROOM_READY_CHECK --> ROOM_OPEN: cancel/leave
  ROOM_READY_CHECK --> ROOM_LOADING: all ready
  ROOM_LOADING --> ROOM_IN_MATCH: loaded/timeout
  ROOM_IN_MATCH --> ROOM_POST_MATCH: match end
  ROOM_POST_MATCH --> ROOM_READY_CHECK: rematch
  ROOM_POST_MATCH --> ROOM_CLOSED: empty
  ROOM_CLOSED --> [*]
12.2 Turn Subflow (with Crisis)
stateDiagram-v2
  TURN_START --> TURN_AWAIT_ACTION
  TURN_AWAIT_ACTION --> TURN_AWAIT_CRISIS_DECLARATION: play crisis
  TURN_AWAIT_ACTION --> TURN_RESOLVE_PLAY: play normal
  TURN_AWAIT_ACTION --> TURN_DRAW: pass/timeout(no moves)
  TURN_AWAIT_CRISIS_DECLARATION --> TURN_RESOLVE_PLAY: declare/timeout
  TURN_RESOLVE_PLAY --> TURN_CLAIM_CHECK
  TURN_CLAIM_CHECK --> TURN_CLAIM_RESOLVE: claimable
  TURN_CLAIM_CHECK --> TURN_DRAW: none
  TURN_CLAIM_RESOLVE --> TURN_DRAW
  TURN_DRAW --> TURN_END
13. Implementation Checklist (What “Finished” Means)
 All transitions are reachable and have clear triggers
 Every state has:
allowed intents
entry actions
timeout behavior
reject behavior
 Deterministic ordering rules exist for “multi-claim” turns
 Reconnect snapshot is fully specified
 Sequence numbering + idempotency is defined