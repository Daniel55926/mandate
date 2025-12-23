# 05_networking_protocol.md
## MANDATE: The District Game — Networking Protocol (WebSocket)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `02_digital_ruleset.md`
- `03_game_state_machine.md`
- `04_data_model_cards_and_districts.md`

This document defines the **client ↔ server WebSocket protocol** for:
- 3-player rooms and lobby/ready flow :contentReference[oaicite:0]{index=0}
- match/round/turn state synchronization
- intents (client actions) and events (server-authoritative outcomes)
- sequencing, idempotency, reconnect, and snapshots

---

## 1. Transport

### 1.1 WebSocket
- Single persistent WebSocket connection per client.
- Server is authoritative; clients send **intents** only.

### 1.2 Security (minimal baseline)
- Connection must be authenticated with a short-lived token (implementation detail).
- Server validates that a connection is bound to exactly one `player_id` and one `seat` inside a room.

(Full auth/anti-cheat policy can be expanded later in `11_security_and_fair_play.md`.)

---

## 2. Versioning

### 2.1 Protocol Version
All messages include:
- `protocol_version` (string), e.g. `"0.1"`
- `digital_ruleset_version` (string), e.g. `"0.1"`

If versions mismatch, server returns `ERROR_VERSION_MISMATCH` and closes connection.

---

## 3. Message Envelope

All messages are JSON objects with this top-level shape:

```json
{
  "protocol_version": "0.1",
  "room_id": "room_ab12",
  "op": "INTENT",
  "type": "PLAY_CARD",
  "client_intent_id": "c123-000045",
  "payload": {}
}
3.1 Required Fields
protocol_version: protocol semver-like string
room_id: nullable until joined/created
op: one of:
HELLO (handshake)
INTENT (client → server action request)
ACK (server → client acceptance/rejection of an intent)
EVENT (server → client authoritative event)
SNAPSHOT (server → client full state)
PING / PONG
ERROR
3.2 Sequencing Fields
Client intents must include: client_intent_id (unique per client connection)
Server events include: event_seq (monotonic per room)
4. Sequencing, Idempotency, and Ordering
4.1 event_seq
Every EVENT and SNAPSHOT includes:
event_seq (integer)
Clients must:
apply only events with event_seq == last_event_seq + 1
buffer future events until missing ones are received
request snapshot if a gap persists
4.2 client_intent_id
Every INTENT has a unique client_intent_id.
Server responds exactly once with an ACK:
INTENT_ACCEPTED
INTENT_REJECTED
If the client retries the same client_intent_id, server must return the same ACK (idempotent).
5. Handshake and Connection Lifecycle
5.1 Client → Server: HELLO
{
  "protocol_version": "0.1",
  "op": "HELLO",
  "type": "HELLO",
  "payload": {
    "auth_token": "…",
    "client_build": "web-0.1.7",
    "resume": {
      "room_id": "room_ab12",
      "last_event_seq": 1287
    }
  }
}
5.2 Server → Client: HELLO_OK
{
  "protocol_version": "0.1",
  "op": "EVENT",
  "type": "HELLO_OK",
  "event_seq": 1,
  "payload": {
    "player_id": "p_01",
    "server_time_ms": 1730000000000
  }
}
5.3 Heartbeat
Server sends PING every 10s
Client replies PONG within 5s
If missed for 30s, server marks player disconnected (overlay policy).
6. Privacy Rules (What Each Client Receives)
6.1 Public
All clients receive:
district states (all placed cards are public)
claimed districts / scores
each player’s hand count (not contents)
6.2 Private
Only the owning client receives:
HAND_SNAPSHOT contents
private per-player settings
Crisis declarations become public immediately upon declaration. 
Rules(ENG)
7. Core Intents (Client → Server)
Each intent is wrapped in the envelope (op="INTENT"). payload is listed below.
7.1 Room / Lobby Intents
CREATE_ROOM
{ "max_players": 3 }
JOIN_ROOM
{ "room_id": "room_ab12" }
LEAVE_ROOM
{}
START_READY_CHECK (host only)
{}
CANCEL_READY_CHECK (host only)
{}
SET_READY
{ "ready": true }
CLIENT_LOADED
{ "asset_manifest_version": "am_0.1.0" }
REQUEST_REMATCH (optional feature)
{ "want_rematch": true }
7.2 In-Match Gameplay Intents
PLAY_CARD
{
  "card_instance_id": "r9f12:asset.media.10",
  "district_id": "D4",
  "slot_index": 1
}
PASS
{}
DECLARE_CRISIS
Used only when the server requests a crisis declaration.
{
  "card_instance_id": "r9f12:crisis.2",
  "declared_color": "MEDIA",
  "declared_value": "9"
}
Declared value must be 2–10; not Ace. 
Rules(ENG)
REQUEST_SNAPSHOT
{}
7.3 Optional UX / Social Intents (Non-gameplay)
SET_EMOTE
{ "emote_id": "thumbs_up" }
SET_BROWSING_HAND
Hearthstone-like presence; no gameplay effect.
{ "is_browsing": true }
8. ACK Messages (Server → Client)
All ACKs use op="ACK" and reference the client’s intent.
8.1 INTENT_ACCEPTED
{
  "protocol_version": "0.1",
  "room_id": "room_ab12",
  "op": "ACK",
  "type": "INTENT_ACCEPTED",
  "client_intent_id": "c123-000045",
  "payload": {}
}
8.2 INTENT_REJECTED
{
  "protocol_version": "0.1",
  "room_id": "room_ab12",
  "op": "ACK",
  "type": "INTENT_REJECTED",
  "client_intent_id": "c123-000045",
  "payload": {
    "reason_code": "NOT_YOUR_TURN",
    "details": "Active seat is INDEP"
  }
}
9. Server Events (Server → Clients)
All events use op="EVENT" and include event_seq.
9.1 Room Events
ROOM_STATE
Broadcast whenever lobby state changes.
{
  "op": "EVENT",
  "type": "ROOM_STATE",
  "event_seq": 12,
  "payload": {
    "room_phase": "ROOM_READY_CHECK",
    "players": [
      { "player_id": "p_01", "seat": "LEFT", "ready": true },
      { "player_id": "p_02", "seat": "RIGHT", "ready": false },
      { "player_id": "p_03", "seat": "INDEP", "ready": true }
    ],
    "host_player_id": "p_01"
  }
}
READY_CHECK_STARTED / READY_CHECK_CANCELED
{ "op":"EVENT","type":"READY_CHECK_STARTED","event_seq": 13, "payload": {} }
MATCH_LOADING_BEGIN
{
  "op": "EVENT",
  "type": "MATCH_LOADING_BEGIN",
  "event_seq": 20,
  "payload": { "asset_manifest_version": "am_0.1.0" }
}
9.2 Match / Round Events
MATCH_STARTED
{
  "op": "EVENT",
  "type": "MATCH_STARTED",
  "event_seq": 30,
  "payload": {
    "match_id": "match_71c0",
    "seats": { "LEFT":"p_01", "RIGHT":"p_02", "INDEP":"p_03" }
  }
}
ROUND_STARTED
{
  "op": "EVENT",
  "type": "ROUND_STARTED",
  "event_seq": 40,
  "payload": {
    "round_id": "round_2_r9f12",
    "round_index": 2,
    "starting_seat": "LEFT",
    "active_seat": "LEFT",
    "draw_pile_count": 45,
    "hand_counts": { "LEFT": 6, "RIGHT": 6, "INDEP": 6 }
  }
}
TURN_STARTED
{
  "op": "EVENT",
  "type": "TURN_STARTED",
  "event_seq": 41,
  "payload": {
    "active_seat": "LEFT",
    "turn_deadline_ms": 1730000005000
  }
}
9.3 Crisis Flow Events
CRISIS_DECLARATION_REQUIRED (public)
{
  "op": "EVENT",
  "type": "CRISIS_DECLARATION_REQUIRED",
  "event_seq": 52,
  "payload": {
    "seat": "LEFT",
    "card_instance_id": "r9f12:crisis.2",
    "crisis_deadline_ms": 1730000009000
  }
}
CRISIS_DECLARED (public)
{
  "op": "EVENT",
  "type": "CRISIS_DECLARED",
  "event_seq": 53,
  "payload": {
    "seat": "LEFT",
    "card_instance_id": "r9f12:crisis.2",
    "declared_color": "MEDIA",
    "declared_value": "9"
  }
}
9.4 Core Gameplay Events
CARD_PLAYED (public)
{
  "op": "EVENT",
  "type": "CARD_PLAYED",
  "event_seq": 60,
  "payload": {
    "seat": "LEFT",
    "district_id": "D4",
    "slot_index": 1,
    "card": {
      "card_instance_id": "r9f12:crisis.2",
      "card_def_id": "crisis.2",
      "kind": "CRISIS",
      "crisis_state": { "declared_color": "MEDIA", "declared_value": "9" }
    },
    "hand_counts": { "LEFT": 5, "RIGHT": 6, "INDEP": 6 },
    "draw_pile_count": 45
  }
}
DISTRICT_CLAIMED (public)
District claiming is automatic when conditions are met. 
Rules(ENG)
{
  "op": "EVENT",
  "type": "DISTRICT_CLAIMED",
  "event_seq": 66,
  "payload": {
    "district_id": "D4",
    "winner": "INDEP",
    "winning_config": { "type": "TOTAL_MANDATE", "rank": 1 },
    "claimed_counts": { "LEFT": 1, "RIGHT": 0, "INDEP": 3 }
  }
}
CARD_DRAWN
To the drawing player: server additionally sends private hand update (see HAND_DELTA).
{
  "op": "EVENT",
  "type": "CARD_DRAWN",
  "event_seq": 70,
  "payload": {
    "seat": "LEFT",
    "new_hand_count": 6,
    "draw_pile_count": 44
  }
}
TURN_ENDED
{
  "op": "EVENT",
  "type": "TURN_ENDED",
  "event_seq": 71,
  "payload": {
    "previous_active_seat": "LEFT",
    "next_active_seat": "RIGHT"
  }
}
9.5 Round / Match End Events
ROUND_ENDED
Round ends when a player reaches 3 claimed districts. 
Rules(ENG)
{
  "op": "EVENT",
  "type": "ROUND_ENDED",
  "event_seq": 120,
  "payload": {
    "round_winner": "INDEP",
    "claimed_counts": { "LEFT": 1, "RIGHT": 0, "INDEP": 3 }
  }
}
MATCH_RESULT
{
  "op": "EVENT",
  "type": "MATCH_RESULT",
  "event_seq": 200,
  "payload": {
    "winner": "INDEP",
    "match_score": { "LEFT": 0, "RIGHT": 1, "INDEP": 2 },
    "tiebreak": null
  }
}
10. Snapshots (Server → Client)
Snapshots are sent:
on join
on reconnect/resume
on REQUEST_SNAPSHOT
optionally at phase boundaries (round start)
10.1 FULL_SNAPSHOT
{
  "protocol_version": "0.1",
  "room_id": "room_ab12",
  "op": "SNAPSHOT",
  "type": "FULL_SNAPSHOT",
  "event_seq": 1287,
  "payload": {
    "room_phase": "ROOM_IN_MATCH",
    "match": { "...match state..." },
    "round": { "...round state..." },
    "public": {
      "district_state": { "...all districts..." },
      "hand_counts": { "LEFT": 5, "RIGHT": 6, "INDEP": 4 }
    },
    "private": {
      "your_seat": "LEFT",
      "hand": ["r9f12:asset.media.10", "r9f12:crisis.2", "..."]
    },
    "timers": {
      "turn_deadline_ms": 1730000005000,
      "crisis_deadline_ms": null
    }
  }
}
10.2 HAND_DELTA (private, optional optimization)
Instead of sending the full hand each time:
{
  "op": "EVENT",
  "type": "HAND_DELTA",
  "event_seq": 70,
  "payload": {
    "added": ["r9f12:asset.base.3"],
    "removed": [],
    "hand_count": 6
  }
}
11. Reconnect / Resume
11.1 Resume Attempt
Client includes in HELLO:
resume.room_id
resume.last_event_seq
11.2 Server Behavior
If server still has the room and the player seat:
If it can replay missing events: send the missing EVENTs in order.
Otherwise: send FULL_SNAPSHOT.
If resume is not possible: send ERROR_RESUME_FAILED and force rejoin.
12. Reason Codes (Standardized)
INTENT_REJECTED.reason_code must be one of:
12.1 Lobby
ROOM_FULL
ROOM_NOT_FOUND
NOT_HOST
NOT_IN_READY_CHECK
ALREADY_IN_MATCH
12.2 Phase / Turn
INVALID_PHASE
NOT_YOUR_TURN
TURN_TIMER_EXPIRED
CRISIS_TIMER_EXPIRED
NO_LEGAL_MOVES (if PASS is restricted)
12.3 Card / Placement
CARD_NOT_IN_HAND
DISTRICT_NOT_FOUND
DISTRICT_CLAIMED
SIDE_FULL
INVALID_SLOT_INDEX
12.4 Crisis
CRISIS_NOT_PENDING
CRISIS_DECLARATION_INVALID
CRISIS_VALUE_NOT_ALLOWED (Ace forbidden) 
Rules(ENG)
12.5 General
RATE_LIMITED
INTERNAL_ERROR
13. Rate Limits (Recommended Defaults)
To prevent spam and accidental double-sends:
Max 20 intents / 5 seconds per client
Only 1 gameplay intent processed at a time per active player (server queue)
14. Optional: Client Presence (“Browsing Hand”)
If you want Hearthstone-like awareness:
Client sends SET_BROWSING_HAND(is_browsing)
Server broadcasts:
{
  "op": "EVENT",
  "type": "PLAYER_PRESENCE",
  "event_seq": 300,
  "payload": { "seat": "RIGHT", "is_browsing_hand": true }
}
This must never reveal card identities and must never affect rules.
15. Minimal Happy-Path Flow (Example)
Create/Join room → ROOM_STATE
Ready check → READY_CHECK_STARTED → ROOM_STATE
Loading → MATCH_LOADING_BEGIN
Match start → MATCH_STARTED
Round start → ROUND_STARTED + private HAND_SNAPSHOT
Turn:
active plays → ACK(INTENT_ACCEPTED) then CARD_PLAYED
claim(s) if any → DISTRICT_CLAIMED
draw → CARD_DRAWN (+ private HAND_DELTA)
end → TURN_ENDED then next TURN_STARTED
Round ends → ROUND_ENDED
Match result → MATCH_RESULT
16. Implementation Notes (Recommended)
Keep message payloads small; avoid sending full card catalogs every time.
The static card catalog can be versioned and loaded via asset_manifest_version.
Ensure the server logs:
RNG seed per round
accepted intents
emitted events
so replays and bug reproduction are possible.