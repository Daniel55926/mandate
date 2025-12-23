# 13_localization.md
## MANDATE: The District Game — Localization & Language Support
Version: v0.1 (implementation-ready draft)  
Languages supported in v0.1:
- English (`en`)
- Hungarian (`hu`)

This document defines:
- how UI text is structured and translated
- how fonts and special characters (Hungarian accents) are handled
- how the client selects language
- how to localize card metadata (if needed)
- how to keep localization stable with versioning

---

## 1. Goals

1) Support English + Hungarian across:
   - lobby UI
   - in-match UI
   - menus/settings
   - error messages / reason codes
2) Ensure **Hungarian accents always render correctly** (á, é, í, ó, ö, ő, ú, ü, ű).
3) Avoid hard-coded UI strings in code.
4) Keep translations maintainable as the game grows.

---

## 2. What Must Be Localized (v0.1)

### 2.1 Required UI areas
- Home:
  - Play / Create Room / Join Room / Settings
- Lobby:
  - invite code, ready/unready, loading, leave, host messages
- Match:
  - turn indicators
  - timer labels
  - district claim banners
  - round/match end screens
- Modals:
  - crisis declaration prompt
  - reconnecting / forfeited messages
- Errors:
  - intent rejected reason codes shown as player-friendly text

### 2.2 Not required (optional later)
- full rulebook rendering inside the app (you can link it separately)
- chat moderation strings (if no chat yet)

---

## 3. Language Selection Rules

### 3.1 Default Language
- On first launch: use browser language:
  - if starts with `hu` → `hu`
  - else → `en`

### 3.2 Player Override
- In settings: player can select language explicitly.
- Store in local storage:
  - `settings.language = "en" | "hu"`

### 3.3 Match Consistency
Each player can use their own language; language choice does not affect gameplay state.

---

## 4. File Structure (Recommended)

```

client/
src/
i18n/
en.json
hu.json
index.ts
format.ts

````

Server does not need localization for gameplay, but can provide stable reason codes.

---

## 5. Translation Key Convention

### 5.1 Rules
- Keys are stable and never renamed lightly.
- Keys are grouped by feature area.
- Use dot notation:
  - `lobby.ready`
  - `match.turn.yourTurn`
  - `errors.NOT_YOUR_TURN`

### 5.2 Example Keys
- `app.title`
- `home.playPublic`
- `home.playFriends`
- `home.joinRoom`
- `lobby.inviteCode`
- `lobby.ready`
- `lobby.unready`
- `lobby.waitingForPlayers`
- `loading.optimizingEffects`
- `match.round`
- `match.turnTimer`
- `match.yourTurn`
- `match.opponentTurn`
- `match.districtClaimed`
- `crisis.chooseColor`
- `crisis.chooseValue`
- `reconnect.reconnecting`
- `reconnect.reconnected`
- `forfeit.disconnectedTooLong`
- `errors.INVALID_PHASE`
- `errors.NOT_YOUR_TURN`
- `errors.DISTRICT_CLAIMED`

---

## 6. JSON Translation Files (Examples)

### 6.1 `en.json` (excerpt)
```json
{
  "app": {
    "title": "MANDATE",
    "subtitle": "The District Game"
  },
  "home": {
    "playFriends": "Play with Friends",
    "joinRoom": "Join Room",
    "createRoom": "Create Room"
  },
  "lobby": {
    "inviteCode": "Invite Code",
    "copy": "Copy",
    "ready": "Ready",
    "unready": "Not Ready",
    "waitingForPlayers": "Waiting for players..."
  },
  "match": {
    "yourTurn": "Your turn",
    "opponentTurn": "{name}'s turn",
    "round": "Round {n}",
    "turnTimer": "Time: {s}s",
    "districtClaimed": "{name} claimed a district"
  },
  "crisis": {
    "title": "Crisis Declaration",
    "chooseColor": "Choose a color",
    "chooseValue": "Choose a value"
  },
  "reconnect": {
    "reconnecting": "Reconnecting...",
    "reconnected": "Reconnected"
  },
  "forfeit": {
    "disconnectedTooLong": "You forfeited because you were disconnected too long."
  },
  "errors": {
    "NOT_YOUR_TURN": "It's not your turn.",
    "INVALID_PHASE": "That action isn't available right now.",
    "DISTRICT_CLAIMED": "That district is already claimed."
  }
}
````

### 6.2 `hu.json` (excerpt)

```json
{
  "app": {
    "title": "MANDATE",
    "subtitle": "A körzetek játékáról"
  },
  "home": {
    "playFriends": "Játék barátokkal",
    "joinRoom": "Csatlakozás szobához",
    "createRoom": "Szoba létrehozása"
  },
  "lobby": {
    "inviteCode": "Meghívókód",
    "copy": "Másolás",
    "ready": "Kész",
    "unready": "Nem kész",
    "waitingForPlayers": "Várakozás játékosokra..."
  },
  "match": {
    "yourTurn": "Te jössz",
    "opponentTurn": "{name} köre",
    "round": "{n}. forduló",
    "turnTimer": "Idő: {s} mp",
    "districtClaimed": "{name} megnyert egy körzetet"
  },
  "crisis": {
    "title": "Krízis megadása",
    "chooseColor": "Válassz színt",
    "chooseValue": "Válassz értéket"
  },
  "reconnect": {
    "reconnecting": "Újracsatlakozás...",
    "reconnected": "Visszacsatlakozva"
  },
  "forfeit": {
    "disconnectedTooLong": "Feladtad a meccset, mert túl sokáig voltál lecsatlakozva."
  },
  "errors": {
    "NOT_YOUR_TURN": "Most nem te jössz.",
    "INVALID_PHASE": "Ez a művelet most nem elérhető.",
    "DISTRICT_CLAIMED": "Ez a körzet már foglalt."
  }
}
```

---

## 7. Placeholder Formatting Rules

Use a single formatting function:

* `{name}`, `{n}`, `{s}` placeholders
* Always provide defaults in code to avoid blank strings.

Examples:

* `match.round`: `"Round {n}"`
* `match.opponentTurn`: `"{name}'s turn"`

---

## 8. Fonts and Hungarian Accents (Critical)

### 8.1 Requirements

* Font must support full Hungarian character set.
* Must render correctly in WebGL text system:

  * either MSDF/SDF font atlas
  * or bitmap font generated from TTF/OTF

### 8.2 Recommended font strategy

* Choose a font family with good Latin Extended support (e.g., Inter, Noto Sans).
* Generate:

  * `font_regular_msdf`
  * `font_semibold_msdf`
* Include these characters at minimum:

  * `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`
  * `0123456789`
  * punctuation used in UI
  * `áéíóöőúüűÁÉÍÓÖŐÚÜŰ`

### 8.3 Fallback

If MSDF generation is not ready, temporarily render UI text in DOM overlay (not ideal), but ensure consistent styling.

---

## 9. Localizing Game Terms (Glossary)

Keep a dedicated glossary mapping for consistency:

Recommended:

* “District” → “Körzet”
* “Round” → “Forduló”
* “Match” → “Meccs”
* “Claimed” → “Megnyerve”
* “Crisis” → “Krízis”
* “Ready” → “Kész”

Store these as keys under `terms.*` so they are reused:

* `terms.district`
* `terms.round`
* `terms.match`
* `terms.crisis`

---

## 10. Error Localization (Reason Codes)

The server returns reason codes (e.g., `NOT_YOUR_TURN`).
The client maps them to translation keys:

* reason code: `NOT_YOUR_TURN`
* translation key: `errors.NOT_YOUR_TURN`

If missing, fallback to:

* `errors.UNKNOWN` in current language
* also log missing key for QA

---

## 11. Versioning & QA

### 11.1 Localization version

Add a simple version:

* `i18n_version: 0.1`

### 11.2 QA checklist

* verify Hungarian accents on all screens
* verify text fits UI bounds (no clipping)
* verify placeholders render correctly
* verify error messages are understandable and not raw codes

---

## 12. Implementation Checklist

* [ ] Add `en.json` and `hu.json`
* [ ] Implement `t(key, params)` translation helper
* [ ] Add language selector in settings
* [ ] Ensure font supports Hungarian accents (áéíóöőúüű)
* [ ] Map protocol reason codes → localized strings
* [ ] Add glossary keys for reused terms
* [ ] QA pass: clipping and readability

---

```
```
