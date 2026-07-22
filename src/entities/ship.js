import { clamp, lerpAngle, norm, TAU, wrapPosition } from "../util.js";

export class Ship {
  constructor({ x, y }) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.angle = -Math.PI / 2;
    this.r = 14;

    this.thrusting = false;
    this.shootCooldown = 0;
    this.invuln = 0;
    this.dead = false;
    this.respawnTimer = 0;
    this.teleportCooldown = 0;
    this.weapon = "normal";
    this.weaponTimer = 0;
    this.weaponLevels = { spread: 0, rapid: 0, pierce: 0 };
    this.shieldEnergy = 1;
    this.shieldActive = false;
    this.shieldCooldown = 0;
  }

  respawn(x, y) {
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = 0;
    this.vel.y = 0;
    this.dead = false;
    this.invuln = 2.1;
    this.respawnTimer = 0;
    this.shootCooldown = 0.15;
    this.teleportCooldown = 0;
    this.weapon = "normal";
    this.weaponTimer = 0;
    this.weaponLevels = { spread: 0, rapid: 0, pierce: 0 };
    this.shieldEnergy = 1;
    this.shieldActive = false;
    this.shieldCooldown = 0.15;
  }

  teleport(x, y) {
    if (this.dead || this.teleportCooldown > 0) return false;
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = 0;
    this.vel.y = 0;
    this.invuln = 1.0;
    this.teleportCooldown = 3.0;
    return true;
  }

  kill() {
    this.dead = true;
    this.respawnTimer = 1.15;
    this.shieldActive = false;
  }

  setShieldHeld(held, dt) {
    if (this.dead || this.shieldCooldown > 0 || this.shieldEnergy <= 0) {
      this.shieldActive = false;
      return false;
    }

    this.shieldActive = !!held;
    if (this.shieldActive) {
      this.shieldEnergy = Math.max(0, this.shieldEnergy - dt * 0.32);
      if (this.shieldEnergy <= 0) {
        this.shieldActive = false;
        this.shieldCooldown = 1.15;
      }
    }
    return this.shieldActive;
  }

  setFacingAngle(targetAngle, dt) {
    const t = clamp(1 - Math.exp(-18 * dt), 0, 1);
    this.angle = lerpAngle(this.angle, targetAngle, t);
    this.angle = ((this.angle % TAU) + TAU) % TAU;
  }

  rotateManual(dir, dt) {
    const speed = 3.8;
    this.angle = (this.angle + dir * speed * dt + TAU) % TAU;
  }

  update(dt, bounds, { thrustAmount, thrustPower, maxSpeed }) {
    if (this.dead) {
      this.respawnTimer -= dt;
      this.shieldActive = false;
      return;
    }

    const t = clamp(thrustAmount ?? 0, 0, 1);
    this.thrusting = t > 0.001;
    if (this.thrusting) {
      const ax = Math.cos(this.angle) * thrustPower * t;
      const ay = Math.sin(this.angle) * thrustPower * t;
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
    }

    const damping = 0.10;
    this.vel.x += -this.vel.x * damping * dt;
    this.vel.y += -this.vel.y * damping * dt;

    const sp = norm(this.vel.x, this.vel.y);
    if (sp.len > maxSpeed) {
      this.vel.x = sp.x * maxSpeed;
      this.vel.y = sp.y * maxSpeed;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    wrapPosition(this.pos, bounds.w, bounds.h, this.r + 18);

    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    if (!this.shieldActive && this.shieldCooldown <= 0) {
      this.shieldEnergy = Math.min(1, this.shieldEnergy + dt * 0.18);
    }
  }

  draw(ctx) {
    if (this.dead) return;

    const invulnAlpha = this.invuln > 0 ? 0.55 : 1;

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = invulnAlpha;

    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "rgba(80,200,255,0.8)";
    ctx.shadowBlur = 22;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(170,245,255,0.9)";
    ctx.fillStyle = "rgba(10,30,60,0.22)";

    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (this.thrusting) {
      ctx.shadowColor = "rgba(210,120,255,0.95)";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(210,120,255,0.55)";
      ctx.strokeStyle = "rgba(255,200,255,0.75)";
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-18 - Math.random() * 10, -6);
      ctx.lineTo(-14 - Math.random() * 10, 0);
      ctx.lineTo(-18 - Math.random() * 10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // Draw pulsating shield when actively raised or shield pickup is running.
    if (this.invuln > 1.0 || this.shieldActive) {
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      ctx.globalCompositeOperation = "lighter";

      const t = performance.now() / 1000;
      const pulse = 0.6 + Math.sin(t * 8) * 0.4;
      const activePulse = this.shieldActive ? 7 : 3;
      const shieldR = this.r + 12 + Math.sin(t * 6) * activePulse;
      const shieldHue = this.shieldActive
        ? { glow: "rgba(80, 220, 255,", stroke: "rgba(140, 245, 255,", fill: "rgba(80, 220, 255," }
        : { glow: "rgba(255, 220, 0,", stroke: "rgba(255, 230, 50,", fill: "rgba(255, 220, 0," };

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
      ctx.shadowColor = `${shieldHue.glow} ${pulse * 0.9})`;
      ctx.shadowBlur = this.shieldActive ? 38 + pulse * 22 : 25 + pulse * 15;
      ctx.strokeStyle = `${shieldHue.stroke} ${pulse * 0.86})`;
      ctx.lineWidth = this.shieldActive ? 3.4 : 2.5;
      ctx.stroke();

      // Inner glow ring
      ctx.beginPath();
      ctx.arc(0, 0, shieldR - 3, 0, Math.PI * 2);
      ctx.shadowColor = `${shieldHue.glow} ${pulse * 0.62})`;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `${shieldHue.stroke} ${pulse * 0.54})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill glow
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
      ctx.fillStyle = `${shieldHue.fill} ${pulse * (this.shieldActive ? 0.14 : 0.08)})`;
      ctx.fill();

      ctx.restore();
    }
  }
}
