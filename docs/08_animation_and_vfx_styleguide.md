# 08_animation_and_vfx_styleguide.md
## MANDATE: The District Game — Animation & VFX Styleguide (Digital)
Version: v0.1 (draft, production-oriented)  
Depends on:
- `04_data_model_cards_and_districts.md` (vfx_profile hooks)
- `07_ui_layout_spec.md` (zones + anchors)

This document defines the **digital “juice”** (Hearthstone-like feel) while staying consistent with MANDATE’s clean, institutional design language (minimal, geometric, high-contrast).

**Core requirements**
- Every card in hand has an **idle energy / flame-like** effect.
- Effects are **interactive**: hover, drag, play, resolve, claim.
- Effects vary by **card type (color)** and scale by **card power (value)**.
- Crisis has a unique “fracture/instability” effect.

> Note: “Flame” here is treated as **stylized energy**, not fantasy fire. The effect language should be geometric: glows, scanlines, routing flows, particle embers, refractive distortion.

---

## 1. VFX Design Pillars (MANDATE Look)

1) **Geometric energy** (lines, nodes, grids, pulses)
2) **High contrast** (white on dark, tinted accents only)
3) **Minimal clutter** (effects never obscure card face)
4) **Readable at speed** (quick tells: type + intensity)
5) **Performance-aware** (60 FPS; cap particles; reuse shaders)

---

## 2. VFX Layers (Per Card)

Each card supports these VFX layers:

1) `BASE_GLOW`  
2) `EDGE_ENERGY` (the “flame” analog)
3) `SURFACE_PATTERN` (scanlines / grid / noise)
4) `PARTICLES` (sparks / embers / dust)
5) `INTERACTION_HIGHLIGHT` (hover/drag/target)
6) `RESOLVE_BURST` (on play / on claim)

Not every profile needs all layers, but each color must have:
- an identifiable `EDGE_ENERGY` signature
- a distinct `SURFACE_PATTERN`

---

## 3. Intensity Scaling (Value → Power)

### 3.1 Value Levels
Map values into a normalized intensity `I` in [0..1].

Recommended mapping:
- 2 → 0.10
- 3 → 0.18
- 4 → 0.26
- 5 → 0.34
- 6 → 0.42
- 7 → 0.50
- 8 → 0.62
- 9 → 0.76
- 10 → 0.90
- A → 1.00

### 3.2 What Intensity Controls
Intensity affects:
- glow radius
- edge energy speed
- particle emission rate
- burst size on play
- shake/impact strength (Capital especially)

### 3.3 Caps (Performance)
Hard caps per card instance:
- particles: max 24 live (idle), 60 live (burst)
- shader passes: max 2 per card (idle), 3 during hover/drag
- texture reads: keep low; prefer atlas-packed sprites

---

## 4. Card Lifecycle Animations (Global)

These apply to all cards, regardless of type.

### 4.1 Spawn Into Hand (Draw)
Event: `CARD_DRAWN`
- card back appears at deck anchor
- flies to hand fan slot
- flips to face when it reaches hand (local player only)
- micro “settle” bounce

Parameters:
- duration: 300–450ms
- ease: cubic out
- optional: faint trail matching card type color tint

### 4.2 Idle In Hand
- subtle floating (1–2 px) with random phase
- `EDGE_ENERGY` runs continuously at low intensity
- no loud particles (keep it classy)

### 4.3 Hover
- card elevates + slight tilt
- glow intensifies to ~`I + 0.15` (clamped to 1.0)
- add `INTERACTION_HIGHLIGHT` rim

Duration: 120–180ms

### 4.4 Drag
- card scales to 1.06–1.10
- add “magnetic” edge energy that points toward cursor direction
- highlight legal targets on board

### 4.5 Invalid Drop / Snap Back
- quick “rejection” pulse (dim → normal)
- snap-back curve
- optional tiny shake (2–3 px) once

### 4.6 Play to Board
Event: `CARD_PLAYED`
- card flies from hand to district slot anchor
- on landing: short burst (type-specific)
- then transitions to “board idle” (calmer than hand)

### 4.7 Board Idle
Board cards should be less animated than hand cards:
- lower particle rate
- slower scanlines
- keep readability of the district

---

## 5. Crisis Special Flow VFX

### 5.1 Crisis In Hand (Idle)
- fractured highlight along card border
- subtle “unstable refraction” on edges
- particles: small white shards drifting upward

### 5.2 Crisis Played (Before Declaration)
Event: `CRISIS_DECLARATION_REQUIRED`
- card lands with a “裂” (fracture) burst
- surrounding area gets a brief distortion ring
- card shows an overlay “?” glyph (or blank) until declared

### 5.3 Crisis Declaration (Reveal)
Event: `CRISIS_DECLARED`
- overlay morphs into the chosen color/value signature:
  - surface pattern + glow adapts to declared type
- keep a faint fracture layer to always indicate it’s Crisis-derived

---

## 6. Color VFX Profiles (Type Signatures)

Each AssetColor has a signature set:
- `EDGE_ENERGY` style
- `SURFACE_PATTERN`
- `BURST` on play
- optional “sound-like” motion (visual rhythm)

> The actual tints should be subtle and consistent with the design system palette.

### 6.1 INSTITUTION (Blue) — “Authority Grid”
- EDGE: crisp rectangular pulses along border (like scanning frames)
- SURFACE: moving grid + scanline sweep
- PARTICLES: tiny square pixels that drift upward then fade
- BURST: outward grid expansion, like a stamp

High values: faster scan sweep, thicker border pulse.

### 6.2 BASE (Green) — “Network Nodes”
- EDGE: dotted nodes lighting in sequence around border
- SURFACE: faint node graph lines
- PARTICLES: small round sparks that connect briefly with lines
- BURST: node explosion that re-links into a triangle for a split second

High values: more nodes light simultaneously.

### 6.3 MEDIA (Yellow) — “Broadcast Waves”
- EDGE: oscillating wave glow that moves around perimeter
- SURFACE: subtle concentric rings / wave interference
- PARTICLES: light dust motes drifting sideways
- BURST: expanding wave rings + quick flash

High values: rings expand faster and farther.

### 6.4 CAPITAL (Red) — “Impact & Weight”
- EDGE: heavy glow that “thumps” (pulse synced to 0.6–0.9s)
- SURFACE: faint diagonal stress lines
- PARTICLES: ember-like shards (still geometric)
- BURST: impact shock + slight board shake (small!) + debris puff

High values: stronger pulse, slightly more shake.

### 6.5 IDEOLOGY (Purple) — “Persuasion Spiral”
- EDGE: slow rotating spiral highlight along border corners
- SURFACE: subtle swirling gradient/noise (very restrained)
- PARTICLES: tiny triangular motes orbiting then dissolving
- BURST: spiral bloom inward then snap outward

High values: spiral rotation speed increases, bloom brighter.

### 6.6 LOGISTICS (Grey) — “Routing Flow”
- EDGE: segmented lines that “route” around corners (like circuit traces)
- SURFACE: faint map/grid with moving “path” highlights
- PARTICLES: small line segments that travel then vanish
- BURST: path highlight shoots from card center to border corners

High values: more routes light at once, faster motion.

---

## 7. Value-Based “Power Moments” (2–10, Ace)

These are optional micro-events that happen on:
- hover (rare)
- play landing (always)

### 7.1 2–4 (Low)
- small burst
- no screen shake
- minimal particles

### 7.2 5–7 (Mid)
- medium burst + slight glow bloom
- one extra flourish matching type signature

### 7.3 8–10 (High)
- larger burst + short afterglow
- 2-stage burst (pop + ripple)
- add a quick “focus vignette” on the played card (120ms)

### 7.4 Ace (Peak)
- unique “crown” moment:
  - a thin ring forms around the card and collapses into it
  - type signature becomes crisp and bright for 250ms
- if Ace completes a key configuration (e.g., Total Mandate), trigger district-level effect (Section 8)

---

## 8. District-Level Effects (Claiming / Win Moments)

### 8.1 District Claim
Event: `DISTRICT_CLAIMED`
- district tile flashes with winner’s type tint
- winner’s three cards briefly sync pulse together
- a “CLAIM” stamp or lock overlay animates in

Duration: 350–600ms

### 8.2 Total Mandate (AAA) Claim
If the winning configuration is `TOTAL_MANDATE`:
- stronger claim animation:
  - triple pulse
  - subtle camera zoom to that district (2–3%)
  - a geometric crown/hex stamp over the district center

Keep it short; don’t block gameplay longer than 800ms.

---

## 9. Opponent Presence Animations (Non-Revealing)

### 9.1 Browsing Hand
Event: `PLAYER_PRESENCE(is_browsing_hand=true)`
- opponent hand stack gently “breathes”
- thin outline animates around their hand zone

### 9.2 Opponent Played Card
When opponent plays a card:
- show a quick trail from their hand zone to board slot
- card arrives face-up on board (public info)

---

## 10. Audio Hooks (Optional, But Recommended)

Even if you don’t implement audio now, reserve event hooks:
- `SFX_HOVER(type, intensity)`
- `SFX_PICKUP(type)`
- `SFX_DROP_VALID(type, intensity)`
- `SFX_DROP_INVALID()`
- `SFX_CLAIM(config_type)`
- `SFX_TIMER_WARNING()`

Keep audio short, punchy, and “tech/political” rather than fantasy.

---

## 11. VFX Profile Naming (Data Model Integration)

Every card definition has `vfx_profile`.

Recommended naming:
- Assets: `<color>_<value>`
  - `institution_07`, `capital_A`, `logistics_10`
- Crisis: `crisis_default` plus declared overlay
  - `crisis_default` + `declared_media_09` (runtime)

District claim:
- `district_claim_<winner_seat>`
- `district_claim_total_mandate`

---

## 12. Performance Requirements

### 12.1 FPS Targets
- Desktop: 60 FPS
- Low-end: 45 FPS acceptable but stable

### 12.2 Dynamic Quality Scaling
If frame time > threshold for 2s:
- reduce particles by 50%
- reduce blur radius / glow passes
- reduce distortion effects (Crisis) first

### 12.3 Asset Guidelines
- Prefer texture atlases
- Avoid large per-card unique shader textures
- Use simple signed-distance outlines where possible

---

## 13. Implementation Checklist

- [ ] Common lifecycle animations implemented (draw, hover, drag, play, snap-back)
- [ ] 6 distinct type profiles implemented
- [ ] Intensity scaling by value (2–10, A)
- [ ] Crisis special flow (pre-declare + post-declare)
- [ ] District claim effects (+ Total Mandate special)
- [ ] Opponent browsing presence indicator
- [ ] Quality scaling + particle caps

---