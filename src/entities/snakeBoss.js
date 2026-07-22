import { clamp, rand, TAU } from "../util.js";
import { Bullet } from "./bullet.js";

function lerpAngleLocal(a, b, t) {
  let delta = ((b - a + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return a + delta * t;
}

export class SnakeBoss {
  constructor({ x, y, level }) {
    this.type = "snake";
    this.pos = { x, y };
    this.level = level;
    this.maxLife = 5;
    this.life = 5;
    this.scoreValue = 6500 + level * 1200;
    this.angle = rand(0, TAU);
    this.speed = clamp(120 + level * 5, 120, 220);
    this.r = 42;
    this.flashTimer = 0;
    this.shieldHitCooldown = 0;
    this.shootTimer = 0.75;
    this.orbBurstTimer = 3.8;
    this.phasePulse = rand(0, TAU);
    this.segments = [];
    this._updateSegments();
  }

  get phase() {
    if (this.life >= 4) return 1;
    if (this.life >= 2) return 2;
    return 3;
  }

  get scale() {
    return 0.48 + (this.life / this.maxLife) * 0.52;
  }

  takeHit() {
    this.life = Math.max(0, this.life - 1);
    this.flashTimer = 0.16;
    this._updateSegments();
  }

  hitTest(x, y, pad = 0) {
    for (const seg of this.segments) {
      const rr = seg.r + pad;
      const dx = x - seg.x;
      const dy = y - seg.y;
      if (dx * dx + dy * dy <= rr * rr) return true;
    }
    return false;
  }

  update(dt, bounds, player, bulletsList) {
    const targetX = player?.pos?.x ?? bounds.w * 0.5;
    const targetY = player?.pos?.y ?? bounds.h * 0.5;
    const desired = Math.atan2(targetY - this.pos.y, targetX - this.pos.x);
    const weave = Math.sin(this.phasePulse * 1.7) * (0.55 + this.phase * 0.08);
    this.angle = lerpAngleLocal(this.angle, desired + weave, clamp(dt * 1.4, 0, 1));

    const side = this.angle + Math.PI / 2;
    const speed = this.speed * (0.75 + this.phase * 0.12);
    this.pos.x += Math.cos(this.angle) * speed * dt + Math.cos(side) * Math.sin(this.phasePulse * 2.2) * 42 * dt;
    this.pos.y += Math.sin(this.angle) * speed * dt + Math.sin(side) * Math.sin(this.phasePulse * 2.2) * 42 * dt;
    this.phasePulse += dt;

    const margin = 80;
    if (this.pos.x < margin || this.pos.x > bounds.w - margin) {
      this.angle = Math.PI - this.angle;
      this.pos.x = clamp(this.pos.x, margin, bounds.w - margin);
    }
    if (this.pos.y < margin || this.pos.y > bounds.h - margin) {
      this.angle = -this.angle;
      this.pos.y = clamp(this.pos.y, margin, bounds.h - margin);
    }

    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.shieldHitCooldown > 0) this.shieldHitCooldown -= dt;
    this._updateSegments();

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = this.phase === 3 ? 0.8 : this.phase === 2 ? 1.05 : 1.25;
      this._fireOrb(player, bulletsList, 0);
      if (this.phase >= 2) this._fireOrb(player, bulletsList, this.phase === 3 ? 0.28 : 0.18);
      if (this.phase === 3) this._fireOrb(player, bulletsList, -0.28);
    }

    this.orbBurstTimer -= dt;
    if (this.orbBurstTimer <= 0) {
      this.orbBurstTimer = this.phase === 3 ? 2.7 : 3.7;
      this._fireOrbRing(bulletsList);
    }
  }

  _updateSegments() {
    const scale = this.scale;
    this.r = 24 + 18 * scale;
    const count = Math.max(3, this.life + 2);
    const spacing = 26 * scale;
    this.segments = [];
    for (let i = 0; i < count; i++) {
      const phase = this.phasePulse - i * 0.55;
      const back = this.angle + Math.PI;
      const side = this.angle + Math.PI / 2;
      const x = this.pos.x + Math.cos(back) * spacing * i + Math.cos(side) * Math.sin(phase) * 13 * scale;
      const y = this.pos.y + Math.sin(back) * spacing * i + Math.sin(side) * Math.sin(phase) * 13 * scale;
      const taper = 1 - i / Math.max(1, count + 1);
      this.segments.push({
        x,
        y,
        r: (12 + 20 * taper) * scale,
        head: i === 0,
      });
    }
  }

  _fireOrb(player, bulletsList, angleOffset) {
    const targetX = player?.pos?.x ?? player?.x ?? this.pos.x;
    const targetY = player?.pos?.y ?? player?.y ?? this.pos.y;
    const base = Math.atan2(targetY - this.pos.y, targetX - this.pos.x) + angleOffset + rand(-0.035, 0.035);
    const speed = 180 + this.phase * 34;
    bulletsList.push(new Bullet({
      x: this.pos.x + Math.cos(base) * this.r,
      y: this.pos.y + Math.sin(base) * this.r,
      vx: Math.cos(base) * speed,
      vy: Math.sin(base) * speed,
      team: "enemy",
      type: "orb",
      r: 10 + this.phase * 1.8,
      destructible: true,
      hp: 1,
    }));
  }

  _fireOrbRing(bulletsList) {
    const count = this.phase === 1 ? 5 : this.phase === 2 ? 7 : 9;
    const speed = 132 + this.phase * 24;
    for (let i = 0; i < count; i++) {
      const a = this.angle + (TAU / count) * i;
      bulletsList.push(new Bullet({
        x: this.pos.x + Math.cos(a) * this.r,
        y: this.pos.y + Math.sin(a) * this.r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        team: "enemy",
        type: "orb",
        r: 9 + this.phase * 1.4,
        destructible: true,
        hp: 1,
      }));
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const flashing = this.flashTimer > 0;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      const alpha = seg.head ? 0.92 : 0.58;
      ctx.shadowColor = flashing ? "rgba(255,255,255,0.98)" : "rgba(80,255,220,0.88)";
      ctx.shadowBlur = seg.head ? 34 : 22;
      ctx.fillStyle = flashing
        ? `rgba(255,255,255,${alpha})`
        : `rgba(20, ${seg.head ? 245 : 180}, ${seg.head ? 220 : 180}, ${alpha * 0.36})`;
      ctx.strokeStyle = flashing ? "rgba(255,255,255,0.98)" : "rgba(120,255,230,0.9)";
      ctx.lineWidth = seg.head ? 3 : 2;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, seg.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (seg.head) {
        ctx.fillStyle = "rgba(245,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(seg.x + Math.cos(this.angle) * seg.r * 0.28, seg.y + Math.sin(this.angle) * seg.r * 0.28, seg.r * 0.24, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    const hpPct = clamp(this.life / this.maxLife, 0, 1);
    const barW = 110;
    const barH = 8;
    const barY = this.pos.y + this.r + 18;
    ctx.fillStyle = "rgba(0, 70, 65, 0.8)";
    ctx.fillRect(this.pos.x - barW / 2, barY, barW, barH);
    ctx.fillStyle = "rgba(120,255,230,0.92)";
    ctx.fillRect(this.pos.x - barW / 2, barY, barW * hpPct, barH);
    ctx.strokeStyle = "rgba(220,255,255,0.7)";
    ctx.strokeRect(this.pos.x - barW / 2, barY, barW, barH);
  }
}
