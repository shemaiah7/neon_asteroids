import { wrapPosition } from "../util.js";

export class Bullet {
  constructor({ x, y, vx, vy, team = "player", type = "normal" }) {
    this.pos = { x, y };
    this.vel = { x: vx, y: vy };
    this.team = team;
    this.type = type;
    this.r = type === "pierce" ? 4.5 : 2.2;
    this.life = type === "pierce" ? 3.0 : 1.15;
    this.trail = [];
    this.trailMax = type === "pierce" ? 25 : 10;
  }

  update(dt, bounds) {
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > this.trailMax) this.trail.shift();
    const prevX = this.pos.x;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    wrapPosition(this.pos, bounds.w, bounds.h, 18);
    const wrappedFar = Math.abs(prevX - this.pos.x) > bounds.w * 0.45 || Math.abs(prevY - this.pos.y) > bounds.h * 0.45;
    if (wrappedFar) this.trail.length = 0;
    this.life -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const isEnemy = this.team === "enemy";
    const isPierce = this.type === "pierce";
    ctx.shadowColor = isEnemy
      ? "rgba(255, 100, 100, 0.95)"
      : (isPierce ? "rgba(255,180,50,0.95)" : "rgba(120,220,255,0.95)");
    ctx.shadowBlur = isPierce ? 22 : 14;
    ctx.lineWidth = isPierce ? 3.5 : 2;
    ctx.strokeStyle = isEnemy
      ? "rgba(255, 150, 150, 0.85)"
      : (isPierce ? "rgba(255,200,100,0.95)" : "rgba(160,240,255,0.85)");
    ctx.beginPath();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(this.pos.x, this.pos.y);
    ctx.stroke();

    ctx.shadowBlur = isPierce ? 28 : 18;
    ctx.fillStyle = isEnemy
      ? "rgba(255,200,200,0.95)"
      : (isPierce ? "rgba(255,230,200,0.95)" : "rgba(220,250,255,0.95)");
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
