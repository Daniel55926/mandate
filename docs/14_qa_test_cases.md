
# 14_qa_test_cases.md
## MANDATE: The District Game — QA Test Cases (Rules, Multiplayer, UX, Performance)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `02_digital_ruleset.md` (rules + edge cases)
- `03_game_state_machine.md` (phases, timers)
- `05_networking_protocol.md` (intents/events, sequencing)
- `12_disconnect_and_reconnect_rules.md` (timeouts, forfeit)
- `07_ui_layout_spec.md` + `08_animation_and_vfx_styleguide.md` (interaction polish)

This document defines a practical QA suite you can run as:
- manual test scripts (MVP)
- automated server simulations (recommended)
- client integration tests (minimal)

---

## 1. Test Environment Requirements

### 1.1 Builds
- `client_build`: web latest
- `server_build`: latest with logging enabled

### 1.2 Tools
- Browser devtools (network throttling)
- Ability to simulate disconnect:
  - turn off Wi-Fi / airplane mode
  - kill tab
  - server-side “drop connection” debug command (recommended)

### 1.3 Determinism Support (Recommended)
Server supports:
- fixed `rng_seed` injection for a test match
- scripted intent playback
- event log export

---

## 2. Test Case Format

Each test case includes:
- ID
- Category
- Preconditions
- Steps
- Expected result

---

## 3. Rules Engine Test Cases (Core Gameplay)

### 3.1 Configuration Identification

#### QA-RULES-001 — TOTAL_MANDATE (AAA)
**Pre:** district has 3 cards for a player  
**Steps:** place A + A + A (any colors)  
**Expected:** configuration type = `TOTAL_MANDATE`, strongest rank.

#### QA-RULES-002 — COLOR_RUN (same color + consecutive)
**Steps:** same color 4,5,6  
**Expected:** type = `COLOR_RUN`.

#### QA-RULES-003 — UNIFIED_MESSAGE (three of a kind, non-ace)
**Steps:** values 7,7,7 with mixed colors  
**Expected:** type = `UNIFIED_MESSAGE`.

#### QA-RULES-004 — SAME_COLOR (same color, not consecutive)
**Steps:** same color 2,6,10  
**Expected:** type = `SAME_COLOR`.

#### QA-RULES-005 — RUN (consecutive, mixed colors)
**Steps:** values 3,4,5 mixed colors  
**Expected:** type = `RUN`.

#### QA-RULES-006 — PARTY (pair + kicker)
**Steps:** values 8,8,2  
**Expected:** type = `PARTY`, pair=8 kicker=2.

#### QA-RULES-007 — RAW_PRESSURE
**Steps:** values 2,6,9 mixed colors, not run/pair/three-kind  
**Expected:** type = `RAW_PRESSURE`, sum=17.

---

### 3.2 Ace Rules

#### QA-RULES-010 — Ace run A–2–3 is valid
**Steps:** A,2,3 (any colors)  
**Expected:** treated as run (or color_run if same color).

#### QA-RULES-011 — Ace run 9–10–A is valid
**Steps:** 9,10,A  
**Expected:** valid run.

#### QA-RULES-012 — Ace cannot be middle of run
**Steps:** 9,A,10  
**Expected:** NOT a run.

#### QA-RULES-013 — Ace numeric value for totals is 11
**Steps:** RAW_PRESSURE with A,2,8  
**Expected:** sum = 21.

---

### 3.3 Crisis Rules

#### QA-RULES-020 — Crisis cannot declare Ace
**Steps:** play Crisis, attempt declare value=A  
**Expected:** rejected with `CRISIS_VALUE_NOT_ALLOWED`.

#### QA-RULES-021 — Only one Crisis per configuration
**Steps:** attempt to build a 3-card config with 2 Crisis (if possible via bugs)  
**Expected:** server prevents / illegal state never occurs.

#### QA-RULES-022 — Crisis affects evaluation as declared card
**Steps:** play Crisis declared as MEDIA 9, combine with MEDIA 7 and MEDIA 8  
**Expected:** `COLOR_RUN` (7-8-9, same color).

#### QA-RULES-023 — Crisis declaration becomes public
**Expected:** all clients see declared color/value immediately.

---

### 3.4 District Claiming

#### QA-RULES-030 — Claim triggers when ≥2 players complete
**Steps:** Two players complete 3 cards on same district  
**Expected:** automatic claim resolves immediately.

#### QA-RULES-031 — Claim compares only completed players
**Steps:** 2 players complete, third has 1–2 cards  
**Expected:** third ignored in claim resolution.

#### QA-RULES-032 — Claimed district becomes closed
**Steps:** claim a district, then attempt to play into it  
**Expected:** rejected with `DISTRICT_CLAIMED`.

#### QA-RULES-033 — Multiple districts claimable in one turn resolve in order
**Steps:** engineer one move that makes D1 and D3 claimable  
**Expected:** server resolves D1 then D3 (ascending index), consistent across runs.

---

### 3.5 Round / Match Win

#### QA-RULES-040 — Round ends at 3 claimed districts
**Steps:** player claims third district  
**Expected:** `ROUND_ENDED` event emitted, no further turns.

#### QA-RULES-041 — BO3 start order by round index
**Expected:** Round 1 starts INDEP, Round 2 LEFT, Round 3 RIGHT.

#### QA-RULES-042 — Match ends when someone reaches 2 round wins
**Expected:** `MATCH_RESULT` emitted.

#### QA-RULES-043 — 1–1–1 tiebreak by total districts
**Steps:** force each player to win one round; compare total districts  
**Expected:** highest total wins.

---

## 4. Server State Machine & Protocol Tests

### 4.1 Intent Gating

#### QA-PROTO-001 — Not your turn is rejected
**Steps:** non-active player sends `PLAY_CARD`  
**Expected:** `INTENT_REJECTED` with `NOT_YOUR_TURN`.

#### QA-PROTO-002 — Invalid phase intent rejected
**Steps:** send `PLAY_CARD` during lobby  
**Expected:** `INVALID_PHASE`.

#### QA-PROTO-003 — Idempotent intent behavior
**Steps:** send same `client_intent_id` twice  
**Expected:** second returns same ACK; only one play occurs.

### 4.2 event_seq Ordering

#### QA-PROTO-010 — Client receives ordered events
**Steps:** simulate delayed packets (devtools)  
**Expected:** client buffers and applies in order; no desync.

#### QA-PROTO-011 — Snapshot on missing events
**Steps:** drop event packets intentionally  
**Expected:** client requests snapshot; server sends `FULL_SNAPSHOT`; client recovers.

---

## 5. Lobby / Matchmaking Tests

#### QA-LOBBY-001 — Create room → invite code visible
**Expected:** code shown + copy works.

#### QA-LOBBY-002 — Room full at 3 players
**Expected:** 4th join attempt rejected with `ROOM_FULL`.

#### QA-LOBBY-003 — Ready check requires all 3 ready
**Expected:** match does not start until 3/3 ready.

#### QA-LOBBY-004 — Host leaves → host reassign
**Expected:** remaining player becomes host.

#### QA-LOBBY-005 — Loading timeout continues into match
**Expected:** after loading timer, match begins anyway (if that policy chosen).

---

## 6. Disconnect / Reconnect / AFK Tests

#### QA-DC-001 — Disconnect while not active
**Steps:** disconnect non-active player for 20s  
**Expected:** match continues; reconnect restores state.

#### QA-DC-002 — Disconnect while active → auto-play on timeout
**Steps:** active player disconnects; wait for turn timer  
**Expected:** server auto-plays or auto-passes; emits `source="AUTO"`.

#### QA-DC-003 — Crisis pending then disconnect → auto-declare
**Expected:** declaration auto-selected after crisis timer expiry.

#### QA-DC-004 — Reconnect within grace restores private hand
**Expected:** reconnect snapshot includes correct hand.

#### QA-DC-005 — Grace expires → forfeit match
**Steps:** disconnect > grace  
**Expected:** `PLAYER_FORFEITED` then `MATCH_RESULT(reason="FORFEIT")`.

#### QA-DC-006 — AFK strike escalation (if enabled)
**Steps:** time out 3 turns in one match  
**Expected:** forfeit.

---

## 7. UI/UX Interaction Tests (Hearthstone Feel)

#### QA-UI-001 — Local hand hover elevates card smoothly
**Expected:** no jitter, no overlap bugs.

#### QA-UI-002 — Drag highlights legal districts/slots
**Expected:** only legal targets highlight.

#### QA-UI-003 — Invalid drop snaps back with feedback
**Expected:** snap-back animation + toast.

#### QA-UI-004 — Input gating while awaiting server
**Steps:** play a card; immediately try play another  
**Expected:** second action blocked until server confirms/rejects first.

#### QA-UI-005 — Opponent browsing indicator shows but reveals nothing
**Expected:** presence indicator only, no card identity leak.

#### QA-UI-006 — Claimed district visually locks
**Expected:** locked overlay, slots disabled.

#### QA-UI-007 — Crisis modal blocks only required actions
**Expected:** cannot play other cards until declared; can still see board.

---

## 8. VFX & Animation Tests

#### QA-VFX-001 — Idle energy exists on all hand cards
**Expected:** each card has type signature and stable FPS.

#### QA-VFX-002 — Intensity scales with value
**Steps:** compare 2 vs 10 vs Ace of same color  
**Expected:** visible intensity differences.

#### QA-VFX-003 — Play burst triggers on landing
**Expected:** burst corresponds to card type.

#### QA-VFX-004 — District claim animation triggers once per claim
**Expected:** no double-trigger, no missing trigger.

#### QA-VFX-005 — Total Mandate claim special animation
**Expected:** stronger burst, short zoom (if implemented).

#### QA-VFX-006 — Quality scaling on low FPS
**Steps:** throttle CPU/GPU (or debug flag)  
**Expected:** particle reduction + stable gameplay.

---

## 9. Localization Tests (EN/HU)

#### QA-L10N-001 — Hungarian accents render correctly
**Expected:** áéíóöőúüű display correctly in all screens.

#### QA-L10N-002 — No clipped text in HU
**Expected:** buttons/labels fit in layouts.

#### QA-L10N-003 — Error reason codes map to localized messages
**Expected:** not raw codes.

---

## 10. Performance & Stability Tests

#### QA-PERF-001 — 60 FPS target on desktop baseline
**Expected:** average 55–60 FPS in match.

#### QA-PERF-002 — No hitches on draw/play/claim
**Expected:** asset already loaded; no stutter.

#### QA-PERF-003 — Memory leak check (10 matches)
**Expected:** memory stabilizes; does not grow unbounded.

#### QA-PERF-004 — Network jitter tolerance
**Steps:** simulate 150ms latency, 2% packet loss  
**Expected:** still playable; events apply correctly.

---

## 11. Automated Test Suite Suggestions (Server)

### 11.1 Rules engine unit tests
- pure evaluation tests for every configuration type
- tie-break tests
- ace run edge cases
- crisis constraints

### 11.2 State machine integration tests
- scripted match playback
- reconnect mid-turn
- timeout auto-play
- multi-claim ordering

---

## 12. QA Sign-Off Criteria (v0.1)

To ship MVP:
- All tests in sections 3, 4, 5, 6 must pass.
- UI tests 7.2–7.4 must pass (drag legality + input gating).
- No critical performance hitches on baseline desktop.

---
```
