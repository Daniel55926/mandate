# 07_ui_layout_spec.md
## MANDATE: The District Game — In-Match UI Layout Specification
Version: v0.1 (draft, implementation-oriented)  
Scope: **In-game screen layout + interaction zones** (not art/VFX definitions).  
Out of scope: detailed VFX recipes (`08_animation_and_vfx_styleguide.md`) and networking (`05_networking_protocol.md`).

This spec is based on the intended 3-player table layout:
- **Local Player (Player A)** at the bottom with a readable hand (front faces)
- **Opponent Left (Player C)** on the left (backs)
- **Opponent Right (Player B)** on the right (backs)
- **Central playing area** for Districts and played cards

---

## 1. UI Goals (Digital Hearthstone Feel)

1) **Table readability**: player immediately understands:
   - whose turn it is
   - where they can play
   - who is winning districts

2) **Fast interaction**: hover/drag/drop must feel immediate:
   - 60 FPS target on desktop
   - no layout thrash (use WebGL canvas transforms, not DOM reflow)

3) **3-player clarity**: districts must clearly show:
   - each player’s 0–3 cards on that district side
   - claimed/closed districts

4) **“Opponent browsing” awareness**:
   - show when opponents are actively selecting a card
   - never reveal card identities

---

## 2. Coordinate System and Scaling

### 2.1 Reference Resolution
All zone definitions are authored for a baseline of:
- **1920 × 1080 (16:9)**

### 2.2 Normalized Rectangles
Define zones in normalized viewport coordinates:
- `x`, `y`, `w`, `h` ∈ [0..1]
- origin is top-left

Example:
```json
{ "x": 0.20, "y": 0.12, "w": 0.60, "h": 0.55 }
2.3 Safe Area
Reserve a global safe margin:
SAFE_MARGIN = 0.03 (3% of viewport) on all sides
No interactive UI elements may be placed outside the safe area.
2.4 Scale Factor (recommended)
Maintain consistent physical sizing across displays:
scale = min(viewW / 1920, viewH / 1080)
All “pixel-like” values (corner radius, glow widths, card spacing) should multiply by scale.
3. Global Zone Map (16:9)
3.1 Primary Zones
These are the four major zones matching the draft:
ZONE_OPP_LEFT_HAND (Opponent Left / Player C)
ZONE_OPP_RIGHT_HAND (Opponent Right / Player B)
ZONE_BOARD (Central playing area with Districts)
ZONE_LOCAL_HAND (Player A hand)
3.2 Recommended Normalized Layout (16:9)
{
  "ZONE_OPP_LEFT_HAND":  { "x": 0.03, "y": 0.07, "w": 0.14, "h": 0.70 },
  "ZONE_OPP_RIGHT_HAND": { "x": 0.83, "y": 0.07, "w": 0.14, "h": 0.70 },

  "ZONE_BOARD":          { "x": 0.19, "y": 0.12, "w": 0.62, "h": 0.52 },

  "ZONE_LOCAL_HAND":     { "x": 0.22, "y": 0.67, "w": 0.56, "h": 0.28 }
}
3.3 HUD Zones (recommended)
Add lightweight HUD without cluttering the board:
{
  "HUD_TOP":        { "x": 0.19, "y": 0.03, "w": 0.62, "h": 0.08 },
  "HUD_LEFT_EDGE":  { "x": 0.03, "y": 0.80, "w": 0.14, "h": 0.17 },
  "HUD_RIGHT_EDGE": { "x": 0.83, "y": 0.80, "w": 0.14, "h": 0.17 }
}
HUD_TOP contains:
round number (1/2/3)
active player indicator
turn timer
claimed districts counts (Left / Right / Indep)
4. District Board Representation
4.1 Board Contents
The board must show:
7 District tiles in a row (D0..D6)
each District has 3 player sides (LEFT / RIGHT / INDEP)
each side has 3 placement slots (0..2)
4.2 District Tile Layout
Inside each District tile, represent the three player sides as “edges” facing each player:
Local Player (whoever the viewer is) gets the bottom edge slots
Opponent Left gets the left edge slots
Opponent Right gets the right edge slots
Minimal diagram (one district tile):
   [ Opponent Left slots ]
[ s0 ]
[ s1 ]     (District Center)     [ s0 ]
[ s2 ]                          [ s1 ]
                                 [ s2 ]
                 [ Local slots ]
                 [ s0 ][ s1 ][ s2 ]
This ensures each player instantly recognizes “their side” across all districts.
4.3 District Tile Sizing
Within ZONE_BOARD:
Arrange 7 district tiles horizontally with equal width
Recommended gaps:
horizontal gap: gapX = 0.012 * viewW
vertical padding: padY = 0.02 * viewH
If space becomes tight (smaller screens), switch to “two-row board mode” (see Section 9).
4.4 District Visual States
Each District tile must support these states:
OPEN_IDLE
subtle outline
OPEN_HOVER_LEGAL
bright outline + glow pulse
OPEN_HOVER_ILLEGAL
dim outline + “blocked” indicator
CLAIMED
locked overlay (e.g., stamp + owner color tint)
placement slots disabled
4.5 Claim Animation Socket
Each district tile must expose anchor points (for VFX & UI):
anchor_center
anchor_left_edge
anchor_right_edge
anchor_bottom_edge
So claim effects and “district won” banners can originate from consistent positions.
5. Hand Presentation
5.1 Local Hand (Player A)
Local hand shows front faces and supports:
idle “flame”/energy animation per card type (visual-only)
hover preview
drag to play
Hand Layout Mode: Fan
Cards are arranged in a curved fan
Overlap: 25–40% depending on card count
Max visible hand size baseline: 6–10 (you start with 6)
Recommended fan parameters:
angle range: [-18°, +18°]
vertical arc height: 0.08 * ZONE_LOCAL_HAND.h
hovered card raises by 0.03 * viewH and scales to 1.06
5.2 Opponent Hands (Left/Right)
Opponents show card backs only:
stacked or subtle mini-fan
always show hand count
show browsing indicator (Section 8)
Recommended stack behavior:
show top 5 backs as a stack with slight offset
if opponent hand size > 5, show a “+N” badge
6. Core Interactions
6.1 Hover (Desktop)
Hovering a local hand card:
elevates it above others
increases brightness
shows a preview (optional) near board, never covering legal target zones
Hovering a district tile:
highlights that tile
shows slot highlights:
empty slots: “available”
filled: “occupied”
6.2 Drag & Drop Play (Primary)
Flow:
Player presses + drags a card from local hand
Client enters DRAGGING_CARD mode:
highlights all legal districts
highlights player’s available slots on those districts
On release:
if dropped on legal slot → send PLAY_CARD
else → snap back to hand
Snap Rules
Snap target selection uses:
nearest legal slot center inside ZONE_BOARD
tie-break by district index (lowest)
6.3 Input Gating (Recommended)
When waiting for server resolution:
keep the dragged card in a “pending” visual state
disable additional play actions until:
server emits CARD_PLAYED (accepted)
or server rejects (snap back + error)
6.4 Crisis Declaration Modal
When a Crisis is played:
freeze the board in a “pending crisis” state (visual only)
show a modal/picker:
select color (6 options)
select value (2–10)
show countdown timer
when chosen → send DECLARE_CRISIS
Placement of modal
Prefer centered within ZONE_BOARD
Must not block the player’s hand entirely (keep context visible)
7. Turn and Status Indicators
7.1 Active Player
Always visible signals:
glow ring around active player avatar/seat label
subtle pulsing border around their hand zone
7.2 Turn Timer
Show:
numeric countdown
radial ring around active player indicator (optional)
7.3 Claimed Districts Score
Must show claimed counts:
Left / Right / Indep
Round ends when a player reaches 3.
8. “Opponent Browsing” Awareness (Hearthstone-like)
8.1 States
Each opponent can be in:
IDLE
BROWSING_HAND
PLAYING_CARD (short burst state after a play)
8.2 Visual Treatment
When opponent is browsing:
add subtle animated outline around their hand zone
optionally animate “card shuffle” micro-movement in their stack (no identity leakage)
Hard rule: never show which card is hovered/selected.
9. Responsive Layout Rules
9.1 Minimum Supported
Desktop: 1280×720
Mobile: landscape only (optional MVP), min 812×375 (iPhone landscape)
9.2 Layout Mode Switching
Use three modes:
Mode A — Widescreen (>= 16:9)
Use the primary zone map as defined in Section 3.
Mode B — Standard (between 4:3 and 16:9)
Reduce opponent hand widths and slightly shrink districts:
opponent zones become narrower
local hand remains readable (priority)
Mode C — Tight Height (short screens / mobile landscape)
Switch board to two-row districts:
Row 1: D0–D3
Row 2: D4–D6
Keep each district tile larger and touch-friendly.
10. Z-Order (Render Layers)
Recommended render layers (bottom to top):
Background
Board tiles (districts)
Board cards (placed cards)
Hand cards (local + opponents)
Highlights / target overlays
Particles & VFX (glows, flames, claim bursts)
HUD
Modals (Crisis picker, settings)
Toasts/tooltips
11. Feedback and Error UI
11.1 Invalid Play
If server rejects:
snap card back
show a short toast message (1.5–2s)
optionally flash the reason zone (e.g., district is claimed)
11.2 Latency
If server RTT is high:
show a small “Poor connection” indicator
avoid blocking hover/preview animations locally
12. UI Events Needed From Game Layer (Hooks)
The UI layer should respond to these logical events (names align with protocol but UI can map them):
ROOM_STATE (pre-game)
MATCH_STARTED
ROUND_STARTED
TURN_STARTED
CARD_PLAYED
CRISIS_DECLARATION_REQUIRED
CRISIS_DECLARED
DISTRICT_CLAIMED
CARD_DRAWN
ROUND_ENDED
MATCH_RESULT
PLAYER_PRESENCE (browsing hand)
13. Implementation Checklist
 Normalized zone rectangles implemented with safe area
 District tiles: 7 in row (or 2-row mode) with per-seat slot edges
 Local hand: fan + hover + drag + snap-back
 Legal target highlighting while dragging
 Crisis modal with timer
 Active player indicator + timer
 Opponent browsing indicator (no identity leakage)
 Z-order stable (no clipping bugs)
 Responsive mode switch (A/B/C)