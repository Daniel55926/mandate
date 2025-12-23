````md
# 16_audio_system.md
## MANDATE: The District Game — Audio System (SFX + Music + One-Time ElevenLabs Import)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `03_game_state_machine.md` (phases + transitions)
- `05_networking_protocol.md` (events that trigger audio)
- `07_ui_layout_spec.md` (interaction surfaces)
- `08_animation_and_vfx_styleguide.md` (VFX ↔ SFX hooks)

This document defines:
- a complete **sound effect map** (every button + every gameplay action)
- a **one-time** SFX generation/import pipeline using the ElevenLabs Sound Effects API
- how your existing music files are played: `lobby.mp3`, `round1.mp3`, `round2.mp3`, `round3.mp3`, `tiebreaker.mp3`, `gameendwin.mp3`, `gameendlose.mp3`

Hard requirement: **SFX are generated once (build-time) and shipped as static files. No runtime SFX generation.**

---

## 1. Audio Goals

1) Make UI feel “premium mobile poker / Hearthstone”: every action has feedback.
2) Keep gameplay readable: SFX are short, layered, never noisy.
3) Deterministic triggers: audio is driven by **server events** + UI interactions.
4) One-time SFX import: generate and save files once; client just loads them.

---

## 2. Folder Layout (Runtime)

Recommended runtime structure (fits `09_asset_pipeline.md` style):

assets_runtime/
  audio/
    music/
      lobby.mp3
      round1.mp3
      round2.mp3
      round3.mp3
      tiebreaker.mp3
      gameendwin.mp3
      gameendlose.mp3
    sfx/
      ui_click_01.mp3
      ui_hover_01.mp3
      ...
    manifests/
      audio_manifest.json

---

## 3. Music System (Your Existing MP3s)

### 3.1 Music Tracks and When They Play

#### `lobby.mp3`
Play when:
- `ROOM_OPEN`
- `ROOM_READY_CHECK`
- `ROOM_LOADING`
Stop (crossfade out) when entering `ROOM_IN_MATCH`.

#### `round1.mp3`
Play when:
- Match starts AND `round_index == 1` AND round becomes active.

#### `round2.mp3`
Play when:
- `round_index == 2` starts (on `ROUND_STARTED` event).

#### `round3.mp3`
Play when:
- `round_index == 3` starts (on `ROUND_STARTED` event).

#### `tiebreaker.mp3`
Play when:
- match enters `MATCH_END` **with a 1–1–1 situation**, i.e. the tiebreak calculation path is used.
- This should begin immediately after Round 3 ends, when the server announces the tiebreak is happening (recommended: add `MATCH_TIEBREAK_STARTED` event).

#### `gameendwin.mp3` / `gameendlose.mp3`
Play when:
- `MATCH_RESULT` arrives and the **local player** is winner/loser.
Behavior:
- Immediately stop current round music with a short fade (250–400ms).
- Play the end track as a non-looping “stinger”.
- After it ends, transition back to `lobby.mp3` if user returns to lobby.

### 3.2 Music Playback Rules
- All background tracks loop except `gameendwin.mp3` and `gameendlose.mp3`.
- Crossfade between background tracks:
  - fade out old track: 350ms
  - fade in new track: 450ms
- Optional: “duck” music volume by -6dB for 200ms on high-impact SFX (claim, total mandate, game end).

---

## 4. Sound Effects (SFX) Coverage Map

This section defines **every dedicated SFX** you should have.

### 4.1 UI Navigation & Buttons
- `ui_click_primary` — main buttons (Play, Create Room, Ready)
- `ui_click_secondary` — secondary buttons (Back, Settings)
- `ui_toggle_on` — toggles on
- `ui_toggle_off` — toggles off
- `ui_hover` — hover on interactive UI (desktop)
- `ui_error` — generic error toast / rejection
- `ui_copy` — copy invite code
- `ui_modal_open` — open settings / crisis picker
- `ui_modal_close` — close modal

### 4.2 Lobby
- `lobby_join` — successful join
- `lobby_leave` — leaving room
- `lobby_ready` — you set ready
- `lobby_unready` — you unset ready
- `lobby_all_ready` — all 3 ready (start loading)
- `lobby_countdown_tick` — optional final 3..2..1 (if you add it)

### 4.3 Match / Round Flow
- `match_start` — match begins
- `round_start` — round splash
- `turn_start_yours` — your turn begins
- `turn_start_theirs` — opponent turn begins (subtle)
- `timer_warning` — last 5 seconds (tick)
- `round_win` — local player wins round
- `round_lose` — local player loses round

### 4.4 Card Interactions (Local Player)
- `card_hover` — hover a hand card
- `card_pickup` — start dragging a card
- `card_drag_loop` — optional quiet loop while dragging (very subtle)
- `card_drop_valid` — successful placement
- `card_drop_invalid` — invalid drop snapback
- `card_draw` — card drawn into your hand
- `card_shuffle_opponent` — opponent draw (tiny)
- `hand_fan_settle` — subtle settle after reorder

### 4.5 Crisis Flow
- `crisis_played` — crisis lands on board (fracture hit)
- `crisis_prompt` — “declare crisis” appears
- `crisis_select_color` — choosing color
- `crisis_select_value` — choosing value
- `crisis_confirm` — declaration confirmed
- `crisis_auto` — auto-declare happened (distinct “system” sound)

### 4.6 District / Claim Resolution
- `district_claim` — district claimed (standard)
- `district_claim_total_mandate` — stronger “AAA” claim
- `district_lock` — district closes/locks
- `score_tick` — claimed counter increments (optional micro “tick”)

### 4.7 Networking / System
- `net_reconnecting` — banner appears
- `net_reconnected` — back online
- `net_desync_snapshot` — snapshot applied (very subtle)
- `forfeit` — player forfeited
- `kick` — kicked from lobby (if implemented)

---

## 5. ElevenLabs SFX: One-Time Generation + Import

### 5.1 Why Build-Time Generation
- No API keys in client.
- No latency during gameplay.
- Fully deterministic “asset set” shipped like your card PNGs.

### 5.2 API + SDK Notes
ElevenLabs provides SDK-based usage for sound effects generation (example shows `text_to_sound_effects.convert(...)`) and recommends storing the API key in `ELEVENLABS_API_KEY`. :contentReference[oaicite:0]{index=0}  
Keep API key server-side or in a local build tool; never in browser code. (They also document secure access patterns and token considerations.) :contentReference[oaicite:1]{index=1}

### 5.3 One-Time Import Script (Node/TypeScript)

Create:
- `tools/audio/generate_sfx.mts`

This script:
1) defines a list of SFX IDs + prompts
2) generates 1–3 variations per SFX (optional)
3) saves the chosen file into `assets_runtime/audio/sfx/`
4) outputs `assets_runtime/audio/manifests/audio_manifest.json`

**ONE-TIME import rule:** you run this script when you change prompts or add sounds, then commit the generated mp3 files.

#### Example script (single client instance)
```ts
// tools/audio/generate_sfx.mts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ElevenLabs } from "elevenlabs"; // use the official TS SDK you install

const OUT_DIR = path.resolve("assets_runtime/audio/sfx");
fs.mkdirSync(OUT_DIR, { recursive: true });

const eleven = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

// Keep prompts short, concrete, and “tech/political” not fantasy-fire.
const SFX: Array<{ id: string; prompt: string }> = [
  { id: "ui_click_primary", prompt: "Short clean UI button click, modern app, subtle" },
  { id: "ui_click_secondary", prompt: "Soft UI tap, minimal, quieter than primary click" },
  { id: "ui_toggle_on", prompt: "Toggle switch on, light snap, minimal" },
  { id: "ui_toggle_off", prompt: "Toggle switch off, light snap, minimal" },
  { id: "ui_error", prompt: "Soft error blip, modern UI, not harsh" },

  { id: "card_pickup", prompt: "Card picked up from table, soft whoosh, subtle paper/plastic" },
  { id: "card_drop_valid", prompt: "Card placed onto table slot, satisfying tap, minimal" },
  { id: "card_drop_invalid", prompt: "Soft thud and quick reject blip, UI feedback" },
  { id: "card_draw", prompt: "Quick card draw whoosh, light and crisp" },

  { id: "district_claim", prompt: "Short victory stamp, digital thump, clean" },
  { id: "district_claim_total_mandate", prompt: "Stronger victory stamp, triple pulse feel, powerful" },

  { id: "crisis_played", prompt: "Fracture impact, glassy crack but restrained, digital" },
  { id: "crisis_confirm", prompt: "Confirmation chime, tense but clean" },

  { id: "net_reconnecting", prompt: "Soft reconnect pulse, subtle alert" },
  { id: "net_reconnected", prompt: "Reconnect success chime, minimal" }
];

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  for (const s of SFX) {
    const outPath = path.join(OUT_DIR, `${s.id}.mp3`);

    // SDK call (per ElevenLabs sound effects quickstart)
    // The docs show: elevenlabs.text_to_sound_effects.convert(text="...") :contentReference[oaicite:2]{index=2}
    const audioBytes: Uint8Array = await eleven.textToSoundEffects.convert({
      text: s.prompt,
      // If the SDK supports format/options, set mp3 here.
    });

    fs.writeFileSync(outPath, Buffer.from(audioBytes));
    console.log(`Wrote ${outPath}`);
  }

  // Write manifest for the client
  const manifest = {
    version: "audio_0.1.0",
    sfx: SFX.map(s => ({
      id: s.id,
      file: `assets_runtime/audio/sfx/${s.id}.mp3`
    })),
    music: [
      { id: "lobby", file: "assets_runtime/audio/music/lobby.mp3", loop: true },
      { id: "round1", file: "assets_runtime/audio/music/round1.mp3", loop: true },
      { id: "round2", file: "assets_runtime/audio/music/round2.mp3", loop: true },
      { id: "round3", file: "assets_runtime/audio/music/round3.mp3", loop: true },
      { id: "tiebreaker", file: "assets_runtime/audio/music/tiebreaker.mp3", loop: true },
      { id: "gameendwin", file: "assets_runtime/audio/music/gameendwin.mp3", loop: false },
      { id: "gameendlose", file: "assets_runtime/audio/music/gameendlose.mp3", loop: false }
    ]
  };

  const manifestPath = path.resolve("assets_runtime/audio/manifests/audio_manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`Wrote ${manifestPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
````

**Notes**

* This uses a **single ElevenLabs client instance** (“one-time import” / no dynamic runtime generation).
* If your SDK method names differ slightly, keep the structure but adjust the call; the quickstart demonstrates the `text_to_sound_effects.convert` usage pattern. ([ElevenLabs][1])

---

## 6. Client Audio Runtime (How It Plays SFX + Music)

### 6.1 Audio Manager Responsibilities

* Load `audio_manifest.json` during `ROOM_LOADING` (or earlier).
* Preload:

  * core UI SFX
  * current scene music (lobby or round track)
* Provide two channels:

  * `musicBus` (looping tracks, fades)
  * `sfxBus` (one-shots, optional ducking)

### 6.2 Trigger Sources

SFX triggers come from:

1. **UI interactions** (button click, hover, drag start)
2. **Server events** (CARD_PLAYED, DISTRICT_CLAIMED, ROUND_ENDED)

Rule: gameplay-impact sounds should be triggered by **server events** to avoid “false audio” from rejected actions.

---

## 7. Event → Music Mapping (Authoritative)

### 7.1 Lobby

* On `ROOM_STATE` with phase in {`ROOM_OPEN`,`ROOM_READY_CHECK`,`ROOM_LOADING`}:

  * ensure music = `lobby`

### 7.2 Match / Rounds

* On `MATCH_STARTED`: fade from lobby → round music for current `round_index`
* On `ROUND_STARTED(round_index=n)`:

  * switch music to:

    * 1 → `round1`
    * 2 → `round2`
    * 3 → `round3`

### 7.3 Tiebreaker

* If server emits `MATCH_TIEBREAK_STARTED`:

  * fade to `tiebreaker`
    (If you don’t add that event, you can infer it when Round 3 ends and match is 1–1–1, but explicit is cleaner.)

### 7.4 Match End

* On `MATCH_RESULT`:

  * stop loop music, play:

    * `gameendwin` if local seat is winner
    * `gameendlose` otherwise

---

## 8. Mixing & Volume Defaults

Recommended defaults (adjust by ear):

* Master: 1.0
* Music: 0.55
* SFX: 0.80
* UI click SFX: 0.55
* Big moments (claim / total mandate): 0.95 with short ducking of music

---

## 9. Implementation Checklist

* [ ] Add `assets_runtime/audio/music/*` (your mp3s)
* [ ] Create `tools/audio/generate_sfx.mts`
* [ ] Generate SFX once and commit mp3 outputs
* [ ] Generate `audio_manifest.json`
* [ ] Client AudioManager:

  * manifest load
  * preload
  * two buses (music/sfx)
  * fade + ducking
* [ ] Hook UI buttons + interactions to UI SFX
* [ ] Hook server events to gameplay SFX
* [ ] Hook room/match/round phases to music switching

---

```
::contentReference[oaicite:4]{index=4}
```

[1]: https://elevenlabs.io/docs/developers/guides/cookbooks/sound-effects "Sound Effects quickstart | ElevenLabs Documentation"
