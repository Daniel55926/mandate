````md
# 15_telemetry_and_metrics.md
## MANDATE: The District Game — Telemetry, Metrics, and Analytics
Version: v0.1 (implementation-ready draft)  
Depends on:
- `03_game_state_machine.md` (phases + timers)
- `05_networking_protocol.md` (events/intents)
- `12_disconnect_and_reconnect_rules.md` (timeouts/forfeit)
- `11_security_and_fair_play.md` (abuse signals)

This document defines what to measure to:
- improve UX polish (“Zynga poker smoothness”)
- tune timers and pacing
- detect disconnect/AFK issues
- catch exploits or spam
- validate performance (FPS, stutter, asset load)

Telemetry should never expose private hand contents. Aggregate or hash sensitive data.

---

## 1. Principles

1) **Measure what you can act on**
2) **Privacy-first**
   - never log private hand arrays in production
3) **Low overhead**
   - batch events, avoid spam logging
4) **Correlatable**
   - every event includes identifiers so you can trace a match timeline

---

## 2. Identifiers and Common Fields

Every telemetry record should include:

### 2.1 Identifiers
- `timestamp_ms`
- `player_id` (or anonymized hash)
- `session_id`
- `room_id`
- `match_id`
- `round_id`
- `seat` (LEFT/RIGHT/INDEP)
- `client_build` / `server_build`
- `region` (optional)
- `protocol_version`

### 2.2 Session Context
- device type: `desktop | mobile`
- browser: `chrome | safari | firefox | edge`
- viewport: `w,h`
- network estimate: RTT, downlink (if available)

---

## 3. What to Log on the Server

### 3.1 Match Lifecycle Events (Core)
- `room_created`
- `room_joined`
- `ready_check_started`
- `player_ready_toggled`
- `match_started`
- `round_started`
- `turn_started`
- `card_played` (NO private hand dump)
- `crisis_declared`
- `district_claimed`
- `round_ended`
- `match_ended`
- `player_forfeited`

### 3.2 Intent/Reject Monitoring
- `intent_received(type)`
- `intent_rejected(reason_code)`
- `rate_limited`

Use these to detect:
- UX confusion (many invalid plays)
- cheat attempts (many illegal intents)

### 3.3 Disconnect & AFK
- `player_disconnected`
- `player_reconnected`
- `reconnect_grace_expired`
- `turn_timeout`
- `auto_play_performed`
- `auto_pass_performed`
- `crisis_auto_declared`
- `afk_strike_added` (if enabled)

### 3.4 RNG Audit (Restricted)
Store securely (not in general analytics):
- `rng_seed` per round
- optionally deck order hash

This supports dispute investigation.

---

## 4. What to Log on the Client

### 4.1 Performance Metrics
- average FPS in match
- frame-time percentiles (p50/p95/p99)
- stutter events:
  - “frame > 50ms”
- GPU/renderer info if available

### 4.2 Asset Loading
- manifest fetch time
- atlas download time
- decode time
- total “time to playable”
- cache hit/miss

### 4.3 UX Interaction Metrics
- drag start count
- invalid drop count
- intent send latency (time from drop → intent sent)
- time from intent sent → server confirmation (`CARD_PLAYED`) (per action)
- “browsing hand” duration (optional)

### 4.4 Reconnect UX
- reconnect attempts count
- time to reconnect
- snapshot apply time
- resume success vs full snapshot fallback

---

## 5. Key KPIs (What You Track Weekly)

### 5.1 Reliability & Connection
- disconnect rate per match (% matches with ≥1 disconnect)
- average disconnect duration
- forfeit rate due to disconnect
- AFK timeout rate

### 5.2 Match Health
- average match length (minutes)
- average turns per round
- average claim count per round
- distribution of win types (match score patterns: 2-0, 2-1, 1-1-1 tiebreak)

### 5.3 UX Quality
- invalid play attempts per match
- time-to-first-action after turn start
- time-to-play after hover/drag
- “rage quit” proxies:
  - disconnect within 15s of losing a district
  - leave/forfeit right after opponent claim

### 5.4 Performance
- % sessions sustaining ≥55 FPS
- stutter rate per minute
- asset load failures
- memory growth across matches (if measurable)

---

## 6. Event Schema Examples

### 6.1 Server: card_played
```json
{
  "event": "card_played",
  "timestamp_ms": 1730000001234,
  "room_id": "room_ab12",
  "match_id": "match_71c0",
  "round_id": "round_2_r9f12",
  "seat": "LEFT",
  "card_def_id": "asset.media.10",
  "district_id": "D4",
  "slot_index": 1,
  "source": "PLAYER",
  "latency_ms": 38
}
````

### 6.2 Server: intent_rejected

```json
{
  "event": "intent_rejected",
  "timestamp_ms": 1730000002234,
  "player_id": "p_02",
  "room_id": "room_ab12",
  "type": "PLAY_CARD",
  "reason_code": "NOT_YOUR_TURN"
}
```

### 6.3 Client: perf_sample

```json
{
  "event": "perf_sample",
  "timestamp_ms": 1730000003234,
  "session_id": "s_99",
  "client_build": "web-0.1.7",
  "fps_avg_5s": 58.2,
  "frame_p95_ms": 22.1,
  "stutters_5s": 0
}
```

### 6.4 Client: asset_load

```json
{
  "event": "asset_load",
  "timestamp_ms": 1730000004000,
  "asset_manifest_version": "am_0.1.0+sha1:9c2e...",
  "manifest_ms": 48,
  "atlases_ms": 620,
  "decode_ms": 140,
  "time_to_playable_ms": 980,
  "cache_hit": true
}
```

---

## 7. Dashboards (Recommended)

### 7.1 Ops Dashboard

* active rooms
* matches in progress
* disconnect spikes
* server CPU/memory
* intent rejection counts

### 7.2 Product Dashboard

* match length distribution
* win distribution
* forfeit reasons
* invalid play rate
* FPS distribution

### 7.3 QA Dashboard

* crash reports (if integrated)
* asset load failures by browser
* protocol mismatch errors

---

## 8. Privacy and Data Minimization

### 8.1 Never log

* full private hands
* auth tokens
* raw IP addresses (store masked or hashed if needed)

### 8.2 Safe to log

* card_def_id of **played cards** (public by gameplay)
* district outcomes
* aggregated hand counts (not contents)

### 8.3 Retention

* raw logs: 7–14 days
* aggregated metrics: 90+ days

---

## 9. Sampling Strategy

To reduce volume:

* log every match lifecycle event (low volume)
* sample client perf at 1 event / 5 seconds
* sample detailed UI interactions at 10–25% of sessions

---

## 10. Alerts (Practical)

Set alerts for:

* sudden spike in disconnect forfeits
* high invalid play rejection rate after a deployment
* asset load failure rate > 1%
* FPS p95 frame time > 40ms for a large segment

---

## 11. Implementation Checklist

* [ ] Define telemetry client with batching and retries
* [ ] Add server event hooks for lifecycle, disconnect, rejections
* [ ] Add client perf sampling + asset load timings
* [ ] Ensure privacy filters (no hands/tokens)
* [ ] Build dashboards for KPIs
* [ ] Add alerts for reliability + performance regressions

---

```
```
