import { rand, randSign, TAU } from "../util.js";
import { Bullet } from "./bullet.js";

export class Boss {
    constructor({ x, y, level }) {
        this.pos = { x, y };
        this.r = 55;
        this.scoreValue = 5000 + level * 1000;
        this.life = 100 + (level * 20);
        this.maxLife = this.life;

        // Starts moving in a random direction
        this.vel = { x: randSign() * rand(50, 100), y: randSign() * rand(50, 100) };

        this.shootTimer = 1.0;
        this.burstTimer = 4.0;
        this.burstCount = 0;
        this.microTimer = 0;

        // Visuals
        this.angle = 0;
        this.flashTimer = 0;
    }

    update(dt, bounds, player, bulletsList) {
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.angle += dt * 0.5;

        // Bounce off bounds
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

        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
        }

        // Shooting logic
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this.shootTimer = 1.5;
            this._fireSpread(bulletsList);
        }

        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
            this.burstCount = 5; // Fire a burst of 5 shots
            this.burstTimer = 4.0;
        }

        if (this.burstCount > 0) {
            this.microTimer -= dt;
            if (this.microTimer <= 0) {
                this._fireTargeted(player, bulletsList);
                this.burstCount--;
                this.microTimer = 0.15; // 0.15s between burst shots
            }
        }
    }

    _fireSpread(bulletsList) {
        const bulletSpeed = 250;
        const numShots = 8;
        for (let i = 0; i < numShots; i++) {
            const angle = (TAU / numShots) * i + this.angle; // Rotating spread
            bulletsList.push(new Bullet({
                x: this.pos.x + Math.cos(angle) * this.r,
                y: this.pos.y + Math.sin(angle) * this.r,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                team: "enemy"
            }));
        }
    }

    _fireTargeted(player, bulletsList) {
        const bulletSpeed = 400;
        let targetX = player.pos ? player.pos.x : player.x;
        let targetY = player.pos ? player.pos.y : player.y;

        const dx = targetX - this.pos.x;
        const dy = targetY - this.pos.y;
        let angle = Math.atan2(dy, dx);

        // slight inaccuracy
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

        ctx.shadowColor = isFlashing ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 50, 150, 0.8)";
        ctx.fillStyle = isFlashing ? "rgba(255, 255, 255, 0.8)" : "rgba(30, 0, 20, 0.8)";
        ctx.strokeStyle = isFlashing ? "#ffffff" : "#ff3399";
        ctx.lineWidth = 3;

        // Draw an Octagon
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

        // Inner core details
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (TAU / sides) * i + (TAU / 16); // offset
            const x = Math.cos(angle) * this.r * 0.5;
            const y = Math.sin(angle) * this.r * 0.5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore(); // Restore before drawing unrotated elements

        // Draw health bar below
        const hpPct = this.life / this.maxLife;
        const barW = 80;
        const barH = 6;
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.fillRect(this.pos.x - barW / 2, this.pos.y + this.r + 15, barW, barH);
        ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
        ctx.fillRect(this.pos.x - barW / 2, this.pos.y + this.r + 15, barW * hpPct, barH);

        // Frame for HP bar
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.pos.x - barW / 2, this.pos.y + this.r + 15, barW, barH);
    }
}
