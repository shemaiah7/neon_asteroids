import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BUTTON_TO_KEY = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  space: "Space",
  enter: "Enter",
  a: "KeyA",
  b: "KeyB",
};

function parseArgs(argv) {
  const args = {
    url: null,
    actionsFile: "playwright_actions/smoke_explosive_pierce_restart.json",
    screenshotDir: "output/web-game-smoke-explosive-pierce-restart",
    headless: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--url" && next) {
      args.url = next;
      i++;
    } else if (arg === "--actions-file" && next) {
      args.actionsFile = next;
      i++;
    } else if (arg === "--screenshot-dir" && next) {
      args.screenshotDir = next;
      i++;
    } else if (arg === "--headless" && next) {
      args.headless = next !== "0" && next !== "false";
      i++;
    }
  }
  if (!args.url) throw new Error("--url is required");
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadActions(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

async function getCanvasBox(page) {
  const canvas = page.locator("#game");
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  assert.ok(box, "Canvas #game was not found");
  return box;
}

async function advanceFrames(page, frames) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(async () => {
      if (typeof window.advanceTime !== "function") {
        throw new Error("window.advanceTime() hook is missing");
      }
      await window.advanceTime(1000 / 60);
    });
  }
}

function computeMousePoint(step, box) {
  const x = typeof step.mouse_x === "number"
    ? step.mouse_x
    : typeof step.mouse_x_ratio === "number"
      ? box.width * step.mouse_x_ratio
      : box.width * 0.5;
  const y = typeof step.mouse_y === "number"
    ? step.mouse_y
    : typeof step.mouse_y_ratio === "number"
      ? box.height * step.mouse_y_ratio
      : box.height * 0.5;
  return { x: box.x + x, y: box.y + y };
}

async function runStep(page, box, step) {
  const buttons = new Set(step.buttons || []);
  const hasMouseButton = buttons.has("left_mouse_button") || buttons.has("right_mouse_button");
  if (hasMouseButton) {
    const point = computeMousePoint(step, box);
    await page.mouse.move(point.x, point.y);
  }

  for (const button of buttons) {
    if (button === "left_mouse_button" || button === "right_mouse_button") {
      await page.mouse.down({ button: button === "left_mouse_button" ? "left" : "right" });
    } else if (BUTTON_TO_KEY[button]) {
      await page.keyboard.down(BUTTON_TO_KEY[button]);
    }
  }

  await advanceFrames(page, Math.max(1, step.frames || 1));

  for (const button of buttons) {
    if (button === "left_mouse_button" || button === "right_mouse_button") {
      await page.mouse.up({ button: button === "left_mouse_button" ? "left" : "right" });
    } else if (BUTTON_TO_KEY[button]) {
      await page.keyboard.up(BUTTON_TO_KEY[button]);
    }
  }
}

async function runSequence(page, box, steps) {
  for (const step of steps) {
    await runStep(page, box, step);
  }
}

async function readState(page, label, outputDir) {
  const raw = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== "function") {
      throw new Error("window.render_game_to_text() hook is missing");
    }
    return window.render_game_to_text();
  });
  assert.ok(raw, "render_game_to_text returned empty output");
  const parsed = JSON.parse(raw);
  fs.writeFileSync(path.join(outputDir, `${label}.json`), JSON.stringify(parsed, null, 2));
  return parsed;
}

async function capture(page, label, outputDir) {
  await page.screenshot({
    path: path.join(outputDir, `${label}.png`),
    fullPage: false,
  });
}

async function applyFixture(page, fixtureName) {
  const ok = await page.evaluate((name) => {
    if (typeof window.apply_smoke_fixture !== "function") {
      throw new Error("window.apply_smoke_fixture() hook is missing");
    }
    return window.apply_smoke_fixture(name);
  }, fixtureName);
  assert.equal(ok, true, `Fixture "${fixtureName}" was not applied`);
}

async function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.screenshotDir);
  const actions = loadActions(args.actionsFile);
  const errors = [];

  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    // Keep gameplay deterministic in automation by disabling the real-time RAF loop.
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push({ type: "console.error", text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    errors.push({ type: "pageerror", text: String(err) });
  });

  try {
    await page.goto(args.url, { waitUntil: "domcontentloaded" });
    await page.click("#start-btn");
    await advanceFrames(page, 2);
    const box = await getCanvasBox(page);

    await applyFixture(page, "smoke_explosive_pierce_lane");
    const setupState = await readState(page, "phase1-setup", args.screenshotDir);
    await capture(page, "phase1-setup", args.screenshotDir);
    assert.equal(setupState.ship.weapon, "pierce", "Setup should force pierce weapon");
    assert.equal(setupState.score, 0, "Setup score should start at zero");
    assert.ok(
      setupState.asteroids.some((a) => a.type === "explosive"),
      "Setup should include an explosive asteroid"
    );

    assert.ok(Array.isArray(actions.pierce_sequence), "Actions file is missing pierce_sequence");
    await runStep(page, box, actions.pierce_sequence[0]);
    const firedState = await readState(page, "phase1-fired", args.screenshotDir);
    assert.ok(
      firedState.bullets.some((b) => b.type === "pierce"),
      "Pierce bullet should exist immediately after firing"
    );

    const resolveStep = actions.pierce_sequence[1];
    assert.ok(resolveStep, "Actions file is missing explosive resolution step");
    const blastFrames = Math.min(22, Math.max(1, Math.floor((resolveStep.frames || 1) * 0.36)));
    await runStep(page, box, { ...resolveStep, frames: blastFrames });
    const blastState = await readState(page, "phase1-blast", args.screenshotDir);
    await capture(page, "phase1-blast", args.screenshotDir);
    assert.ok(
      (blastState.effects?.explosions ?? 0) > 0 || (blastState.effects?.particles ?? 0) > 0,
      "Explosion visual effects should be active shortly after detonation",
    );

    const remainingResolveFrames = Math.max(0, (resolveStep.frames || 1) - blastFrames);
    if (remainingResolveFrames > 0) {
      await runStep(page, box, { ...resolveStep, frames: remainingResolveFrames });
    }
    const resolvedState = await readState(page, "phase1-resolved", args.screenshotDir);
    await capture(page, "phase1-resolved", args.screenshotDir);

    assert.equal(resolvedState.mode, "playing", "Game should still be playing after explosive chain");
    assert.equal(resolvedState.score, 600, "Explosive + pierce chain score should be 600");
    assert.equal(resolvedState.lives, 3, "Ship should not lose lives during controlled chain");
    assert.equal(resolvedState.asteroids.length, 1, "Exactly one asteroid should remain after chain");

    await applyFixture(page, "smoke_collision_gameover");
    const collisionSetup = await readState(page, "phase2-setup", args.screenshotDir);
    assert.equal(collisionSetup.lives, 1, "Collision setup should start with one life");

    assert.ok(Array.isArray(actions.collision_sequence), "Actions file is missing collision_sequence");
    await runSequence(page, box, actions.collision_sequence);
    const afterHit = await readState(page, "phase2-after-hit", args.screenshotDir);
    assert.equal(afterHit.lives, 0, "Ship collision should drop lives to zero");
    assert.equal(afterHit.ship.dead, true, "Ship should be dead immediately after collision");

    await advanceFrames(page, Math.max(1, actions.gameover_wait_frames || 90));
    const gameOverState = await readState(page, "phase2-gameover", args.screenshotDir);
    await capture(page, "phase2-gameover", args.screenshotDir);
    assert.equal(gameOverState.mode, "gameover", "Mode should transition to gameover after death timer");

    const restartSelector = actions.restart_selector || "#restart-btn-2";
    await page.evaluate(() => {
      if (typeof window.sync_smoke_overlays === "function") {
        window.sync_smoke_overlays();
      }
    });
    await page.click(restartSelector);
    await advanceFrames(page, Math.max(1, actions.post_restart_frames || 2));
    const restartedState = await readState(page, "phase2-restarted", args.screenshotDir);
    await capture(page, "phase2-restarted", args.screenshotDir);

    assert.equal(restartedState.mode, "playing", "Restart should return game to playing mode");
    assert.equal(restartedState.score, 0, "Restart should reset score");
    assert.equal(restartedState.lives, 3, "Restart should reset lives");
    assert.equal(restartedState.level, 1, "Restart should reset level");
    assert.ok(restartedState.asteroids.length > 0, "Restart should spawn level asteroids");

    if (errors.length) {
      fs.writeFileSync(
        path.join(args.screenshotDir, "errors.json"),
        JSON.stringify(errors, null, 2)
      );
      throw new Error(`Smoke scenario saw ${errors.length} runtime error(s); see errors.json`);
    }

    const result = {
      ok: true,
      summary: "Explosive asteroid, pierce shot, collision/gameover, and restart checks passed.",
      outputDir: args.screenshotDir,
    };
    fs.writeFileSync(path.join(args.screenshotDir, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
