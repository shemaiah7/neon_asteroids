import { rand, randInt, randSign, TAU, wrapPosition } from "../util.js";

export function radiusForSize(size) {
  if (size === 3) return 70;
  if (size === 2) return 42;
  return 22;
}

export class Asteroid {
  constructor({ x, y, vx, vy, size = 3, level = 1 }) {
    this.pos = { x, y };
    this.vel = { x: vx, y: vy };
    this.size = size;
    this.r = radiusForSize(size);
    this.rot = rand(0, TAU);
    this.rotSpeed = rand(0.35, 1.2) * randSign() * (0.7 + level * 0.06);
    this.points = this._makePolygon();
  }

  _makePolygon() {
    const base = this.size === 3 ? randInt(10, 14) : this.size === 2 ? randInt(9, 12) : randInt(8, 10);
    const pts = [];
    for (let i = 0; i < base; i++) {
      const a = (i / base) * TAU;
      const jitter = rand(0.62, 1.05);
      pts.push({ a, m: jitter });
    }
    return pts;
  }

  update(dt, bounds) {
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.rot += this.rotSpeed * dt;
    wrapPosition(this.pos, bounds.w, bounds.h, this.r + 30);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rot);

    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "rgba(170,210,255,0.35)";
    ctx.shadowBlur = 22;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(150,210,255,0.55)";
    ctx.fillStyle = "rgba(20,40,80,0.14)";

    ctx.beginPath();
    for (let i = 0; i < this.points.length; i++) {
      const { a, m } = this.points[i];
      const rr = this.r * m;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

