const STORAGE_KEY = "neon-asteroids-best";

export function getHighScore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score) {
  const value = Math.max(0, Math.floor(score));
  try {
    const current = getHighScore();
    if (value > current) {
      localStorage.setItem(STORAGE_KEY, String(value));
      return true;
    }
  } catch {
    /* ignore quota / private mode */
  }
  return false;
}

export function isNewHighScore(score, previousBest = getHighScore()) {
  return Math.floor(score) > previousBest;
}