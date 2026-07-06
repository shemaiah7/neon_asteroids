import { clamp, rand, randSign, TAU } from "../util.js";
import { Bullet } from "./bullet.js";
import { bossScale } from "../difficulty.js";

export class Boss {
    constructor({ x, y, level }) {
        this.pos = { x, y };
        this.r = 55;
        const scale = bossScale(level);
        this.scoreValue = scale.scoreValue;
        this.life = scale.life;
        this.maxLife = this.life;
        this.level = level;

        const speed = scale.speed;
        this.vel = { x: randSign() * rand(speed * 0.7, speed), y: randSign() * rand(speed * 0.7, speed) };

        this.shootTimer = 1.4;
        this.burstTimer = 4.5;
        this.burstCount = 0;
        this.microTimer = 0;
        this.ringTimer = 6;
        this.phasePulse = 0;

        this.angle = 0;
        this.flashTimer = 0;
    }

    get phase() {
        const hp = this.life / this.maxLife;
        if (hp > 0.66) return 1;
        if (hp > 0.33) return 2;
        return 3;
    }

    _phaseConfig() {
        if (this.phase === 1) {
            return { spreadInterval: 2.0, spreadShots: 6, burstInterval: 5.0, burstShots: 4, ringInterval: 8, moveMul: 1 };
        }
        if (this.phase === 2) {
            return { spreadInterval: 1.3, spreadShots: 8, burstInterval: 3.2, burstShots: 6, ringInterval: 5.5, moveMul: 1.2 };
        }
        return { spreadInterval: 0.85, spreadShots: 12, burstInterval: 2.2, burstShots: 8, ringInterval: 3.8, moveMul: 1.45 };
    }

    update(dt, bounds, player, bulletsList) {
        const cfg = this._phaseConfig();
        this.pos.x += this.vel.x * dt * cfg.moveMul;
        this.pos.y += this.vel.y * dt * cfg.moveMul;
        this.angle += dt * (0.4 + this.phase * 0.15);

        if (this.pos.x < this.r) {
            this.pos.x = this.r;
            this.vel.x *= -1;
        } else if (this.pos.x > bounds.w - this.r) {
            this.pos.x = bounds.w - this.r;
            this.vel.x *= -1;
        }

        if (this.pos.y < this.r) {
            this.pos.y = this.r;
            this.vel.y *= -1;
        } else if (this.pos.y > bounds.h - this.r) {
            this.pos.y = bounds.h - this.r;
            this.vel.y *= -1;
        }

        if (this.flashTimer > 0) this.flashTimer -= dt;

        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this.shootTimer = cfg.spreadInterval;
            this._fireSpread(bulletsList, cfg.spreadShots);
        }

        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
            this.burstCount = cfg.burstShots;
            this.burstTimer = cfg.burstInterval;
        }

        if (this.burstCount > 0) {
            this.microTimer -= dt;
            if (this.microTimer <= 0) {
                this._fireTargeted(player, bulletsList);
                this.burstCount--;
                this.microTimer = this.phase === 3 ? 0.1 : 0.15;
            }
        }

        this.ringTimer -= dt;
        if (this.ringTimer <= 0 && this.phase >= 2) {
            this.ringTimer = cfg.ringInterval;
            this._fireRing(bulletsList);
        }

        if (this.phase === 3) {
            this.phasePulse += dt;
            if (this.phasePulse > 1.8) {
                this.phasePulse = 0;
                this._fireCross(player, bulletsList);
            }
        }
    }

    _fireSpread(bulletsList, numShots) {
        const bulletSpeed = 220 + this.phase * 35;
        for (let i = 0; i < numShots; i++) {
            const angle = (TAU / numShots) * i + this.angle;
            bulletsList.push(new Bullet({
                x: this.pos.x + Math.cos(angle) * this.r,
                y: this.pos.y + Math.sin(angle) * this.r,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                team: "enemy"
            }));
        }
    }

    _fireRing(bulletsList) {
        const bulletSpeed = 180 + this.phase * 25;
        const numShots = 16;
        for (let i = 0; i < numShots; i++) {
            const angle = (TAU / numShots) * i;
            bulletsList.push(new Bullet({
                x: this.pos.x + Math.cos(angle) * this.r,
                y: this.pos.y + Math.sin(angle) * this.r,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                team: "enemy"
            }));
        }
    }

    _fireCross(player, bulletsList) {
        let targetX = player.pos ? player.pos.x : player.x;
        let targetY = player.pos ? player.pos.y : player.y;
        const base = Math.atan2(targetY - this.pos.y, targetX - this.pos.x);
        const offsets = [-0.35, 0, 0.35];
        for (const off of offsets) {
            const angle = base + off;
            bulletsList.push(new Bullet({
                x: this.pos.x + Math.cos(angle) * this.r,
                y: this.pos.y + Math.sin(angle) * this.r,
                vx: Math.cos(angle) * 440,
                vy: Math.sin(angle) * 440,
                team: "enemy"
            }));
        }
    }

    _fireTargeted(player, bulletsList) {
        const bulletSpeed = 360 + this.phase * 40;
        let targetX = player.pos ? player.pos.x : player.x;
        let targetY = player.pos ? player.pos.y : player.y;

        const dx = targetX - this.pos.x;
        const dy = targetY - this.pos.y;
        let angle = Math.atan2(dy, dx);
        angle += rand(-0.05, 0.05);

        bulletsList.push(new Bullet({
            x: this.pos.x + Math.cos(angle) * this.r,
            y: this.pos.y + Math.sin(angle) * this.r,
            vx: Math.cos(angle) * bulletSpeed,
            vy: Math.sin(angle) * bulletSpeed,
            team: "enemy"
        }));
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.angle);

        ctx.shadowBlur = 20;
        const isFlashing = this.flashTimer > 0;
        const phaseColor = this.phase === 3 ? "#ff1144" : this.phase === 2 ? "#ff55aa" : "#ff3399";

        ctx.shadowColor = isFlashing ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 50, 150, 0.8)";
        ctx.fillStyle = isFlashing ? "rgba(255, 255, 255, 0.8)" : "rgba(30, 0, 20, 0.8)";
        ctx.strokeStyle = isFlashing ? "#ffffff" : phaseColor;
        ctx.lineWidth = 3;

        ctx.beginPath();
        const sides = 8;
        for (let i = 0; i < sides; i++) {
            const angle = (TAU / sides) * i;
            const x = Math.cos(angle) * this.r;
            const y = Math.sin(angle) * this.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (TAU / sides) * i + (TAU / 16);
            const x = Math.cos(angle) * this.r * 0.5;
            const y = Math.sin(angle) * this.r * 0.5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();

        const hpPct = clamp(this.life / this.maxLife, 0, 1);
        const barW = 80;
        const barH = 6;
        const barY = this.pos.y + this.r + 15;
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.fillRect(this.pos.x - barW / 2, barY, barW, barH);
        ctx.fillStyle = this.phase === 3 ? "rgba(255, 60, 60, 0.9)" : "rgba(0, 255, 0, 0.8)";
        ctx.fillRect(this.pos.x - barW / 2, barY, barW * hpPct, barH);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.pos.x - barW / 2, barY, barW, barH);
    }
}