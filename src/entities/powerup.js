import { rand, TAU, wrapPosition } from "../util.js";

export class PowerUp {
    constructor({ x, y, type }) {
        this.pos = { x, y };
        this.type = type; // "spread" | "rapid" | "shield" | "bomb"
        this.life = 10; // 10 seconds to collect
        this.r = 12;
        this.angle = rand(0, TAU);

        // Floating movement
        this.vel = { x: rand(-20, 20), y: rand(-20, 20) };
    }

    update(dt, bounds) {
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        wrapPosition(this.pos, bounds.w, bounds.h, this.r * 2);

        this.angle += 2 * dt;
        this.life -= dt;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);
        // Pulse effect
        const scale = 1 + Math.sin(this.angle * 3) * 0.15;
        ctx.scale(scale, scale);

        let color, glowColor, label;
        if (this.type === "spread") {
            color = "#ff00ff"; // Neon magenta
            glowColor = "rgba(255, 0, 255, 0.8)";
            label = "S";
        } else if (this.type === "rapid") {
            color = "#00ff88"; // Neon green
            glowColor = "rgba(0, 255, 136, 0.8)";
            label = "R";
        } else if (this.type === "bomb") {
            color = "#ff4400"; // Neon red-orange
            glowColor = "rgba(255, 68, 0, 0.9)";
            label = "B";
        } else {
            color = "#00ccff"; // Neon cyan/blue
            glowColor = "rgba(0, 204, 255, 0.8)";
            label = "O";
        }

        // Outer glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;

        // Inner glow ring
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating diamond shape
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.stroke();

        // Label text
        ctx.rotate(-this.angle);
        ctx.font = "bold 10px Courier New";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, 0, 1);

        ctx.restore();
    }
}
