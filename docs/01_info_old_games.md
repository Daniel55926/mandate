## Legacy / Old Prototype Folder

If the repository contains an `Old game/` folder, treat it as:
- **archived reference only**
- not imported by client build
- not used by server runtime
- not included in asset pipeline inputs

Rule:
- The build scripts must only read from:
  - `client/`, `server/`, `tools/`, `docs/`
  - and `assets_source/` (if you create it)
- Anything under `Old game/` is excluded via `.gitignore` and/or build ignore patterns.
