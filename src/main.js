import { Game } from "./game.js";
import { World3D } from "./renderer/world3d.js";

const canvas = document.querySelector("#game");
const bgCanvas = document.querySelector("#bg-webgl");
const overlay = document.querySelector("#overlay");
const pause = document.querySelector("#pause");
const gameover = document.querySelector("#gameover");
const startBtn = document.querySelector("#start-btn");
const resumeBtn = document.querySelector("#resume-btn");
const restartBtn = document.querySelector("#restart-btn");
const restartBtn2 = document.querySelector("#restart-btn-2");

const ui = {
  score: document.querySelector("#score"),
  combo: document.querySelector("#combo"),
  highScore: document.querySelector("#high-score"),
  menuHighScore: document.querySelector("#menu-high-score"),
  gameoverBest: document.querySelector("#gameover-best"),
  newRecord: document.querySelector("#new-record"),
  hudBest: document.querySelector("#hud-best"),
  level: document.querySelector("#level"),
  lives: document.querySelector("#lives"),
  bombs: document.querySelector("#bombs"),
  scheme: document.querySelector("#scheme"),
  padHint: document.querySelector("#pad-hint"),
  mapping: document.querySelector("#mapping"),
  finalScore: document.querySelector("#final-score"),
};

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", hidden);
  el.setAttribute("aria-hidden", hidden ? "true" : "false");
}

const _isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

function resizeCanvas() {
  const dpr = _isTouchDevice ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  canvas.width = w;
  canvas.height = h;
  if (bgCanvas) {
    bgCanvas.width = w;
    bgCanvas.height = h;
  }
  game.resize(w, h);
}

const world3d = bgCanvas
  ? new World3D({ canvas: bgCanvas, lowQuality: _isTouchDevice })
  : null;

const game = new Game({
  canvas,
  ui,
  webglBackground: !!world3d?.enabled,
});
if (world3d?.enabled) game.attachBackground3d(world3d);

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
game._syncHud();

function syncOverlays() {
  if (game.mode === "menu") setHidden(overlay, false);
  else setHidden(overlay, true);

  if (game.mode === "paused") setHidden(pause, false);
  else setHidden(pause, true);

  if (game.mode === "gameover") {
    ui.finalScore.textContent = String(game.score);
    setHidden(gameover, false);
  } else setHidden(gameover, true);

  const hud = document.querySelector("#hud");
  setHidden(hud, game.mode === "menu");
}

startBtn.addEventListener("click", () => {
  setHidden(overlay, true);
  game.start();
  syncOverlays();
});

// iOS requires AudioContext unlock from a direct touch gesture
startBtn.addEventListener("touchend", () => {
  game.audio.ensure();
});

// Fallback: unlock audio on first touch anywhere
{
  const unlockAudio = () => {
    game.audio.ensure();
    document.removeEventListener("touchstart", unlockAudio);
    document.removeEventListener("touchend", unlockAudio);
  };
  document.addEventListener("touchstart", unlockAudio, { passive: true });
  document.addEventListener("touchend", unlockAudio, { passive: true });
}

resumeBtn.addEventListener("click", () => {
  if (game.mode === "paused") game.togglePause();
  syncOverlays();
});

function doRestart() {
  game.reset();
  syncOverlays();
}
restartBtn.addEventListener("click", doRestart);
restartBtn2.addEventListener("click", doRestart);

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => { });
  else document.exitFullscreen?.().catch(() => { });
}

// iOS fullscreen prompt (shown on touch devices not already in standalone PWA mode)
{
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const dismissed = localStorage.getItem("fs-prompt-dismissed");
  const fsPrompt = document.getElementById("fs-prompt");
  const fsDismiss = document.getElementById("fs-prompt-dismiss");

  if (isTouchDevice && !isStandalone && !dismissed && fsPrompt) {
    setHidden(fsPrompt, false);
    fsDismiss?.addEventListener("click", () => {
      setHidden(fsPrompt, true);
      localStorage.setItem("fs-prompt-dismissed", "1");
    });
  }
}

let pauseLatch = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyF") toggleFullscreen();
  if (e.code === "KeyP" || e.code === "Escape") {
    if (game.mode === "playing" || game.mode === "paused") {
      if (!pauseLatch) {
        game.togglePause();
        syncOverlays();
        pauseLatch = true;
      }
    }
  }

  if (e.code === "BracketLeft" || e.code === "BracketRight") {
    const delta = e.code === "BracketLeft" ? -0.01 : 0.01;
    game.input.deadzone = Math.max(0.05, Math.min(0.35, game.input.deadzone + delta));
    ui.mapping.textContent = game.input.getMappingText();
    ui.scheme.textContent = game.input.scheme;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") pauseLatch = false;
});

function raf(now) {
  game.tick(now);
  syncOverlays();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

window.render_game_to_text = () => game.getTextState();
window.advanceTime = (ms) => game.advanceTime(ms);
window.apply_smoke_fixture = (name) => game.applySmokeFixture(name);
window.sync_smoke_overlays = () => syncOverlays();
