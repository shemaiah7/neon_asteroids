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

Updates (2026-07-16)
- Investigating user report: rock explosions looked like they had no effect and WebGL visuals did not read as 3D.
- Added explicit short-lived explosion effect state in `Game` so WebGL can render rings/flashes separate from tiny particles.
- Upgraded asteroid WebGL meshes from flat shapes to shallow extruded, lit rocks with front/back outlines and edge ribs.
- Upgraded WebGL particles into brighter streaking debris.
- Forced a render after smoke fixtures are applied so diagnostic screenshots do not catch a stale/blank WebGL frame.
- Extended the explosive/pierce smoke harness with a `phase1-blast` screenshot/state assertion while explosion effects are active.
- Validation passed:
  - `npm run smoke:explosive-pierce-restart`
  - required web-game client against `http://127.0.0.1:5173`
  - desktop screenshots inspected: `phase1-setup`, `phase1-blast`, `phase1-resolved`, `output/web-game/shot-2`
  - mobile screenshot inspected at 390x844 CSS px; saved PNG pixel check was nonblank with visible bright content

Updates (2026-07-16, follow-up)
- Investigating user report: level-3 enemy health bar did not work, and ship/UFOs/boss did not read as 3D.
- Added `maxLife` + `flashTimer` to regular UFO enemies; big UFOs now have 4 HP at level 3 and visible health bars.
- Tuned bullet damage so boss health moves by visible chunks instead of one point per shot.
- Added hit sparks for non-fatal enemy/boss hits without triggering full explosion rings.
- Upgraded WebGL ship, regular UFOs, and boss visuals with beveled/extruded/lit bodies, glows, and clearer health bars.
- Extended text-state output with enemy and boss health for regression checks.
- Added smoke fixtures:
  - `smoke_enemy_health_lane`
  - `smoke_boss_health_lane`
- Validation passed:
  - focused Playwright health check: UFO 4 -> 3 HP, boss 165 -> 156 HP
  - required web-game client against `http://127.0.0.1:5173`
  - `npm run smoke:explosive-pierce-restart`
  - screenshots inspected: `output/web-game-enemy-health/enemy-after.png`, `boss-before.png`, `boss-after.png`, and `output/web-game/shot-2.png`

Updates (2026-07-18)
- Added weapon upgrade rubric:
  - weapon pickups now increase per-weapon tiers up to III
  - same-weapon pickups extend active time up to 36s
  - active HUD shows weapon mode, tier, and remaining seconds
- Added tiered shooting rules:
  - Spread I/II/III fires 3/5/7-shot fans
  - Rapid I/II/III fires 1/2/3 fast barrels
  - Pierce I/II/III fires 1/2/3 pierce lances with tiered damage
- Added bullet tier/damage fields and exposed weapon tiers/timers in `render_game_to_text()`.
- Added smoke fixtures for weapon verification:
  - `smoke_weapon_spread_upgrade_lane`
  - `smoke_weapon_rapid_upgrade_lane`
  - `smoke_weapon_pierce_upgrade_lane`
- Validation passed:
  - focused Playwright weapon check: Spread III = 7 bullets, Rapid III = 3 bullets, Pierce III = 3 pierce bullets
  - `npm run smoke:explosive-pierce-restart`
  - required web-game client against `http://127.0.0.1:5173`
  - screenshots inspected: `output/web-game-weapon-upgrades/spread-fired.png`, `pierce-fired.png`, and `output/web-game/shot-2.png`

Updates (2026-07-18, bomb pickup fix)
- Investigated user report: reached level 10 with no bombs.
- Root cause: bomb pickups could spawn in game logic, but powerups were not passed into the WebGL render state or synced by `World3D`, so bombs and other pickups were invisible in 3D mode.
- Fixed powerup lifecycle and visibility:
  - powerups now update/expire every frame
  - WebGL now has a powerup mesh pool with glowing 3D pickups and labels
  - 2D fallback rendering draws powerups again
  - reset clears stale powerups
  - text state now includes `bombs`
- Made bombs less RNG-dependent:
  - guaranteed bomb cache appears on levels 3/6/9/etc. when the player has no bombs and no bomb pickup is already active
  - enemy drops bias toward bombs when the player is empty
- Added smoke fixture:
  - `smoke_bomb_cache_lane`
- Validation passed:
  - `npm run smoke:explosive-pierce-restart`
  - focused bomb-cache Playwright check against `http://127.0.0.1:5174`
  - required web-game client against `http://127.0.0.1:5174`
  - screenshots inspected: `output/web-game-bomb-cache/bomb-cache.png` and `output/web-game/shot-2.png`

Updates (2026-07-18, bomb/shield/snake boss pass)
- Added active ship shielding:
  - hold `E` on keyboard or `LB` on gamepad
  - shield drains/recharges via `ship.shieldEnergy`
  - shield blocks collisions and clears enemy orb shots
  - HUD now shows shield percent/ACTIVE
- Made bombs dramatic:
  - full-screen white flash overlay
  - stronger screen shake
  - larger center explosion and more debris
  - fixed enemy projectile clearing to use `team === "enemy"` instead of stale `foe`
- Added snake boss:
  - spawns on level 10/20/etc.
  - five discrete hits to kill
  - body shrinks/loses segments every hit
  - fires glowing circular `orb` projectiles
  - orb projectiles are destructible by player shots
  - added WebGL segmented snake mesh and 2D fallback draw
- Added smoke fixtures:
  - `smoke_bomb_dramatic_lane`
  - `smoke_shield_orb_lane`
  - `smoke_snake_orb_lane`
  - `smoke_snake_boss_lane`
- Validation passed:
  - focused Playwright check: bomb flash/shockwave, shield block, orb destroy, snake life 5 -> 0 over five hits
  - `npm run smoke:explosive-pierce-restart`
  - required web-game client against `http://127.0.0.1:5173`
  - screenshots inspected: `output/web-game-bomb-shield-snake/bomb-after.png`, `shield-after.png`, `snake-before.png`, `orb-destroyed.png`, `snake-after-hits.png`
