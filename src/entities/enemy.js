import { rand, randSign, TAU, wrapPosition } from "../util.js";
import { Bullet } from "./bullet.js";

export class Enemy {
    constructor({ x, y, type = "big" }) {
        this.pos = { x, y };
        this.type = type; // "big" | "small"
        this.r = type === "big" ? 24 : 14;
        this.scoreValue = type === "big" ? 200 : 1000;

        // Movement
        const speed = type === "big" ? 100 : 220;
        this.vel = { x: randSign() * speed, y: rand(-20, 20) };

        // AI
        this.shootTimer = rand(1, 3);
        this.dirTimer = rand(2, 5);
        this.life = 1;
        this.despawnTimer = rand(15, 30); // Leaves after 15-30 seconds
        this.leaving = false; // True when flying off screen

        // Animation
        this.animTime = rand(0, 100); // Desync animations between UFOs
        this.pulsePhase = rand(0, TAU);
    }

    update(dt, bounds, player, bulletsList) {
        // If leaving, fly off fast and don't shoot
        if (this.leaving) {
            this.pos.x += this.vel.x * dt * 2.5;
            this.pos.y += this.vel.y * dt * 2.5;
            // Mark as dead once fully off-screen
            if (this.pos.x < -this.r * 4 || this.pos.x > bounds.w + this.r * 4 ||
                this.pos.y < -this.r * 4 || this.pos.y > bounds.h + this.r * 4) {
                this.life = 0; // Will be cleaned up by game
            }
            return;
        }

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        // Small saucer erratic movement
        this.dirTimer -= dt;
        if (this.type === "small" && this.dirTimer <= 0) {
            this.dirTimer = rand(1, 3);
            this.vel.y = randSign() * rand(100, 200);
        }

        wrapPosition(this.pos, bounds.w, bounds.h, this.r * 2);

        // Shooting
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this._shoot(player, bulletsList);
            this.shootTimer = this.type === "big" ? rand(1.5, 3.0) : rand(0.8, 1.5);
        }

        // Timeout: start leaving
        this.despawnTimer -= dt;
        if (this.despawnTimer <= 0) {
            this.leaving = true;
            // Fly toward nearest edge
            const toLeft = this.pos.x;
            const toRight = bounds.w - this.pos.x;
            this.vel.x = toLeft < toRight ? -300 : 300;
            this.vel.y = rand(-50, 50);
        }
    }

    _shoot(player, bulletsList) {
        const bulletSpeed = 400;
        let targetX = player.pos ? player.pos.x : player.x;
        let targetY = player.pos ? player.pos.y : player.y;

        // Predictive aiming for small UFO
        if (this.type === "small" && player.vel) {
            const dx = targetX - this.pos.x;
            const dy = targetY - this.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const timeToTarget = dist / bulletSpeed;
            targetX += player.vel.x * timeToTarget;
            targetY += player.vel.y * timeToTarget;
        }

        // Calculate angle to player
        const dx = targetX - this.pos.x;
        const dy = targetY - this.pos.y;
        let angle = Math.atan2(dy, dx);

        // Accuracy
        if (this.type === "big") {
            // Inaccurate: +/- 15 degrees
            angle += rand(-0.26, 0.26);
        } else {
            // Accurate but with slight error +/- 2 degrees
            angle += rand(-0.03, 0.03);
        }

        const vx = Math.cos(angle) * bulletSpeed;
        const vy = Math.sin(angle) * bulletSpeed;

        bulletsList.push(new Bullet({
            x: this.pos.x + Math.cos(angle) * this.r,
            y: this.pos.y + Math.sin(angle) * this.r,
            vx,
            vy,
            team: "enemy"
        }));
    }

    draw(ctx, dt) {
        this.animTime += (dt || 1/60);
        const t = this.animTime;
        const pulse = Math.sin(t * 3 + this.pulsePhase) * 0.5 + 0.5; // 0-1
        const fastPulse = Math.sin(t * 8) * 0.5 + 0.5;

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);

        if (this.type === "big") {
            this._drawBigUFO(ctx, t, pulse, fastPulse);
        } else {
            this._drawSmallUFO(ctx, t, pulse, fastPulse);
        }

        ctx.restore();
    }

    _drawBigUFO(ctx, t, pulse, fastPulse) {
        const r = this.r;

        // === Outer energy field / halo ===
        const haloR = r * 1.6 + pulse * 4;
        const haloGrad = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, haloR);
        haloGrad.addColorStop(0, "rgba(255, 60, 60, 0.0)");
        haloGrad.addColorStop(0.5, `rgba(255, 80, 40, ${0.06 + pulse * 0.04})`);
        haloGrad.addColorStop(1, "rgba(255, 40, 20, 0.0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, TAU);
        ctx.fill();

        // === Rotating outer ring ===
        ctx.save();
        ctx.rotate(t * 0.8);
        ctx.strokeStyle = `rgba(255, 120, 60, ${0.25 + pulse * 0.15})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.2, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // Ring nodes — 6 energy points rotating around
        for (let i = 0; i < 6; i++) {
            const a = (TAU / 6) * i;
            const nx = Math.cos(a) * r * 1.2;
            const ny = Math.sin(a) * r * 1.2;
            ctx.fillStyle = `rgba(255, 160, 80, ${0.5 + fastPulse * 0.5})`;
            ctx.beginPath();
            ctx.arc(nx, ny, 1.8, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        // === Hull — sleek saucer with curved top ===
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(255, 80, 40, 0.7)";

        // Bottom hull plate
        const hullGrad = ctx.createLinearGradient(-r, -r * 0.3, r, r * 0.4);
        hullGrad.addColorStop(0, "rgba(60, 15, 15, 0.9)");
        hullGrad.addColorStop(0.5, "rgba(90, 25, 20, 0.95)");
        hullGrad.addColorStop(1, "rgba(40, 10, 10, 0.9)");
        ctx.fillStyle = hullGrad;

        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.quadraticCurveTo(-r * 0.6, -r * 0.7, 0, -r * 0.75);
        ctx.quadraticCurveTo(r * 0.6, -r * 0.7, r, 0);
        ctx.quadraticCurveTo(r * 0.4, r * 0.45, 0, r * 0.5);
        ctx.quadraticCurveTo(-r * 0.4, r * 0.45, -r, 0);
        ctx.closePath();
        ctx.fill();

        // Hull edge glow
        ctx.strokeStyle = `rgba(255, 100, 60, ${0.6 + pulse * 0.3})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // === Mid seam line with lights ===
        ctx.strokeStyle = `rgba(255, 140, 80, ${0.4 + pulse * 0.2})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, 0);
        ctx.lineTo(r * 0.95, 0);
        ctx.stroke();

        // Window/sensor lights along seam
        const lightCount = 5;
        for (let i = 0; i < lightCount; i++) {
            const lx = -r * 0.7 + (r * 1.4 / (lightCount - 1)) * i;
            const flicker = Math.sin(t * 6 + i * 1.5) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(255, 200, 100, ${0.4 + flicker * 0.6})`;
            ctx.beginPath();
            ctx.arc(lx, 0, 1.6 + flicker * 0.8, 0, TAU);
            ctx.fill();
        }

        // === Reactor core (dome on top) ===
        const coreR = r * 0.22 + pulse * 2;
        const coreGrad = ctx.createRadialGradient(0, -r * 0.3, 0, 0, -r * 0.3, coreR);
        coreGrad.addColorStop(0, `rgba(255, 220, 140, ${0.8 + fastPulse * 0.2})`);
        coreGrad.addColorStop(0.6, "rgba(255, 100, 40, 0.5)");
        coreGrad.addColorStop(1, "rgba(255, 60, 20, 0.0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, -r * 0.3, coreR, 0, TAU);
        ctx.fill();

        // === Tractor beam / underside glow ===
        const beamAlpha = 0.06 + pulse * 0.06;
        const beamGrad = ctx.createLinearGradient(0, r * 0.3, 0, r * 1.8);
        beamGrad.addColorStop(0, `rgba(255, 80, 40, ${beamAlpha})`);
        beamGrad.addColorStop(1, "rgba(255, 40, 20, 0.0)");
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, r * 0.35);
        ctx.lineTo(r * 0.3, r * 0.35);
        ctx.lineTo(r * 0.6, r * 1.8);
        ctx.lineTo(-r * 0.6, r * 1.8);
        ctx.closePath();
        ctx.fill();
    }

    _drawSmallUFO(ctx, t, pulse, fastPulse) {
        const r = this.r;

        // === Outer energy field ===
        const haloR = r * 1.8 + fastPulse * 3;
        const haloGrad = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, haloR);
        haloGrad.addColorStop(0, "rgba(255, 20, 60, 0.0)");
        haloGrad.addColorStop(0.4, `rgba(255, 30, 80, ${0.08 + fastPulse * 0.06})`);
        haloGrad.addColorStop(1, "rgba(255, 20, 40, 0.0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, TAU);
        ctx.fill();

        // === Fast-spinning energy ring ===
        ctx.save();
        ctx.rotate(t * 3.0); // Much faster spin
        ctx.strokeStyle = `rgba(255, 40, 80, ${0.3 + fastPulse * 0.3})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // 4 spinning plasma nodes
        for (let i = 0; i < 4; i++) {
            const a = (TAU / 4) * i;
            const nx = Math.cos(a) * r * 1.3;
            const ny = Math.sin(a) * r * 1.3;
            ctx.fillStyle = `rgba(255, 60, 100, ${0.6 + fastPulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(nx, ny, 1.4, 0, TAU);
            ctx.fill();
        }
        ctx.restore();

        // === Hull — angular diamond/blade shape ===
        ctx.shadowBlur = 16;
        ctx.shadowColor = "rgba(255, 30, 80, 0.85)";

        const hullGrad = ctx.createLinearGradient(-r, 0, r, 0);
        hullGrad.addColorStop(0, "rgba(80, 10, 25, 0.9)");
        hullGrad.addColorStop(0.5, "rgba(120, 20, 35, 0.95)");
        hullGrad.addColorStop(1, "rgba(60, 8, 20, 0.9)");
        ctx.fillStyle = hullGrad;

        ctx.beginPath();
        ctx.moveTo(-r * 1.1, 0);
        ctx.lineTo(-r * 0.2, -r * 0.65);
        ctx.lineTo(r * 0.2, -r * 0.65);
        ctx.lineTo(r * 1.1, 0);
        ctx.lineTo(r * 0.2, r * 0.45);
        ctx.lineTo(-r * 0.2, r * 0.45);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 50, 90, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // === Seam + sensor lights ===
        ctx.strokeStyle = `rgba(255, 80, 120, ${0.3 + pulse * 0.2})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-r * 1.0, 0);
        ctx.lineTo(r * 1.0, 0);
        ctx.stroke();

        // Rapid-blinking lights
        for (let i = 0; i < 3; i++) {
            const lx = -r * 0.55 + (r * 1.1 / 2) * i;
            const flicker = Math.sin(t * 12 + i * 2.2) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(255, 100, 150, ${0.5 + flicker * 0.5})`;
            ctx.beginPath();
            ctx.arc(lx, 0, 1.2 + flicker * 0.6, 0, TAU);
            ctx.fill();
        }

        // === Hot plasma core ===
        const coreR = r * 0.28 + fastPulse * 2;
        const coreGrad = ctx.createRadialGradient(0, -r * 0.15, 0, 0, -r * 0.15, coreR);
        coreGrad.addColorStop(0, `rgba(255, 180, 200, ${0.9 + fastPulse * 0.1})`);
        coreGrad.addColorStop(0.5, "rgba(255, 50, 90, 0.6)");
        coreGrad.addColorStop(1, "rgba(255, 20, 60, 0.0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, coreR, 0, TAU);
        ctx.fill();

        // === Targeting scanner lines — sweeping ===
        ctx.save();
        ctx.globalAlpha = 0.12 + pulse * 0.08;
        ctx.strokeStyle = "rgba(255, 40, 80, 0.6)";
        ctx.lineWidth = 0.6;
        const scanAngle = t * 2;
        for (let i = 0; i < 2; i++) {
            const a = scanAngle + i * Math.PI;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * r * 3, Math.sin(a) * r * 3);
            ctx.stroke();
        }
        ctx.restore();
    }
}
