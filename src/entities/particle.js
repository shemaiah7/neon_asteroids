import { wrapPosition } from "../util.js";

export class Particle {
  constructor({ x, y, vx, vy, life, size, color }) {
    this.pos = { x, y };
    this.vel = { x: vx, y: vy };
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
  }

  update(dt, bounds) {
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.vel.x *= 1 - 0.6 * dt;
    this.vel.y *= 1 - 0.6 * dt;
    wrapPosition(this.pos, bounds.w, bounds.h, 32);
    this.life -= dt;
  }

  draw(ctx) {
    const t = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18 * t;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.9 * t;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.size * (0.6 + 0.6 * (1 - t)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

