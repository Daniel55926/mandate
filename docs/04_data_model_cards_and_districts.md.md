# 04_data_model_cards_and_districts.md
## MANDATE: The District Game — Data Model (Cards, Districts, State)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `02_digital_ruleset.md`
- `03_game_state_machine.md`

This document defines the **canonical IDs, schemas, and example payloads** for:
- card definitions + card instances (including Crisis declarations)
- district layout + placement slots
- round/match state required by the authoritative server
- derived configuration objects used for claim resolution

> Design note: the game has **63 cards total** (60 Assets + 3 Crisis) and **7 Districts**, and each player can place **up to 3 cards per District side**. :contentReference[oaicite:0]{index=0}

---

## 1. Goals

1) Provide deterministic, server-authoritative data structures.  
2) Keep IDs stable forever (assets, replays, analytics, localization).  
3) Separate **card definition** (what a card is) from **card instance** (a particular copy in a shuffled deck).  
4) Support your existing **Canva-exported card fronts** as image assets via stable file naming.

---

## 2. Canonical Enums

### 2.1 PlayerSeat
Three fixed seats per match:
- `LEFT`
- `RIGHT`
- `INDEP`

(These map to “Left / Right / Independents” in rules.) :contentReference[oaicite:1]{index=1}

### 2.2 CardKind
- `ASSET`
- `CRISIS`

Assets: 60 unique; Crisis: 3 wildcards. :contentReference[oaicite:2]{index=2}

### 2.3 AssetColor
The 6 asset colors and their meanings: :contentReference[oaicite:3]{index=3}
- `INSTITUTION` (Blue)
- `BASE` (Green)
- `MEDIA` (Yellow)
- `CAPITAL` (Red)
- `IDEOLOGY` (Purple)
- `LOGISTICS` (Grey)

### 2.4 AssetValue
- `A`
- `2`…`10`

Each color contains A + 2–10. :contentReference[oaicite:4]{index=4}

### 2.5 DistrictStatus
- `OPEN`
- `CLAIMED`

Claimed districts are closed to further placement. :contentReference[oaicite:5]{index=5}

---

## 3. ID Conventions (Stable Naming)

### 3.1 Card Definition IDs (`card_def_id`)
**Assets**
- Format: `asset.<color>.<value>`
- Examples:
  - `asset.institution.A`
  - `asset.media.10`
  - `asset.logistics.2`

**Crisis**
- Format: `crisis.<index>`
- Examples:
  - `crisis.1`
  - `crisis.2`
  - `crisis.3`

This matches the rulebook concept (3 Crisis cards total). :contentReference[oaicite:6]{index=6}

### 3.2 Card Instance IDs (`card_instance_id`)
A shuffled deck contains instances. Since every card definition is unique in this game, an instance can still be unique per round:
- Format: `r<round_uid>:<card_def_id>`
- Example:
  - `r9f12:asset.capital.7`
  - `r9f12:crisis.2`

### 3.3 District IDs (`district_id`)
- Format: `D<index>` where index is 0..6
- Example: `D0`, `D1`, …, `D6`

There are 7 Districts. :contentReference[oaicite:7]{index=7}

### 3.4 Placement Slot IDs
Each player side has 3 slots per District (max 3 cards). :contentReference[oaicite:8]{index=8}  
Represented as:
- `slot_index`: 0, 1, 2

---

## 4. Card Definition Schema

A **CardDefinition** is static metadata: what the card represents and how to render it.

```json
{
  "card_def_id": "asset.institution.7",
  "kind": "ASSET",
  "asset_color": "INSTITUTION",
  "asset_value": "7",
  "display": {
    "front_image_key": "cards/asset_institution_07.png",
    "back_image_key": "cards/card_back.png",
    "icon_key": "icons/institution_07.svg"
  },
  "vfx_profile": "institution_07",
  "tags": ["asset"]
}
Notes
Card fronts have no text in the print design system; digital can still use the exported front as-is. 
desingsystem
vfx_profile is a stable hook for your Hearthstone-like effects (defined later in 08_animation_and_vfx_styleguide.md).
front_image_key should map to your Canva export naming convention (see 09_asset_pipeline.md).
4.1 Crisis CardDefinition
Crisis is visually distinct (off-white background, fractured geometry). 
desingsystem
{
  "card_def_id": "crisis.2",
  "kind": "CRISIS",
  "display": {
    "front_image_key": "cards/crisis_02.png",
    "back_image_key": "cards/card_back.png",
    "icon_key": "icons/crisis.svg"
  },
  "vfx_profile": "crisis_default",
  "tags": ["crisis", "wildcard"]
}
5. Card Instance Schema (Round Runtime)
A CardInstance is what actually moves between: deck → hand → board → discard.
{
  "card_instance_id": "r9f12:crisis.2",
  "card_def_id": "crisis.2",
  "owner_seat": "LEFT",
  "zone": "HAND",
  "public_state": {
    "revealed": false
  },
  "crisis_state": null
}
5.1 Zones (Recommended)
DECK
HAND
BOARD
DISCARD (optional; can be implied by “removed from play”)
VOID (removed / cleaned up)
5.2 Crisis Instance State
When a Crisis card is played, the player must declare a color and value 2–10 (not Ace). 
Rules(ENG)
{
  "card_instance_id": "r9f12:crisis.2",
  "card_def_id": "crisis.2",
  "owner_seat": "LEFT",
  "zone": "BOARD",
  "public_state": { "revealed": true },
  "crisis_state": {
    "declared_color": "MEDIA",
    "declared_value": "9",
    "declared_at_ms": 1730000000000
  }
}
Constraint: a configuration may include at most one Crisis card. 
Rules(ENG)
6. District Schema
A District contains 3 player sides, each with up to 3 slots.
{
  "district_id": "D3",
  "district_index": 3,
  "status": "OPEN",
  "claimed_by": null,
  "sides": {
    "LEFT":   { "slots": [null, null, null] },
    "RIGHT":  { "slots": [null, null, null] },
    "INDEP":  { "slots": [null, null, null] }
  }
}
When claimed:
{
  "district_id": "D3",
  "district_index": 3,
  "status": "CLAIMED",
  "claimed_by": "INDEP",
  "sides": {
    "LEFT":  { "slots": ["r9f12:asset.media.7", "r9f12:asset.capital.7", "r9f12:asset.base.7"] },
    "RIGHT": { "slots": [null, null, null] },
    "INDEP": { "slots": ["r9f12:asset.institution.A", "r9f12:asset.media.A", "r9f12:asset.base.A"] }
  }
}
Claimed/closed districts cannot accept further cards. 
Rules(ENG)
7. Round State Schema (Authoritative)
This is the minimum required round snapshot to support:
turn loop
claims
reconnect snapshot
deterministic replays
{
  "round_id": "round_2_r9f12",
  "round_index": 2,
  "starting_seat": "LEFT",
  "active_seat": "RIGHT",
  "phase": "TURN_AWAIT_ACTION",
  "turn_number": 17,

  "rng_seed": "b64:3N3m....", 
  "draw_pile_count": 39,

  "hands": {
    "LEFT":  ["r9f12:asset.media.10", "r9f12:crisis.2", "..."],
    "RIGHT": ["r9f12:asset.base.6", "..."],
    "INDEP": ["r9f12:asset.ideology.A", "..."]
  },

  "districts": ["D0","D1","D2","D3","D4","D5","D6"],

  "district_state": {
    "D0": { "...district object..." },
    "D1": { "...district object..." }
  },

  "claimed_counts": {
    "LEFT": 1,
    "RIGHT": 0,
    "INDEP": 2
  },

  "pending": {
    "pending_play": null,
    "pending_crisis": null
  },

  "timers": {
    "turn_deadline_ms": 1730000005000,
    "crisis_deadline_ms": null
  },

  "event_seq": 1287
}
7.1 pending.pending_play
When the server transitions through play resolution states, it can store the last accepted intent here for auditing/replay.
{
  "pending_play": {
    "seat": "RIGHT",
    "card_instance_id": "r9f12:asset.base.6",
    "district_id": "D4",
    "slot_index": 1,
    "accepted_at_ms": 1730000001000
  }
}
7.2 pending.pending_crisis
Only used in TURN_AWAIT_CRISIS_DECLARATION.
{
  "pending_crisis": {
    "seat": "LEFT",
    "card_instance_id": "r9f12:crisis.2",
    "district_id": "D2",
    "slot_index": 0
  }
}
8. Match State Schema (Authoritative)
{
  "match_id": "match_71c0",
  "phase": "MATCH_ROUND_ACTIVE",
  "match_score": { "LEFT": 0, "RIGHT": 1, "INDEP": 0 },
  "round_index": 2,
  "round_ids": ["round_1_a1b2", "round_2_r9f12"],
  "districts_won_total": { "LEFT": 2, "RIGHT": 4, "INDEP": 3 },
  "best_config_achieved": {
    "LEFT": "MOMENTUM",
    "RIGHT": "COLOR_RUN",
    "INDEP": "TOTAL_MANDATE"
  }
}
BO3 structure + tiebreak are defined in the rulebook. 
Rules(ENG)
9. Configuration Evaluation Model (Derived Data)
Configurations are derived from a player’s 3 cards at a District. 
Rules(ENG)

Evaluation must be pure and deterministic: given the same 3 cards (+ crisis declaration), it always yields the same result.
9.1 ConfigType (ordered strongest → weakest)
From the rules: 
Rules(ENG)
TOTAL_MANDATE (AAA)
COLOR_RUN (same color + consecutive)
UNIFIED_MESSAGE (three of a kind, non-ace)
SAME_COLOR (same color, not consecutive)
RUN (consecutive, mixed colors)
PARTY (pair or double ace; kicker tiebreak)
RAW_PRESSURE (sum)
9.2 Configuration Object
{
  "seat": "LEFT",
  "district_id": "D4",
  "cards": [
    { "color": "MEDIA", "value": "7", "is_crisis": false },
    { "color": "MEDIA", "value": "8", "is_crisis": false },
    { "color": "MEDIA", "value": "9", "is_crisis": true }
  ],
  "type": "COLOR_RUN",
  "rank": 2,
  "total_value": 24,
  "tiebreak": {
    "primary": 24,
    "secondary": 0,
    "kicker": 0
  }
}
9.3 Ace Handling (Rules → Data)
Ace is not a normal number, but can participate in runs:
A–2–3
9–10–A
Ace cannot be in the middle of a run.
For “raw pressure” (and any total-based comparison), Ace counts as 11. 
Rules(ENG)
Recommended normalized numeric mapping for evaluation:
2..10 map to 2..10
A maps to:
1 when checking A–2–3 run pattern
11 when checking 9–10–A run pattern and for totals
9.4 Party Tiebreak Data
Party is special:
compare pair value first
if same pair, compare kicker 
Rules(ENG)
{
  "type": "PARTY",
  "rank": 6,
  "total_value": 18,
  "tiebreak": {
    "pair_value": 8,
    "kicker_value": 2
  }
}
9.5 Claim Resolution Input
A District claim compares only players who completed (have 3 cards there). 
Rules(ENG)
The claim resolver should compute:

{
  "district_id": "D4",
  "candidates": ["LEFT", "RIGHT"],
  "evaluations": {
    "LEFT":  { "...Configuration..." },
    "RIGHT": { "...Configuration..." }
  },
  "winner": "LEFT"
}
10. Public vs Private Views (Snapshots)
10.1 Public District Snapshot (for all players)
District placements are public once on board (including Crisis declared identity). 
Rules(ENG)
10.2 Private Hand Snapshot (per player)
A hand snapshot is sent only to its owner.
Recommended approach:

server stores full hands[seat]
public payload includes only hand_counts[seat]
{
  "hand_counts": { "LEFT": 5, "RIGHT": 6, "INDEP": 4 }
}
11. Asset Catalog Generation (Deterministic)
Given the rulebook definition: 6 colors × (A + 2..10) = 60 asset cards. 
Rules(ENG)

You should generate the asset catalog mechanically:
For each AssetColor in this fixed order:

INSTITUTION
BASE
MEDIA
CAPITAL
IDEOLOGY
LOGISTICS 
Rules(ENG)
For each value in fixed order:
A, 2, 3, 4, 5, 6, 7, 8, 9, 10
This ensures:
stable sorting in UI collections
stable analytics grouping
predictable asset packaging
12. File Naming Recommendations (Canva Exports)
Because your card fronts are already created externally, keep file naming aligned with card_def_id.
Recommended:

cards/asset_<color>_<value>.png
asset_institution_A.png
asset_institution_02.png
…
asset_media_10.png
cards/crisis_01.png, cards/crisis_02.png, cards/crisis_03.png
Color naming should match the six asset types defined in the rules/design system.
13. Validation Rules (Must Enforce)
13.1 Placement Validation (District)
must be on own side
must be in an open district
must have empty slot (<3 placed) 
Rules(ENG)
13.2 Crisis Validation
declaration required on play
declared value must be 2–10
may not represent Ace
max one Crisis per configuration 
Rules(ENG)
13.3 Claim Validation
only seats with 3 cards at district are compared (unless Total Mandate AAA triggers immediate claim) 
Rules(ENG)
14. Appendix: Minimal Event Payload Shapes (Optional but Practical)
These are not networking protocol specs; they are “shape hints” for consistency.
14.1 CARD_PLAYED
{
  "type": "CARD_PLAYED",
  "event_seq": 1290,
  "seat": "LEFT",
  "district_id": "D2",
  "slot_index": 0,
  "card": {
    "card_instance_id": "r9f12:crisis.2",
    "card_def_id": "crisis.2",
    "kind": "CRISIS",
    "crisis_state": { "declared_color": "MEDIA", "declared_value": "9" }
  },
  "hand_counts": { "LEFT": 5, "RIGHT": 6, "INDEP": 4 }
}
14.2 DISTRICT_CLAIMED
{
  "type": "DISTRICT_CLAIMED",
  "event_seq": 1293,
  "district_id": "D2",
  "winner": "INDEP",
  "winning_config": {
    "type": "TOTAL_MANDATE",
    "rank": 1
  },
  "claimed_counts": { "LEFT": 1, "RIGHT": 0, "INDEP": 3 }
}