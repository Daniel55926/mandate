# 02_digital_ruleset.md
## MANDATE: The District Game — Digital Ruleset (Online Play)
Version: v0.1 (draft)  
Scope: **Rules + online-only clarifications**. (Art, UI layout, VFX, networking live in separate docs.)

---

## 1. Purpose

This document defines the **authoritative, deterministic** rules for running MANDATE as a **3-player online multiplayer** game.

It is based on the tabletop rules (v1.1), with additional clarifications required for:
- timers and pacing
- information visibility
- edge-case resolution
- disconnect handling boundaries (detailed rules live elsewhere)

Core win conditions and gameplay structure remain unchanged. :contentReference[oaicite:0]{index=0}

---

## 2. Game Format

### 2.1 Players and Roles
A match is always **3 players**:
- **Left**
- **Right**
- **Independents** :contentReference[oaicite:1]{index=1}

These roles are assigned at match start and remain fixed for the whole match (all rounds).

### 2.2 Match = Best of 3 (BO3)
- The match is played as **Best of 3**: first player to win **2 rounds** wins the match. :contentReference[oaicite:2]{index=2}
- **Round starting player**:
  - Round 1: **Independents**
  - Round 2: **Left**
  - Round 3: **Right** :contentReference[oaicite:3]{index=3}

### 2.3 Tiebreaker (1–1–1)
If each player wins one round (1–1–1), resolve the match winner in this order: :contentReference[oaicite:4]{index=4}
1. **Total Districts won** across all 3 rounds (highest wins)
2. **Best Configuration achieved** across all 3 rounds (Total Mandate > Color Run > …)

---

## 3. Components and Canonical Deck

### 3.1 Cards (63 total)
- **Asset Cards (60)**:
  - **6 colors**
  - Each color contains **A + 2–10**
  - All cards are **unique** (no duplicates). :contentReference[oaicite:5]{index=5}
- **Crisis Cards (3)**:
  - Wildcards with special rules. :contentReference[oaicite:6]{index=6}

### 3.2 Districts (7)
- The match uses **7 Districts** placed in a row in the play area. :contentReference[oaicite:7]{index=7}
- Each District has **three player sides** (one per player). :contentReference[oaicite:8]{index=8}

---

## 4. Round Setup (Server-Authoritative)

At the start of each round: :contentReference[oaicite:9]{index=9}
1. Create 7 District objects (open).
2. Shuffle the full deck (63 cards).
3. Deal **6 cards** to each player.
4. Remaining cards form the **draw pile** (face down).
5. Set the **starting player** for the round (per BO3 rules).

---

## 5. District Rules (Placement Constraints)

- You may only place cards on **your own side** of a District. :contentReference[oaicite:10]{index=10}
- Each player may place **up to 3 cards** at a District. :contentReference[oaicite:11]{index=11}
- A District may therefore contain **up to 9 cards** total. :contentReference[oaicite:12]{index=12}
- A District that is **claimed** becomes **closed** and cannot accept more cards. :contentReference[oaicite:13]{index=13}

---

## 6. Turn Loop (Online)

Players take turns clockwise. :contentReference[oaicite:14]{index=14}

Each turn consists of three steps: :contentReference[oaicite:15]{index=15}

### Step 1 — Play 1 Card
The active player must:
- play **exactly 1 card** from their hand :contentReference[oaicite:16]{index=16}
- to any **open District**
- on **their own side**
- only if they have **fewer than 3** cards there :contentReference[oaicite:17]{index=17}

If no legal play exists, the player **passes** (digital-only clarification). Passing skips directly to Step 3 (Draw), if available.

### Step 2 — Automatic Claim Check
After the card is placed, the server checks whether any District becomes claimable:
- **Total Mandate (AAA)** → immediate claim :contentReference[oaicite:18]{index=18}
- **2+ players completed** (have 3 cards at that District) → claim is resolved by strongest configuration :contentReference[oaicite:19]{index=19}

Claiming is automatic and requires no extra action. :contentReference[oaicite:20]{index=20}

### Step 3 — Draw 1 Card
- The active player draws **1 card** from the draw pile, if available. :contentReference[oaicite:21]{index=21}
- If the draw pile is empty, skip the draw.

---

## 7. Configurations (Combinations)

A player’s **three cards** on a District form a **configuration**. :contentReference[oaicite:22]{index=22}

### 7.1 Strength Hierarchy (Strongest → Weakest)
1. **TOTAL MANDATE (AAA)**  
   - Three Aces  
   - Strongest possible configuration; overrides all others. :contentReference[oaicite:23]{index=23}

2. **Coordinated Strategy (Color Run)**  
   - Same color  
   - Consecutive values :contentReference[oaicite:24]{index=24}

3. **Unified Message**  
   - Three identical numbers (not Aces) :contentReference[oaicite:25]{index=25}

4. **Aligned Resources**  
   - Three cards of the same color, not consecutive :contentReference[oaicite:26]{index=26}

5. **Momentum**  
   - Consecutive numbers, mixed colors :contentReference[oaicite:27]{index=27}

6. **Party**  
   - Two identical numbers (a pair) **or** double Ace  
   - If both have Party: stronger pair wins  
   - If same pair: kicker wins :contentReference[oaicite:28]{index=28}

7. **Raw Pressure**  
   - None of the above  
   - Strength is the **sum** of the three cards :contentReference[oaicite:29]{index=29}

### 7.2 Tie Rules
If players have the same configuration type: :contentReference[oaicite:30]{index=30}
- For **Party**: compare pair value, then kicker
- For all others: higher **total value** wins

---

## 8. Ace Rules (A)

- An Ace is **not a number**, but a symbol. :contentReference[oaicite:31]{index=31}
- Valid runs:
  - **A–2–3**
  - **9–10–A**
- An Ace may not appear in the middle of a run. :contentReference[oaicite:32]{index=32}
- For any numeric comparison where a value is required (totals, tie totals, raw pressure), treat **Ace = 11**. :contentReference[oaicite:33]{index=33}

---

## 9. Crisis Rules (Wildcard)

When a Crisis card is played: :contentReference[oaicite:34]{index=34}
- The player must declare:
  - a **color**
  - a **value (2–10)**
- A Crisis card **may not** represent an Ace. :contentReference[oaicite:35]{index=35}
- A configuration may contain **at most one Crisis**. :contentReference[oaicite:36]{index=36}

### 9.1 Digital Declaration UX Requirement (Rule-Linked)
- The declaration is a **mandatory choice** during the play action.
- The chosen (color, value) becomes public immediately (it is now effectively that card on the table).

---

## 10. Claiming a District (Resolution)

Districts are **automatically claimed** when: :contentReference[oaicite:37]{index=37}
- **At least two players** have completed configurations at the District (3 cards each), **or**
- Any player has played **Total Mandate (AAA)**

### 10.1 Resolution Outcome
- The strongest configuration wins the District. :contentReference[oaicite:38]{index=38}
- The District becomes **claimed and closed**. :contentReference[oaicite:39]{index=39}
- No further cards may be played there. :contentReference[oaicite:40]{index=40}
- The active turn continues (i.e., proceed to Draw step if not done yet). :contentReference[oaicite:41]{index=41}

### 10.2 Resolution Scope
Only players with **3 cards** at that District are considered in the comparison.

---

## 11. Winning a Round

- The first player to claim **three Districts** wins the round. :contentReference[oaicite:42]{index=42}
- When a player reaches 3 claimed Districts, the round ends immediately after resolving any currently-triggered claim.

---

## 12. Digital Information Visibility

### 12.1 Public Information
All players can always see:
- all Districts, all placed cards, and their declared Crisis identities
- which Districts are claimed and by whom
- each opponent’s **hand size** (count only)

### 12.2 Private Information
- A player’s hand contents are private.

### 12.3 “Opponent Browsing” Indicator (Hearthstone-like)
To support “I see opponents are choosing”, the client may display:
- an **attention/selection state** (e.g., “Player B is browsing hand”)
- optional: a “hover index” ping (does **not** reveal card identity)

This is presentation-only and has **no gameplay effect**.

---

## 13. Timers and Pacing (Recommended Defaults)

(These are *digital-only constants*; tune during playtesting.)

- **Turn timer:** 25 seconds
- **Crisis declaration timer:** 10 seconds (auto-pick last selection; if none, random legal (color, value))
- **Reconnect grace:** 45 seconds (details in `12_disconnect_and_reconnect_rules.md`)

If a player times out on their turn:
1. If they have at least one legal play, the server makes a **random legal play**.
2. Then proceeds to Draw (if available).

---

## 14. Edge Case Rules (Determinism)

### 14.1 Empty Draw Pile
- The Draw step is skipped if no cards remain. :contentReference[oaicite:43]{index=43}

### 14.2 No Legal Plays
If a player cannot place a card on any open District (because all their sides are full or all districts are closed), they **pass**.

### 14.3 Round Stalemate (Rare Failsafe)
If all players consecutively pass and no new claims can occur:
- the round ends
- winner is the player with the most claimed Districts
- if tied, use the match tiebreak order (districts across round already tied → best configuration achieved)

---

## 15. Server Authority Requirement

The server is the source of truth for:
- legality of moves
- claim triggers and resolution
- configuration evaluation
- randomization (shuffle, dealing, random timeout plays)

Clients submit **intents**; the server validates and broadcasts results.

---

## 16. Versioning

This ruleset is identified as:
- `digital_ruleset_version: 0.1`

Any gameplay-affecting change must increment the version and be recorded in a changelog.

---
