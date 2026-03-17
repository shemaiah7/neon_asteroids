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
