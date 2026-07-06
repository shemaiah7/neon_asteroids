import { clamp, rand } from "./util.js";

/** Smooth difficulty curves — tweak here to rebalance the whole game. */

export function isBossLevel(level) {
  return level > 0 && level % 5 === 0;
}

export function asteroidCount(level) {
  if (isBossLevel(level)) return clamp(3 + Math.floor(level / 10), 3, 6);
  // Gentle early game, soft cap so late levels stay playable
  return clamp(Math.round(2.5 + level * 0.75), 3, 13);
}

export function asteroidSpeedRange(level) {
  const eased = 1 - Math.exp(-level / 8);
  const min = 32 + level * 5 + eased * 25;
  const max = 68 + level * 9 + eased * 55;
  return { min: clamp(min, 30, 200), max: clamp(max, 60, 320) };
}

export function explosiveChance(level) {
  if (level < 2) return 0;
  return clamp(0.06 + (level - 2) * 0.022, 0, 0.32);
}

export function splitExplosiveChance(level) {
  if (level < 2) return 0;
  return clamp(0.04 + (level - 2) * 0.015, 0, 0.22);
}

export function maxActiveEnemies(level) {
  if (level < 3) return 0;
  if (level < 6) return 1;
  if (level < 10) return 2;
  if (level < 15) return 3;
  return 4;
}

export function enemySpawnDelay(level) {
  const base = rand(26, 36);
  const speedup = 1 + Math.max(0, level - 3) * 0.1;
  return base / speedup;
}

export function smallEnemyChance(level) {
  if (level < 7) return 0;
  return clamp(0.12 + (level - 7) * 0.08, 0, 0.55);
}

/** Weighted pattern pick — returns pattern id for Enemy constructor. */
export function pickEnemyPattern(level, type) {
  if (type === "small") {
    if (level >= 10 && Math.random() < 0.35) return "stalker";
    if (level >= 6 && Math.random() < 0.4) return "weave";
    return "hunter";
  }
  const roll = Math.random();
  if (level >= 8 && roll < 0.22) return "sniper";
  if (level >= 5 && roll < 0.4) return "weave";
  return "patrol";
}

/** Chance to spawn a coordinated pincer wave (two UFOs at once). */
export function pincerWaveChance(level) {
  if (level < 6) return 0;
  return clamp(0.08 + (level - 6) * 0.02, 0, 0.28);
}

export function bossScale(level) {
  const tier = Math.floor(level / 5);
  return {
    life: 90 + tier * 35 + level * 8,
    speed: clamp(55 + tier * 8, 55, 130),
    scoreValue: 4500 + level * 900,
  };
}

export function comboDecaySeconds(level) {
  return clamp(3.2 + level * 0.05, 3.2, 5.5);
}