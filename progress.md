Original prompt: Create a classic arcade-style asteroid game with modern mouse controls in HTML5 Canvas and JavaScript, including mouse aim, shooting, thrust, inertia, asteroid splitting, screen wrapping, neon vector visuals, particles, score/lives/levels, pause, game over, and optional gamepad + keyboard fallback controls with automatic control-scheme switching and UI indicator.

Notes
- Use single-canvas layout with `window.render_game_to_text()` + `window.advanceTime(ms)` for automated Playwright testing.
- Controls implemented: mouse+keyboard default, gamepad auto-detect, keyboard-only fallback.
 - Playwright artifacts: `output/web-game-mouse-basic/` and `output/web-game-mouse-quick/`.
 - Fixed: bullet trails no longer draw a full-screen line when wrapping; ship no longer blinks invisible during invulnerability (uses reduced alpha instead).

TODO
- Fine-tune difficulty curve and scoring.
- Add/adjust sound effects (optional).
- Add additional Playwright action scenarios (pause, restart, collisions).

Updates (2026-06-15)
- Added deterministic smoke harness: `scripts/playwright_smoke_explosive_pierce_restart.mjs`.
- Added action fixture: `playwright_actions/smoke_explosive_pierce_restart.json`.
- Added smoke hooks in runtime:
  - `window.apply_smoke_fixture(name)`
  - `window.sync_smoke_overlays()`
  - Existing hooks retained: `window.render_game_to_text()`, `window.advanceTime(ms)`.
- Extended text-state payload for regression assertions:
  - ship weapon
  - asteroid type
  - bullet type/team
  - combo
- Implemented gameplay support needed for smoke coverage:
  - explosive asteroid type (spawn + split chance + blast chain)
  - pierce bullet type (powerup + shot behavior through targets)
  - visual distinctions for explosive asteroids and pierce bullets
  - initialized `ship.weapon` / `ship.weaponTimer` defaults.
- Added npm script:
  - `npm run smoke:explosive-pierce-restart`
- Added Cloudflare deploy helper:
  - `scripts/deploy_cloudflare_pages.sh`
  - `npm run cf:login`
  - `npm run deploy:cloudflare`
- Validation run passed:
  - output in `output/web-game-smoke-explosive-pierce-restart/`
  - result file: `result.json`
