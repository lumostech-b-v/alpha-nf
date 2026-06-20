# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A desktop EEG neurofeedback application for clinicians. An **Electron** shell (`frontend/`) talks over HTTP + WebSocket on `localhost:8000` to a bundled **FastAPI** backend (`pyServer/`). The backend owns the database, EEG device I/O, and the real-time signal-processing pipeline. In production the backend ships as a PyInstaller binary (`main.exe`) that Electron spawns and manages.

```
[Electron renderer (vanilla JS)]  --HTTP/WS localhost:8000-->  [FastAPI app]
        frontend/src                                              pyServer/app  (domain routers + service layer)
                                                                  pyServer/signal_processing  (real-time EEG pipeline)
                                                                  pyServer/device_handlers    (real device / mock)
                                                                       └── SQLite app.db (SQLAlchemy)
```

## Commands

### Backend (`pyServer/`)
```bash
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.core.main:app --reload        # run API; auto-creates tables + runs migrations on startup
python run_migrations.py                  # apply schema migrations manually
python create_default_user.py             # seed a default login
python initialize_protocols.py            # load protocol library into DB
python -m pytest                          # full test sweep (discovers test_*.py)
python test_auth.py                       # JWT/login integration drill (run a single test file directly)
python test_device_acquisition.py         # EEG device I/O drill
ruff . && black . && isort .              # lint + format before a PR
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev        # electron . --dev  (does NOT start the backend — run uvicorn separately in dev)
npm run start      # electron .
npm run dist       # electron-builder, no publish — produces installer bundling pyServer/dist/main.exe
```

## Producing the final installer (.exe)

The end product is **one Windows installer** (`frontend/dist/NeuroFeedback System-Setup-<version>.exe`, ~60–80 MB) that bundles the Electron frontend, the PyInstaller-packaged backend, and `config.json`. It is built in two stages:

1. **Backend exe (must run on Windows — PyInstaller is platform-specific):**
   ```cmd
   cd pyServer
   build-windows.bat        REM creates/uses .venv, pip installs, runs: pyinstaller build_backend.spec
   ```
   `build_backend.spec` is **onefile** mode (entry `app/core/main.py`, `console=True`, bundles `config.json` + `app.db`, excludes matplotlib/tkinter). New runtime deps must be added to the spec's `hiddenimports`/`datas`.
   - **Actual output: `pyServer/dist/main.exe`** (single file). Note: `build-windows.bat`, `BUILD.md`, and `build.sh` still say `dist/main/main.exe` (onedir layout) — that wording is **stale**; the spec produces a flat `dist/main.exe`, which is what `frontend/package.json` `extraResources` expects (`../pyServer/dist/main.exe`).

2. **Installer (can run on any platform):**
   ```bash
   ./build-windows-installer.sh        # or build-windows-installer.bat / .ps1 at repo root
   ```
   This verifies the backend exe exists, then runs `npm run build:win` (electron-builder → NSIS). `package.json` `build` copies the exe to `resources/backend/main.exe` and `config.json` to `resources/backend/config.json`; `frontend/src/main.js` spawns that exe at runtime (see the Electron lifecycle note below).

For backend-only iteration on macOS/Linux, `pyServer/build.sh` produces a native `main` binary for local testing. Full reference: `QUICK-START-WINDOWS.md`, `WINDOWS-INSTALLER.md`, `pyServer/BUILD.md`.

## Architecture notes that aren't obvious from a single file

### Frontend is vanilla JS, not React
Despite React/Vite/Mantine entries in `package.json`, the live renderer is **plain ES modules loaded by `frontend/src/renderer/index.html`**, with `axios`, `chart.js`, and `lucide` pulled from CDN. There is no `vite.config` and no `.jsx`. The React deps are aspirational/unused — do not assume a JSX build step exists.
- `js/core/` — `API.js` (axios singleton, `baseURL` defaults to `http://localhost:8000`), `AuthManager.js`, `WebSocketManager.js`, `NeuroFeedbackApp.js` (orchestrator), `api/*API.js` (per-domain HTTP wrappers), `ui/ui-*.js` (imperative DOM controllers).
- `js/features/` — higher-level panels (session planning/preparation/analysis, reporting, progress, feedback window).
- `STRUCTURE.md` in the renderer is partially stale; trust the actual file tree.

### Electron ⇄ backend lifecycle (`frontend/src/main.js`)
`main.js` spawns the backend, **not** the renderer. In production it looks for `process.resourcesPath/backend/main.exe`; in dev it falls back to `pyServer/dist/main/main.exe`. It kills orphan `main.exe`/`uvicorn` processes and frees port 8000 on startup, then sends the resolved `backend-url` to the renderer via IPC (`backend-ready` / `backend-url`). Because `npm run dev` does not launch uvicorn, run the backend yourself when developing.

### FastAPI is composed by domain package
`app/core/main.py::create_app()` mounts one router per domain package, each following the same `models.py` / `schemas.py` / `crud.py` / `routes.py` layout:
`app/users`, `app/patients`, `app/sessions`, `app/protocols`, `app/planning`, plus `signal_processing/sp_routes.py` (mounted under `/sp`). **Routers stay thin — business logic lives in `crud.py`/service modules.** A new domain should mirror this layout and the router prefix should match the package name.

### Database & migrations — no Alembic
`app/core/database.py` resolves a SQLite path (`app.db`) based on frozen-vs-script execution and OS user-data dirs; override with the `DATABASE_URL` env var. On startup the lifespan handler runs `Base.metadata.create_all` **and then a hand-rolled migration system** in `app/core/migrations.py` (raw SQL that detects old vs new schema, e.g. the plans/checkpoints → patient/blocks restructure). When you change a model, add the corresponding migration logic there — there are no migration version files.

### Real-time signal-processing pipeline
The core neurofeedback loop is a **WebSocket** at `/sp/nfcore_start` (`signal_processing/sp_routes.py`), with `/sp/device/status` and `POST /sp/nfcore_stop` alongside. The DSP stages are separate composable modules: `acquisition` → `preprocessing` (referencing, notch/bandpass, real-time filter) → `artifact` (detection) → `features` → `normalization` (baseline + z-score) → `smoothing` (EMA) → `feedback` (feature→feedback mapping). `live_pipeline.py` / `device_acquisition.py` wire these against the device.

### Device modes (`device_handlers/` + `config.json`)
`device_manager.py` reads `device.mode` from `config.json` (`Auto` | `real` | `demo`). `Auto`/`real` try to load the real I8 hardware via `pythonnet` + `I8Library1.dll`; on failure (or `demo`) it falls back to `mock_device.py`, which synthesizes EEG. `config.json` also defines mock channel/sampling params and the collector's channel labels — this is the single source of truth for device behavior. Override sensitive values via env vars; never commit PHI or `app.db`.

### Auth
JWT via `app/core/auth.py`. `SECRET_KEY` comes from `JWT_SECRET_KEY` (defaults to an insecure dev value — must be set in production). `get_current_user` / `get_current_user_optional` are the FastAPI dependencies.

### Protocols
`protocols/*.json` at repo root are the protocol definitions (adhd, anxiety, depression, theta_beta_ratio, etc.); `initialize_protocols.py` loads them into the DB.

## Conventions
- **Python**: 4-space indent, explicit type hints, `snake_case` files; `ruff`/`black`/`isort` clean.
- **Frontend JS**: PascalCase class/feature files, camelCase utilities; imperative DOM + axios, no framework.
- **Commits**: sentence-case present-tense summary, ≤72 chars, one change per commit.
- Keep `app.db`, `.env`, `*.log`, and generated EEG `.csv` out of git.

## Testing
- `test_*.py` files live beside the backend and are discovered by `python -m pytest`; you can also run a single file directly (e.g. `python test_auth.py`). `test_auth.py` and `test_device_acquisition.py` are the templates to clone for new endpoints/processors.
- Name tests after observable behavior (`test_sessions_complete_flow`) and assert both the success JSON payload and the error codes.
- Stash reusable EEG fixtures inside `signal_processing/tests`.

## Pull requests
Describe the motivation, call out backend/frontend touch-points, and explicitly flag any `config.json` or migration (`app/core/migrations.py`) edits. Attach screenshots or CLI output for UI/API changes, link the driving issue, and list the manual verification steps you ran.

## Known structural issues / improvement backlog

These are recorded for context, **not** to fix proactively — leave them alone unless explicitly asked.

Quick wins:
- `pyServer/app/NetrwTreeListing` is an empty stray file (Vim netrw artifact) sitting inside the app package — junk.
- The renderer loads `chart.js`, `axios`, and `lucide` from `cdn.jsdelivr.net` in `index.html`. For a desktop clinical app this means **it won't work offline**; these libs are already in `package.json` and should eventually be vendored locally.
- Backend tests are scattered at `pyServer/` root (`test_auth.py`, `test_device_acquisition.py`, `test_syntax.py`); the `signal_processing/tests/` dir referenced for fixtures **does not exist**. Consolidating into `pyServer/tests/` is desirable.
- Standalone scripts (`create_default_user.py`, `initialize_protocols.py`, `demo_protocol_workflow.py`, `realtime_plotter_mac.py`, `run_migrations.py`) sit beside the `app/` package and blur library-vs-tooling; a `pyServer/scripts/` dir would clarify.

Structural:
- **Unused framework deps:** `package.json` pulls React 19, Mantine, Radix, TanStack Query, and Vite, but the renderer is 100% vanilla DOM JS with no build step. Since electron-builder bundles `node_modules/**/*`, this bloats the installer. Either remove them or actually adopt a framework.
- **WebSocket monolith:** `signal_processing/sp_routes.py` (~917 lines) mixes socket transport, the session/round state machine, DSP orchestration, and DB writes in one handler — extracting a `SessionRunner`/pipeline service would make it testable.
- **Fragmented config:** three sources — `config.json` (+`config_loader.py`), `device_handlers/device_config.ini`, and `signal_processing/config.py`.
- **God-files:** frontend feature panels run 1,000–1,800 lines (`SessionRecordingPanel.js` ~1,776, `TreatmentPlanManager.js` ~1,596, `SessionPlanningPanel.js` ~1,580) and `css/styles.css` is ~7,770 lines — the main maintainability bottleneck.
- **Migrations:** `app/core/migrations.py` (~996 lines) is hand-rolled raw SQL with no versioning, re-inspecting the schema on every startup. Alembic would give ordered, reversible migrations.
