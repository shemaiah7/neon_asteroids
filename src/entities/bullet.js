import { wrapPosition } from "../util.js";

export class Bullet {
  constructor({ x, y, vx, vy, team = "player", type = "normal", tier = 1, damage = null, r = null, destructible = false, hp = 1 }) {
    this.pos = { x, y };
    this.vel = { x: vx, y: vy };
    this.team = team;
    this.type = type;
    this.tier = Math.max(1, Math.min(3, tier || 1));
    this.damage = damage ?? (type === "pierce" ? this.tier + 1 : 1);
    this.r = r ?? (type === "orb" ? 12 : type === "pierce" ? 4.2 + this.tier * 0.45 : 2.1 + (this.tier - 1) * 0.22);
    this.life = type === "orb" ? 5.2 : type === "pierce" ? 2.7 + this.tier * 0.35 : 1.15;
    this.destructible = destructible || type === "orb";
    this.hp = hp;
    this.trail = [];
    this.trailMax = type === "orb" ? 16 : type === "pierce" ? 22 + this.tier * 4 : 10 + (this.tier - 1) * 2;
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
    const isOrb = this.type === "orb";
    ctx.shadowColor = isEnemy
      ? (isOrb ? "rgba(80, 255, 220, 0.98)" : "rgba(255, 100, 100, 0.95)")
      : (isPierce ? "rgba(255,180,50,0.95)" : "rgba(120,220,255,0.95)");
    ctx.shadowBlur = isOrb ? 34 : isPierce ? 20 + this.tier * 3 : 13 + this.tier * 2;
    ctx.lineWidth = isOrb ? 3 : isPierce ? 3 + this.tier * 0.45 : 1.8 + this.tier * 0.25;
    ctx.strokeStyle = isEnemy
      ? (isOrb ? "rgba(120, 255, 230, 0.92)" : "rgba(255, 150, 150, 0.85)")
      : (isPierce ? "rgba(255,200,100,0.95)" : "rgba(160,240,255,0.85)");
    ctx.beginPath();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(this.pos.x, this.pos.y);
    ctx.stroke();

    if (isOrb) {
      ctx.shadowBlur = 42;
      ctx.fillStyle = "rgba(30,255,220,0.18)";
      ctx.strokeStyle = "rgba(170,255,245,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(245,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

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
