# 09_asset_pipeline.md
## MANDATE: The District Game — Asset Pipeline (Cards, Icons, Atlases, Manifests)
Version: v0.1 (implementation-ready draft)  
Depends on:
- `04_data_model_cards_and_districts.md` (card_def_id + display keys)
- `07_ui_layout_spec.md` (UI zones that reference assets)
- `08_animation_and_vfx_styleguide.md` (vfx_profile naming)

This document defines how to go from your **current Canva export folders** to a production-ready asset set for a WebGL client (PixiJS / Phaser).

---

## 1. Current Source Folder Structure (Accepted)

Your current structure (example):

Card/
  Base cards png/        2.png ... 10.png A.png
  Base cards svg/        2.svg ... 10.svg A.svg
  Capital cards png/     ...
  Capital cards svg/     ...
  Crisis.png
  Crisis.svg
  Ideology cards png/    ...
  Ideology cards svg/    ...
  Institution cards png/ ...
  Institution cards svg/ ...
  Logistics cards png/   ...
  Logistics cards svg/   ...
  Media cards png/       ...
  Media cards svg/       ...

This is a valid “source-of-truth” art folder. The pipeline will normalize it.

---

## 2. Key Principles

1) **Never rely on folder names with spaces at runtime.**
   - Spaces + case differences can break builds, CDNs, and imports.
2) Keep your Canva exports as **source**, generate a **normalized runtime** folder.
3) Use a generated **manifest** as the only truth the client loads.
4) For performance, prefer **texture atlases** (sprite sheets) in the final build.

---

## 3. Canonical Naming (Runtime)

### 3.1 Color Keys (Canonical)
Use these lowercase keys in runtime:
- institution
- base
- media
- capital
- ideology
- logistics

### 3.2 Value Keys
- `A` stays `A`
- `2..9` become `02..09` (zero-padded)
- `10` stays `10`

Why: sorting, stable atlas packing, and consistent URLs.

Mapping examples:
- `2.png` → `02.png`
- `9.svg` → `09.svg`
- `A.png` → `A.png`

---

## 4. Runtime Folder Layout (Generated)

The pipeline generates a clean runtime tree:

assets_runtime/
  cards/
    fronts/
      institution/ A.png 02.png ... 10.png
      base/        A.png 02.png ... 10.png
      media/       A.png 02.png ... 10.png
      capital/     A.png 02.png ... 10.png
      ideology/    A.png 02.png ... 10.png
      logistics/   A.png 02.png ... 10.png
    svg/
      institution/ A.svg 02.svg ... 10.svg
      ... (same for all colors)
    crisis/
      crisis_01.png
      crisis_02.png
      crisis_03.png
      crisis.svg
    back/
      card_back.png

  atlases/                 (optional but recommended)
    cards_fronts_1x.png
    cards_fronts_1x.json
    cards_fronts_2x.png
    cards_fronts_2x.json
    ui_common_1x.png
    ui_common_1x.json

  manifests/
    asset_manifest.json
    card_catalog.json
    build_report.json

---

## 5. Crisis Card Handling (Your Current Files)

Your rules define **3 Crisis cards** total.

You currently have:
- `Crisis.png`
- `Crisis.svg`

Two valid options:

### Option A (Simplest): Same art for all three Crisis cards
Generate:
- crisis_01.png = Crisis.png
- crisis_02.png = Crisis.png
- crisis_03.png = Crisis.png

and same for SVG if needed.

### Option B (Later): Distinct art for each Crisis
If you later export:
- Crisis_01.png, Crisis_02.png, Crisis_03.png
the pipeline maps them directly.

MVP recommendation: **Option A**.

---

## 6. Card Catalog (Generated JSON)

The pipeline generates `manifests/card_catalog.json` which maps your canonical IDs to runtime assets.

### 6.1 card_def_id mapping
Use the IDs from `04_data_model_cards_and_districts.md`:

- `asset.<color>.<value>`
  - example: `asset.base.7`
  - example: `asset.media.A`
- `crisis.<index>`
  - `crisis.1`, `crisis.2`, `crisis.3`

### 6.2 Example Entries
```json
[
  {
    "card_def_id": "asset.base.7",
    "kind": "ASSET",
    "asset_color": "BASE",
    "asset_value": "7",
    "display": {
      "front_png": "assets_runtime/cards/fronts/base/07.png",
      "front_svg": "assets_runtime/cards/svg/base/07.svg",
      "back_png": "assets_runtime/cards/back/card_back.png"
    },
    "vfx_profile": "base_07"
  },
  {
    "card_def_id": "asset.institution.A",
    "kind": "ASSET",
    "asset_color": "INSTITUTION",
    "asset_value": "A",
    "display": {
      "front_png": "assets_runtime/cards/fronts/institution/A.png",
      "front_svg": "assets_runtime/cards/svg/institution/A.svg",
      "back_png": "assets_runtime/cards/back/card_back.png"
    },
    "vfx_profile": "institution_A"
  },
  {
    "card_def_id": "crisis.2",
    "kind": "CRISIS",
    "display": {
      "front_png": "assets_runtime/cards/crisis/crisis_02.png",
      "front_svg": "assets_runtime/cards/crisis/crisis.svg",
      "back_png": "assets_runtime/cards/back/card_back.png"
    },
    "vfx_profile": "crisis_default"
  }
]
7. Asset Manifest (Generated JSON)
manifests/asset_manifest.json is what the client loads first.
It provides:
asset_manifest_version (hash)
list of files to preload
atlas metadata
Example:
{
  "asset_manifest_version": "am_0.1.0+sha1:9c2e...",
  "atlases": [
    {
      "name": "cards_fronts_1x",
      "image": "assets_runtime/atlases/cards_fronts_1x.png",
      "meta":  "assets_runtime/atlases/cards_fronts_1x.json"
    }
  ],
  "raw_files": [
    "assets_runtime/cards/back/card_back.png"
  ]
}
8. Validation Rules (Build Must Fail If Violated)
8.1 Required coverage
For each of the 6 colors:
must contain: A and 2..10 as PNG
(optional) SVG equivalents, but recommended
That’s 6 × 11 = 66 files for PNG fronts.
8.2 File presence checks
Fail build if any are missing:
fronts/<color>/A.png
fronts/<color>/02.png … 10.png
8.3 Naming normalization
If source folder uses:
2.png instead of 02.png
the pipeline should copy + rename into runtime.
8.4 No-spaces runtime rule
Runtime asset paths must not contain spaces.
9. Texture Atlas Packing (Recommended)
9.1 Why atlases
Loading 60+ separate PNGs mid-game causes:
stutters (many network requests)
GPU texture switching
higher memory overhead
Atlases reduce this dramatically.
9.2 Packing strategy
Pack all card fronts into 1–2 atlases per resolution tier:
cards_fronts_1x
cards_fronts_2x (optional)
Keep UI icons and FX sprites separate:
ui_common_1x
9.3 Resolution tiers
Recommended:
2x for desktop crispness (preferred)
1x fallback for low-end or bandwidth-saving mode
If you only have one export size today:
treat it as 2x, generate 1x by downscaling in the build step.
10. Runtime Loading Policy (Client)
10.1 What to preload before match starts
In ROOM_LOADING:
load asset_manifest.json
load atlases listed in manifest
load card back
load minimal UI
10.2 What NOT to preload
heavy optional VFX textures (if any)
optional audio packs (can stream later)
10.3 Cache strategy
filenames or manifest version should include a content hash
client stores last manifest version in local storage
if version changes: refresh assets
11. How the Client Uses Assets
The client never “guesses” file paths.
It asks the catalog:
Given card_def_id = asset.base.7
→ look up front_png (or atlas frame key)
→ render sprite

This guarantees you can reorganize files later without touching game logic.

12. Suggested Improvements to Your Current Source Folders (Optional)
You can keep your current folders, but for long-term sanity:
Rename folders to remove spaces:
Base cards png → base/png
Base cards svg → base/svg
Use zero-padded values in source:
2.png → 02.png
Not required, but reduces pipeline complexity.
13. Build Report (Generated)
manifests/build_report.json should include:
list of missing files (if any)
number of assets packed
atlas sizes
manifest version
build timestamp
14. Implementation Checklist
 Import source folders
 Normalize names (spaces removed, values zero-padded)
 Generate runtime tree
 Generate card_catalog.json
 Generate asset_manifest.json
 Validate coverage (6 colors × 11 values + 3 crisis)
 Pack texture atlases (recommended)
 Emit build report with hash version


 ## 8. Branding Assets (Logo + Landing Headers)

### Source files (design exports)
- Logo (transparent): `Logo without the background.png`  ✅ canonical
- Logo (with bg): `Logo clean (With background).png`     fallback
- Landing header EN: `LANDING PAGE Header (Eng).png`
- Landing header HU: `Landing page header (Hun).png`

### Runtime placement (generated / copied into runtime)
assets_runtime/
  branding/
    logo/
      mandate_logo.png              (from transparent logo)
      mandate_logo_bg.png           (from with-background logo)
    landing/
      landing_header_en.png
      landing_header_hu.png

### Branding manifest (included in asset_manifest.json)
Add these files to `raw_files`:
- assets_runtime/branding/logo/mandate_logo.png
- assets_runtime/branding/logo/mandate_logo_bg.png
- assets_runtime/branding/landing/landing_header_en.png
- assets_runtime/branding/landing/landing_header_hu.png

### Usage rules
- In-app logo usage: always prefer `mandate_logo.png` (transparent).
- Only use `mandate_logo_bg.png` when you need a fixed rectangle on unknown backgrounds.
- Landing header:
  - EN clients load `landing_header_en.png`
  - HU clients load `landing_header_hu.png`
- Landing headers are used only on:
  - home/landing screen
  - splash screen (optional)
  - not inside the match UI

### Localization hook
- If `language == hu` → use `lan
