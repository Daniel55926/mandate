# 11_security_and_fair_play.md
## MANDATE: The District Game — Security & Fair Play (Online)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `02_digital_ruleset.md` (what is allowed)
- `03_game_state_machine.md` (authoritative flow)
- `05_networking_protocol.md` (intents/events, sequencing)
- `04_data_model_cards_and_districts.md` (public/private state boundaries)

This document defines the security model and anti-cheat measures for a 3-player online card game with:
- browser client
- WebSocket realtime protocol
- server-authoritative gameplay

Goal: keep gameplay fair without over-engineering v0.1.

---

## 1. Threat Model (What We Protect Against)

### 1.1 Common threats in browser card games
1) **Client tampering**
   - modified JS to send illegal intents
2) **Information leaks**
   - attempts to access other players’ hands
3) **Replay / duplicate intents**
   - resending the same action to gain advantage
4) **Timing abuse**
   - stalling by disconnecting or refusing to act
5) **Room griefing**
   - ready toggling, join/leave spam, kick abuse
6) **Man-in-the-middle / packet capture**
   - reading WebSocket traffic (should be encrypted)

### 1.2 What we do NOT try to stop in v0.1
- sophisticated bot detection
- device fingerprinting
- kernel-level anti-cheat
- screen capture “cheating” (e.g., another person watching)

---

## 2. Security Principles

### 2.1 Server is the source of truth
- clients submit **intents**
- server validates and applies
- server emits **events** that define reality

Clients never:
- decide legality
- decide claim winners
- decide deck order

### 2.2 Least Information
A client receives only what it needs:
- public board state
- other players’ hand counts (not contents)
- only its own private hand list

Crisis declarations become public once declared.

### 2.3 Determinism + Auditability
Every match should be reproducible from logs:
- RNG seed per round
- accepted intents (with timestamps)
- emitted events (event_seq)

This helps detect anomalies and debug disputes.

---

## 3. Transport Security

### 3.1 TLS Only
- WebSocket must be `wss://` (TLS).
- HSTS recommended on hosting domain.

### 3.2 Origin & CSRF-like protections
For browser clients:
- server validates `Origin` header
- reject cross-origin WebSocket attempts from unknown origins

---

## 4. Authentication & Session Binding

### 4.1 Auth token (minimum)
- Client obtains a short-lived `auth_token` (JWT or opaque token).
- Token includes:
  - `player_id`
  - expiration
  - optional: `session_id`

### 4.2 Connection binding
On WebSocket connect + `HELLO`:
- server binds socket ↔ `player_id`
- rejects if token invalid/expired
- each `player_id` may have at most:
  - 1 active socket per room (recommended)
  - reconnect replaces previous socket

### 4.3 Seat binding (critical)
Once a player is seated in a room:
- server binds `player_id` ↔ `seat`
- every gameplay intent must match the bound seat

Any mismatch → reject with `SEAT_MISMATCH` and flag.

---

## 5. Authorization Rules (Who Can Do What)

### 5.1 Lobby permissions
- Only host can:
  - `START_READY_CHECK`
  - `CANCEL_READY_CHECK`
  - `KICK_PLAYER` (if implemented)
- Any player can:
  - `SET_READY`
  - `LEAVE_ROOM`

### 5.2 Gameplay permissions
- Only active seat can:
  - `PLAY_CARD`
  - `PASS`
  - `DECLARE_CRISIS` (when pending)

Any out-of-turn attempt → `NOT_YOUR_TURN`.

---

## 6. Input Validation (Must-Have)

### 6.1 Schema validation
Server validates JSON schema for every intent:
- required fields exist
- types are correct
- enums are known
Reject malformed payloads with `BAD_REQUEST`.

### 6.2 Phase validation
Server checks `RoomPhase/MatchPhase/RoundPhase`:
- intent must be valid in current state
Reject with `INVALID_PHASE`.

### 6.3 Gameplay legality validation
On `PLAY_CARD`:
- card in player hand
- district exists
- district open (not claimed)
- slot belongs to seat
- slot not full (<3)
Reject with reason codes defined in protocol.

On `DECLARE_CRISIS`:
- crisis is pending
- declared value in 2–10 (Ace forbidden)
- declaration not already set

### 6.4 Rate limiting
- max intents per client per time window (e.g., 20/5s)
- if exceeded: `RATE_LIMITED`
- persistent abuse → temporary ban (optional)

---

## 7. Anti-Replay & Idempotency

### 7.1 client_intent_id idempotency
Server maintains a rolling cache per connection:
- if `client_intent_id` already processed:
  - re-send the same ACK
  - do not re-apply effects

### 7.2 event_seq enforcement
Clients must apply events strictly in order.
Server can resend missing events on request or send snapshot.

---

## 8. Fair Randomness

### 8.1 RNG ownership
- Server controls all randomness:
  - shuffle order
  - any random auto-play selections on timeout

### 8.2 RNG logging
Log per round:
- `rng_seed`
- deck order (or a hash of deck order)
- any random choices

This enables audit and replay.

### 8.3 Client visibility
Do not send:
- deck order
- rng_seed
until after the round/match ends (optional).
(You can reveal seeds post-game for transparency later.)

---

## 9. Information Leak Prevention

### 9.1 Private hand isolation
Server must never broadcast:
- other players’ hand arrays
Only broadcast hand counts.

### 9.2 Crash-safe logging
Be careful in logs:
- do not print full private hands to shared logs in production
- keep private hand logs restricted or hashed

### 9.3 Client storage
Client must not persist private hand contents beyond session:
- no localStorage hand caching
- clear memory on tab close/reload

(You can still resume via server snapshot after reconnect.)

---

## 10. Disconnect Abuse & Stalling Prevention (Baseline)

Detailed rules live in `12_disconnect_and_reconnect_rules.md`, but security implications are:

- If active player disconnects, the turn still progresses via timers.
- On timeout/disconnect, server performs:
  - auto-play if legal moves exist
  - otherwise auto-pass

This prevents “rage-disconnect to freeze the game.”

---

## 11. Room Griefing Mitigations

### 11.1 Ready toggle spam
- apply cooldown (e.g., 500ms)
- if spam continues:
  - throttle to 1 toggle per 2s

### 11.2 Join/leave spam
- apply join attempt rate limits per IP/player_id (e.g., 10/min)
- optional: temporary lockout for repeated abuse

### 11.3 Host abuse (kicking)
If kick is implemented:
- host kick only during lobby phases
- kicked player cannot rejoin for 5 minutes
- log kick reasons

---

## 12. Client Integrity (Realistic Expectations)

You cannot trust browser clients.
Still, you can:
- use build hashing to detect outdated clients
- require protocol version match
- optionally add lightweight obfuscation (not security, just friction)

True security comes from server authority, not obfuscation.

---

## 13. Abuse Reporting & Moderation (Optional v0.2)

Add later:
- report player flow
- chat moderation (if chat exists)
- ban lists (player_id / IP / device)

---

## 14. Telemetry for Fairness

Track:
- disconnect frequency
- average turn time
- rejected intent counts by reason code
- suspicious patterns:
  - repeated illegal play attempts
  - high-frequency spamming

Use telemetry to tune limits and detect cheating attempts.

---

## 15. Incident Response Playbook (Practical)

If cheating suspected:
1) retrieve match logs (rng seed + intent/event log)
2) replay deterministically
3) confirm whether illegal actions were accepted (should never happen)
4) if issue found:
   - patch rules/validation
   - invalidate affected matches if necessary (optional)

---

## 16. Implementation Checklist

- [ ] WSS only + origin validation
- [ ] Auth token validation + session binding
- [ ] Seat binding enforcement
- [ ] Strict schema validation for all intents
- [ ] Phase + legality validation for gameplay
- [ ] Idempotent intent handling (client_intent_id)
- [ ] Rate limiting (intents + join attempts)
- [ ] RNG server-owned + logged
- [ ] Private hand never broadcast, only counts
- [ ] Disconnect/timeouts cannot stall match
- [ ] Audit log capture per match

---
