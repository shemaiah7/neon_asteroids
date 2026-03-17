export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(a, b, t) {
  let delta = ((b - a + Math.PI) % (TAU)) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return a + delta * t;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, maxInclusive) {
  return Math.floor(rand(min, maxInclusive + 1));
}

export function randSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

export function hypot(x, y) {
  return Math.hypot(x, y);
}

export function norm(x, y) {
  const l = hypot(x, y);
  if (l <= 0.000001) return { x: 1, y: 0, len: 0 };
  return { x: x / l, y: y / l, len: l };
}

export function wrapPosition(p, w, h, pad = 0) {
  if (p.x < -pad) p.x += w + pad * 2;
  if (p.x > w + pad) p.x -= w + pad * 2;
  if (p.y < -pad) p.y += h + pad * 2;
  if (p.y > h + pad) p.y -= h + pad * 2;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

