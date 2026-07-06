import { AudioFx } from "./audio.js";
import {
  asteroidCount,
  asteroidSpeedRange,
  comboDecaySeconds,
  enemySpawnDelay,
  explosiveChance,
  isBossLevel,
  maxActiveEnemies,
  pickEnemyPattern,
  pincerWaveChance,
  smallEnemyChance,
  splitExplosiveChance,
} from "./difficulty.js";
import { getHighScore, isNewHighScore, saveHighScore } from "./highscore.js";
import { InputManager } from "./input.js";
import { Asteroid, radiusForSize } from "./entities/asteroid.js";
import { Bullet } from "./entities/bullet.js";
import { Enemy } from "./entities/enemy.js";
import { Particle } from "./entities/particle.js";
import { PowerUp } from "./entities/powerup.js";
import { Ship } from "./entities/ship.js";
import { Boss } from "./entities/boss.js";
import { clamp, distSq, rand, TAU } from "./util.js";

const FIXED_DT = 1 / 60;

function scoreForSize(size) {
  if (size === 3) return 20;
  if (size === 2) return 50;
  return 100;
}

function neonBg(ctx, w, h, rOffset = 0) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(7,7,20,1)";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 80 + rOffset, w * 0.5, h * 0.45, Math.max(w, h));
  g.addColorStop(0, "rgba(60,120,255,0.14)");
  g.addColorStop(0.6, "rgba(120,80,255,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export class Game {
  constructor({ canvas, ui, webglBackground = false }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;
    this.webglBackground = webglBackground;
    this.background3d = null;

    // On touch/mobile devices, disable shadowBlur entirely for performance
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      const desc = Object.getOwnPropertyDescriptor(
        CanvasRenderingContext2D.prototype, "shadowBlur"
      );
      if (desc && desc.set) {
        Object.defineProperty(this.ctx, "shadowBlur", {
          set(v) { desc.set.call(this, 0); },
          get() { return desc.get.call(this); },
        });
      }
    }

    this.bounds = { w: canvas.width, h: canvas.height };
    this.mode = "menu"; // menu | playing | paused | gameover
    this.level = 1;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.shockwaveTimer = 0;
    this.lives = 3;
    this.bombs = 0;

    this.input = new InputManager({ canvas });
    this.audio = new AudioFx();

    this.ship = new Ship({ x: this.bounds.w / 2, y: this.bounds.h / 2 });
    this.asteroids = [];
    this.enemies = [];
    this.bosses = [];
    this.powerups = [];
    this.bullets = [];
    this.particles = [];

    if (!this.webglBackground) this._stars = this._makeStars();

    this._accum = 0;
    this._lastTime = 0;
    this._lastTime = performance.now();

    this.trauma = 0; // 0 to 1
    this.enemySpawnTimer = 0;

    this.highScore = getHighScore();
    this.sessionBest = this.highScore;
    this.newRecord = false;
  }

  _bumpCombo() {
    this.combo = Math.min(this.combo + 1, 99);
    this.comboTimer = comboDecaySeconds(this.level);
  }

  _trackScore() {
    if (isNewHighScore(this.score, this.sessionBest)) {
      this.newRecord = true;
      this.sessionBest = Math.floor(this.score);
    }
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  attachBackground3d(background) {
    this.background3d = background;
    this.webglBackground = !!background?.enabled;
    if (this.webglBackground) this._stars = null;
  }

  _backgroundState(dt) {
    return {
      w: this.bounds.w,
      h: this.bounds.h,
      trauma: this.trauma,
      vel: this.ship.vel,
      dt,
      ship: this.ship,
      asteroids: this.asteroids,
    };
  }

  resize(w, h) {
    this.bounds.w = w;
    this.bounds.h = h;
    if (this.mode === "menu") {
      this.ship.pos.x = w / 2;
      this.ship.pos.y = h / 2;
    }
    if (!this.webglBackground) this._stars = this._makeStars();
    if (this.background3d?.enabled) this.background3d.resize(w, h);
  }

  _makeStars() {
    const stars = [];
    const count = Math.floor((this.bounds.w * this.bounds.h) / 28000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(0, this.bounds.w),
        y: rand(0, this.bounds.h),
        r: rand(0.6, 1.9),
        a: rand(0.12, 0.65),
      });
    }
    return stars;
  }

  start() {
    this.audio.ensure(); // Unlock AudioContext during user gesture (required on iOS)
    this.reset();
    this.mode = "playing";
    this._lastTime = performance.now();
  }

  reset() {
    this.mode = "playing";
    this.level = 1;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.shockwaveTimer = 0;
    this.lives = 3;
    this.bombs = 0;
    this.bullets.length = 0;
    this.particles.length = 0;
    this.asteroids.length = 0;
    this.bosses.length = 0;
    this.enemies.length = 0;
    this.audio.stopAllUfoHums();
    this.audio.stopThrust();
    this.enemySpawnTimer = 999; // No enemies until level 3
    this.newRecord = false;
    this.sessionBest = this.highScore;
    this.ship.respawn(this.bounds.w / 2, this.bounds.h / 2);
    this._spawnLevel();
    this._syncHud();
  }

  togglePause() {
    if (this.mode === "playing") this.mode = "paused";
    else if (this.mode === "paused") this.mode = "playing";
  }

  _spawnLevel() {
    if (isBossLevel(this.level)) {
      const p = this._randomSpawnPoint(200);
      this.bosses.push(new Boss({ x: p.x, y: p.y, level: this.level }));
    }
    const count = asteroidCount(this.level);
    const { min: minSpeed, max: maxSpeed } = asteroidSpeedRange(this.level);
    const explosiveRate = explosiveChance(this.level);
    for (let i = 0; i < count; i++) {
      const p = this._randomSpawnPoint(180);
      const a = rand(0, TAU);
      const sp = rand(minSpeed, maxSpeed);
      const type = Math.random() < explosiveRate ? "explosive" : "normal";
      this.asteroids.push(
        new Asteroid({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          size: 3,
          level: this.level,
          type,
        }),
      );
    }
    this._syncHud();
  }

  _randomSpawnPoint(avoidRadius) {
    const cx = this.ship.pos.x;
    const cy = this.ship.pos.y;
    for (let i = 0; i < 80; i++) {
      const x = rand(0, this.bounds.w);
      const y = rand(0, this.bounds.h);
      if (distSq(x, y, cx, cy) > avoidRadius * avoidRadius) return { x, y };
    }
    return { x: rand(0, this.bounds.w), y: rand(0, this.bounds.h) };
  }

  _spawnEnemyAtEdge(preferLeft) {
    const fromLeft = preferLeft ?? Math.random() > 0.5;
    const x = fromLeft ? 0 : this.bounds.w;
    const y = rand(this.bounds.h * 0.1, this.bounds.h * 0.9);
    return { x, y };
  }

  _spawnSingleEnemy({ type, pattern, x, y }) {
    this.enemies.push(new Enemy({ x, y, type, pattern, level: this.level }));
    this.audio.startUfoHum(type);
  }

  _spawnEnemy(dt) {
    if (this.level < 3) return;

    const cap = maxActiveEnemies(this.level);
    if (this.enemies.length >= cap) return;

    this.enemySpawnTimer -= dt;
    if (this.enemySpawnTimer <= 0) {
      const isSmall = Math.random() < smallEnemyChance(this.level);
      const type = isSmall ? "small" : "big";
      const pattern = pickEnemyPattern(this.level, type);

      const pincer = Math.random() < pincerWaveChance(this.level) && this.enemies.length + 2 <= cap;
      if (pincer) {
        const left = this._spawnEnemyAtEdge(true);
        const right = this._spawnEnemyAtEdge(false);
        const leftType = "big";
        const rightType = Math.random() < 0.6 ? "small" : "big";
        this._spawnSingleEnemy({
          type: leftType,
          pattern: pickEnemyPattern(this.level, leftType),
          x: left.x,
          y: left.y,
        });
        this._spawnSingleEnemy({
          type: rightType,
          pattern: pickEnemyPattern(this.level, rightType),
          x: right.x,
          y: right.y,
        });
      } else {
        const p = this._spawnEnemyAtEdge();
        this._spawnSingleEnemy({ type, pattern, x: p.x, y: p.y });
      }

      this.enemySpawnTimer = enemySpawnDelay(this.level);
    }
  }

  _syncHud() {
    if (!this.ui) return;
    this._trackScore();
    this.ui.score.textContent = String(this.score);
    if (this.ui.combo) this.ui.combo.textContent = this.combo > 1 ? this.combo + "x" : "";
    this.ui.level.textContent = String(this.level);
    this.ui.lives.textContent = String(this.lives);
    if (this.ui.bombs) this.ui.bombs.textContent = String(this.bombs);
    this.ui.scheme.textContent = this.input.scheme;
    this.ui.padHint.textContent = this.input.gamepadName ? `Controller: ${this.input.gamepadName}` : "Controller: not connected";
    this.ui.mapping.textContent = this.input.getMappingText();

    const best = Math.max(this.highScore, this.sessionBest);
    if (this.ui.highScore) this.ui.highScore.textContent = String(best);
    if (this.ui.menuHighScore) this.ui.menuHighScore.textContent = best > 0 ? String(best) : "—";
    if (this.ui.gameoverBest) this.ui.gameoverBest.textContent = String(best);
    if (this.ui.newRecord) {
      const show = this.newRecord && this.mode === "gameover";
      this.ui.newRecord.classList.toggle("hidden", !show);
    }
    if (this.ui.hudBest) {
      this.ui.hudBest.classList.toggle("record-active", this.newRecord && this.mode === "playing");
    }
  }

  updateOnce(dt) {
    if (this.mode !== "playing") {
      this._syncHud();
      return;
    }

    const gp = this.input.pollGamepad();
    if (gp?.pausePressed) this.togglePause();

    const scheme = this.input.scheme;
    if (scheme === "Touch") {
      // Only update aim while joystick is held; keep last angle when released
      if (this.input.touch.active) {
        this.ship.setFacingAngle(this.input.touch.angle, dt);
      }
    } else if (scheme === "Gamepad" && gp?.stickActive) {
      this.ship.setFacingAngle(Math.atan2(gp.ay, gp.ax), dt);
    } else if (scheme === "Mouse" || !this._isKeyboardRotating()) {
      const dx = this.input.mouse.x - this.ship.pos.x;
      const dy = this.input.mouse.y - this.ship.pos.y;
      this.ship.setFacingAngle(Math.atan2(dy, dx), dt);
    } else this._keyboardRotation(dt);

    const thrustAmount = this._getThrustAmount(gp);
    // Thrust sound
    if (thrustAmount > 0) this.audio.startThrust();
    else this.audio.stopThrust();
    this.ship.update(dt, this.bounds, { thrustAmount, thrustPower: 520, maxSpeed: 560 });

    if (this.ship.dead && this.ship.respawnTimer <= 0 && this.lives > 0) {
      this.ship.respawn(this.bounds.w / 2, this.bounds.h / 2);
    }

    // Weapon Timer
    if (this.ship.weaponTimer > 0) {
      this.ship.weaponTimer -= dt;
      if (this.ship.weaponTimer <= 0) {
        this.ship.weapon = "normal";
        this.ui.lives.textContent = String(this.lives); // Reset UI text if it was shield
      }
    }

    if (this.ship.dead && this.ship.respawnTimer <= 0 && this.lives <= 0) {
      this._setGameOver();
      return;
    }

    const shoot = this._getShoot(gp);
    if (shoot) this._tryShoot();

    // Bomb detonation: press B key, gamepad X, or two-finger tap on right side
    if (this.bombs > 0 && !this.ship.dead) {
      const bPressed = this.input.isDown("KeyB") || (gp && gp.x) || this.input.touch.bomb;
      if (bPressed && !this._lastBombKey) {
        this.bombs--;
        this._detonateBomb();
      }
      this._lastBombKey = bPressed;
    } else {
      this._lastBombKey = false;
    }

    // Teleport: T key, three-finger tap, or gamepad Y
    if (!this.ship.dead && this.ship.teleportCooldown <= 0) {
      const tPressed = this.input.isDown("KeyT") || this.input.touch.teleport || (gp && !!gp.pad?.buttons?.[3]?.pressed);
      if (tPressed && !this._lastTeleportKey) {
        const dest = this._randomSpawnPoint(120);
        const oldX = this.ship.pos.x;
        const oldY = this.ship.pos.y;
        if (this.ship.teleport(dest.x, dest.y)) {
          // Particles at departure point
          for (let i = 0; i < 12; i++) {
            const a = rand(0, TAU);
            this.particles.push(new Particle({
              x: oldX, y: oldY,
              vx: Math.cos(a) * rand(80, 200), vy: Math.sin(a) * rand(80, 200),
              life: rand(0.3, 0.6), color: "rgba(80,200,255,0.8)"
            }));
          }
          // Particles at arrival point
          for (let i = 0; i < 12; i++) {
            const a = rand(0, TAU);
            this.particles.push(new Particle({
              x: dest.x, y: dest.y,
              vx: Math.cos(a) * rand(80, 200), vy: Math.sin(a) * rand(80, 200),
              life: rand(0.3, 0.6), color: "rgba(210,120,255,0.8)"
            }));
          }
          this.input.rumble({ durationMs: 50, strong: 0.15, weak: 0.1 });
        }
      }
      this._lastTeleportKey = tPressed;
    } else {
      this._lastTeleportKey = false;
    }

    // Consume one-shot touch flags (bomb, teleport)
    this.input.consumeTouchFlags();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
    if (this.shockwaveTimer > 0) {
      this.shockwaveTimer -= dt;
    }

    if (!this.ship.dead) {
      for (const p of this.powerups) {
        const dx = this.ship.pos.x - p.pos.x;
        const dy = this.ship.pos.y - p.pos.y;
        const dist2 = dx * dx + dy * dy;
        const magnetRadius = 180;
        if (dist2 < magnetRadius * magnetRadius && dist2 > 0) {
          const dist = Math.sqrt(dist2);
          const force = (magnetRadius - dist) * 15;
          p.vel.x += (dx / dist) * force * dt;
          p.vel.y += (dy / dist) * force * dt;
        }
      }
    }

    for (const a of this.asteroids) a.update(dt, this.bounds);
    for (const e of this.enemies) e.update(dt, this.bounds, this.ship, this.bullets);
    for (const boss of this.bosses) boss.update(dt, this.bounds, this.ship, this.bullets);
    for (const b of this.bullets) b.update(dt, this.bounds);
    for (const p of this.particles) p.update(dt, this.bounds);

    this._handleCollisions();
    this._spawnEnemy(dt);

    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.bosses = this.bosses.filter((b) => b.life > 0);
    const prevEnemyCount = this.enemies.length;
    this.enemies = this.enemies.filter((e) => e.life > 0);
    // Stop hums for enemy types no longer present
    if (this.enemies.length === 0) {
      this.audio.stopAllUfoHums();
    } else if (prevEnemyCount > 0 && this.enemies.length < prevEnemyCount) {
      const activeTypes = new Set(this.enemies.map(e => e.type));
      if (!activeTypes.has("big")) this.audio.stopUfoHum("big");
      if (!activeTypes.has("small")) this.audio.stopUfoHum("small");
    }

    if (this.asteroids.length === 0 && this.bosses.length === 0) {
      this.level += 1;
      // Set initial UFO spawn delay when reaching level 3
      if (this.level === 3) this.enemySpawnTimer = rand(20, 30);

      // Wipe enemies out so the level resets cleanly
      for (const e of this.enemies) {
        this._explode({ x: e.pos.x, y: e.pos.y, baseColor: "rgba(255, 50, 100, 0.95)", count: 20, speed: 200 });
      }
      this.enemies = [];
      this.audio.stopAllUfoHums();
      this.bullets = this.bullets.filter(b => !b.foe);

      this._spawnLevel();
      // Level up audio cue
      this.input.rumble({ durationMs: 70, strong: 0.25, weak: 0.08 });
    }

    this._syncHud();
  }

  _keyboardRotation(dt) {
    const left = this.input.isDown("ArrowLeft") || this.input.isDown("KeyA");
    const right = this.input.isDown("ArrowRight") || this.input.isDown("KeyD");
    if (left && !right) this.ship.rotateManual(-1, dt);
    if (right && !left) this.ship.rotateManual(1, dt);
  }

  _isKeyboardRotating() {
    const left = this.input.isDown("ArrowLeft") || this.input.isDown("KeyA");
    const right = this.input.isDown("ArrowRight") || this.input.isDown("KeyD");
    return (left && !right) || (right && !left);
  }

  _getThrustAmount(gp) {
    const scheme = this.input.scheme;
    if (scheme === "Touch") return this.input.touch.thrust;
    // Always allow Space or Right Click for thrust in Mouse/Keyboard modes
    if (scheme !== "Gamepad") return this.input.mouse.right || this.input.isDown("Space") || this.input.isDown("ArrowUp") || this.input.isDown("KeyW") ? 1 : 0;
    return clamp(Math.max(gp?.lt ?? 0, gp?.b ? 1 : 0), 0, 1);
  }

  _getShoot(gp) {
    if (this.input.scheme === "Gamepad") return (gp?.rt ?? 0) > 0.25 || !!gp?.a || !!gp?.x;
    if (this.input.touch.shooting) return true;
    return this.input.mouse.left;
  }

  _tryShoot() {
    if (this.ship.dead) return;
    if (this.ship.shootCooldown > 0) return;

    // Rapid fire = faster cooldown
    const isRapid = this.ship.weapon === "rapid";
    this.ship.shootCooldown = isRapid ? 0.08 : 0.16;

    const muzzle = 20;
    const x = this.ship.pos.x + Math.cos(this.ship.angle) * muzzle;
    const y = this.ship.pos.y + Math.sin(this.ship.angle) * muzzle;
    const speed = 780;

    const fireBullet = (angleOffset = 0, type = "normal") => {
      const a = this.ship.angle + angleOffset;
      const vx = Math.cos(a) * speed + this.ship.vel.x;
      const vy = Math.sin(a) * speed + this.ship.vel.y;
      this.bullets.push(new Bullet({ x, y, vx, vy, team: "player", type }));
    };

    if (this.ship.weapon === "pierce") {
      fireBullet(0, "pierce");
      this.ship.shootCooldown = 0.25; // Heavy shot cadence
    } else {
      fireBullet(0);
    }

    if (this.ship.weapon === "spread") {
      fireBullet(-0.15);
      fireBullet(0.15);
    }

    // Heavier sound + variance
    const freq = isRapid ? 200 : 160;
    this.audio.laser({ pitch: isRapid ? 1.2 : 1.0 });
    this.input.rumble({ durationMs: 50, strong: 0.2, weak: 0.1 });
  }

  _explode({ x, y, baseColor = "rgba(120,220,255,0.9)", count = 18, speed = 260 }) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const sp = rand(speed * 0.2, speed);
      this.particles.push(
        new Particle({
          x: x + Math.cos(a) * rand(0, 10),
          y: y + Math.sin(a) * rand(0, 10),
          vx: Math.cos(a) * sp + rand(-40, 40),
          vy: Math.sin(a) * sp + rand(-40, 40),
          life: rand(0.35, 0.9),
          size: rand(1.6, 3.6),
          color: baseColor,
        }),
      );
    }
  }

  _handleCollisions() {
    // Bullets vs Asteroids & Enemies
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      if (b.team === "player") {
        // Player Bullets vs Asteroids
        for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
          const a = this.asteroids[ai];
          const rr = b.r + a.r;
          if (distSq(b.pos.x, b.pos.y, a.pos.x, a.pos.y) <= rr * rr) {
            if (b.type !== "pierce") this.bullets.splice(bi, 1);
            this.asteroids.splice(ai, 1);
            if (a.type === "explosive") this._detonateExplosiveAsteroid(a);
            else this._splitAsteroid(a);
            this.score += scoreForSize(a.size) * this.combo;
            this._bumpCombo();
            this.audio.explosion({ size: a.size });
            this.input.rumble({ durationMs: 90, strong: 0.35, weak: 0.14 });
            this.addTrauma(0.25 + (a.size * 0.05));
            break;
          }
        }
        // Player Bullets vs Enemies
        // Check if bullet still exists (might have hit asteroid)
        if (bi < this.bullets.length && this.bullets[bi] === b) { // Optimization check
          for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
            const e = this.enemies[ei];
            const rr = b.r + e.r;
            if (distSq(b.pos.x, b.pos.y, e.pos.x, e.pos.y) <= rr * rr) {
              this.bullets.splice(bi, 1);
              // Kill enemy
              e.life--;
              if (e.life <= 0) {
                this.score += e.scoreValue * this.combo;
                this._bumpCombo();
                this.enemies.splice(ei, 1);
                // Drop PowerUp! (70% chance)
                if (Math.random() < 0.7) {
                  const r = Math.random();
                  const type = r < 0.10 ? "bomb" : r < 0.25 ? "pierce" : r < 0.5 ? "shield" : r < 0.75 ? "spread" : "rapid";
                  this.powerups.push(new PowerUp({ x: e.pos.x, y: e.pos.y, type }));
                }
                this._explode({ x: e.pos.x, y: e.pos.y, baseColor: "rgba(255, 50, 100, 0.95)", count: 40, speed: 350 });
                this.audio.ufoExplosion();
                // Stop hum if no more of this type
                if (!this.enemies.some(en => en.type === e.type)) this.audio.stopUfoHum(e.type);
                this.addTrauma(0.5);
              }
              break;
            }
          }
        }

        // Player Bullets vs Bosses
        if (bi < this.bullets.length && this.bullets[bi] === b) {
          for (let oi = this.bosses.length - 1; oi >= 0; oi--) {
            const boss = this.bosses[oi];
            const rr = b.r + boss.r;
            if (distSq(b.pos.x, b.pos.y, boss.pos.x, boss.pos.y) <= rr * rr) {
              this.bullets.splice(bi, 1);
              boss.life--;
              boss.flashTimer = 0.05;
              this.audio.explosion({ size: 0.5 }); // hit sound
              if (boss.life <= 0) {
                this.score += boss.scoreValue * this.combo;
                this._bumpCombo();
                this._explode({ x: boss.pos.x, y: boss.pos.y, baseColor: "rgba(255, 50, 150, 0.95)", count: 80, speed: 450 });
                this.audio.explosion({ size: 3 });
                this.addTrauma(1.0);

                // Drop multiple powerups
                for (let i = 0; i < 5; i++) {
                  const types = ["bomb", "shield", "spread", "rapid", "pierce"];
                  this.powerups.push(new PowerUp({ x: boss.pos.x + rand(-30, 30), y: boss.pos.y + rand(-30, 30), type: types[i] }));
                }
              }
              break;
            }
          }
        }
      } else if (b.team === "enemy") {
        // Enemy Bullets vs Player
        if (!this.ship.dead && this.ship.invuln <= 0) {
          const rr = b.r + this.ship.r * 0.6; // Smaller hitbox for ship
          if (distSq(b.pos.x, b.pos.y, this.ship.pos.x, this.ship.pos.y) <= rr * rr) {
            this.bullets.splice(bi, 1);
            this.lives -= 1;
            this.ship.kill();
            this.audio.stopThrust();
            this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(210,120,255,0.95)", count: 40, speed: 440 });
            this.audio.explosion({ size: 1.5 });
            this.input.rumble({ durationMs: 200, strong: 0.9, weak: 0.5 });
            this.addTrauma(0.9);
          }
        }
      }
    }

    // Ship vs PowerUps (always check, even with shield)
    if (!this.ship.dead) {
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        if (distSq(this.ship.pos.x, this.ship.pos.y, p.pos.x, p.pos.y) <= (this.ship.r + p.r) ** 2) {
          this.powerups.splice(i, 1);
          if (p.type === "shield") {
            this.ship.invuln = 10;
            this.ui.lives.textContent = "SHIELD";
          } else if (p.type === "bomb") {
            this.bombs++;
            this.ui.bombs.textContent = String(this.bombs);
          } else {
            this.ship.weapon = p.type;
            this.ship.weaponTimer = 15;
          }
          this.audio.powerup();
        }
      }
    }

    // Shield-contact destruction: shield active = destroy anything touching
    if (!this.ship.dead && this.ship.invuln > 1.0) {
      const shieldR = this.ship.r + 15;

      // Shield vs Asteroids
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        const rr = shieldR + a.r * 0.85;
        if (distSq(this.ship.pos.x, this.ship.pos.y, a.pos.x, a.pos.y) <= rr * rr) {
          this.asteroids.splice(ai, 1);
          if (a.type === "explosive") this._detonateExplosiveAsteroid(a);
          else this._splitAsteroid(a);
          this.score += scoreForSize(a.size) * this.combo;
          this._bumpCombo();
          this.audio.explosion({ size: a.size });
          this.addTrauma(0.15);
        }
      }

      // Shield vs Enemies
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        const rr = shieldR + e.r * 0.85;
        if (distSq(this.ship.pos.x, this.ship.pos.y, e.pos.x, e.pos.y) <= rr * rr) {
          this.score += e.scoreValue * this.combo;
          this._bumpCombo();
          this.enemies.splice(ei, 1);
          this._explode({ x: e.pos.x, y: e.pos.y, baseColor: "rgba(255, 50, 100, 0.95)", count: 40, speed: 350 });
          this.audio.ufoExplosion();
          if (!this.enemies.some(en => en.type === e.type)) this.audio.stopUfoHum(e.type);
          this.addTrauma(0.3);
        }
      }

      // Shield vs Bosses
      for (const boss of this.bosses) {
        const rr = shieldR + boss.r * 0.85;
        if (distSq(this.ship.pos.x, this.ship.pos.y, boss.pos.x, boss.pos.y) <= rr * rr) {
          boss.life -= 15 * 1 / 60; // approximate dt steady damage
          boss.flashTimer = 0.05;

          // bounce ship away safely
          const dx = this.ship.pos.x - boss.pos.x;
          const dy = this.ship.pos.y - boss.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          this.ship.pos.x = boss.pos.x + (dx / dist) * rr;
          this.ship.pos.y = boss.pos.y + (dy / dist) * rr;
          this.ship.vel.x += (dx / dist) * 400;
          this.ship.vel.y += (dy / dist) * 400;

          this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(100,200,255,0.8)", count: 2, speed: 100 });

          if (boss.life <= 0) {
            this.score += boss.scoreValue * this.combo;
            this._bumpCombo();
            this._explode({ x: boss.pos.x, y: boss.pos.y, baseColor: "rgba(255, 50, 150, 0.95)", count: 80, speed: 450 });
            this.audio.explosion({ size: 3 });
            this.addTrauma(1.0);
          }
        }
      }

      // Shield vs Enemy bullets
      for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
        const b = this.bullets[bi];
        if (!b.foe) continue;
        const rr = shieldR + b.r;
        if (distSq(this.ship.pos.x, this.ship.pos.y, b.pos.x, b.pos.y) <= rr * rr) {
          this.bullets.splice(bi, 1);
          this._explode({ x: b.pos.x, y: b.pos.y, baseColor: "rgba(255,255,0,0.8)", count: 5, speed: 150 });
        }
      }
    }

    // Skip damage checks if invulnerable or dead
    if (this.ship.dead || this.ship.invuln > 0) return;

    // Ship vs Asteroids
    for (const a of this.asteroids) {
      const rr = this.ship.r + a.r * 0.85;
      if (distSq(this.ship.pos.x, this.ship.pos.y, a.pos.x, a.pos.y) <= rr * rr) {
        this.lives -= 1;
        this.ship.kill();
        this.audio.stopThrust();
        this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(210,120,255,0.95)", count: 40, speed: 440 });
        this.audio.explosion({ size: 1.2 });
        this.input.rumble({ durationMs: 160, strong: 0.8, weak: 0.4 });
        this.addTrauma(0.8);
        break;
      }
    }

    // Ship vs Enemies
    for (const e of this.enemies) {
      const rr = this.ship.r + e.r * 0.85;
      if (distSq(this.ship.pos.x, this.ship.pos.y, e.pos.x, e.pos.y) <= rr * rr) {
        this.lives -= 1;
        this.ship.kill();
        this.audio.stopThrust();
        e.life = 0;
        this.enemies = this.enemies.filter(en => en !== e);
        this._explode({ x: e.pos.x, y: e.pos.y, baseColor: "rgba(255, 100, 100, 0.9)", count: 30, speed: 300 });
        this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(210,120,255,0.95)", count: 40, speed: 440 });
        this.audio.explosion({ size: 1.8 });
        this.input.rumble({ durationMs: 200, strong: 0.9, weak: 0.5 });
        this.addTrauma(0.9);
        break;
      }
    }

    // Ship vs Bosses
    for (const boss of this.bosses) {
      const rr = this.ship.r + boss.r * 0.85;
      if (distSq(this.ship.pos.x, this.ship.pos.y, boss.pos.x, boss.pos.y) <= rr * rr) {
        this.lives -= 1;
        this.ship.kill();
        this.audio.stopThrust();
        this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(210,120,255,0.95)", count: 40, speed: 440 });
        this.audio.explosion({ size: 1.8 });
        this.input.rumble({ durationMs: 200, strong: 0.9, weak: 0.5 });
        this.addTrauma(0.9);
        break;
      }
    }
  }

  _detonateBomb() {
    this.shockwaveTimer = 1.0;
    // Destroy ALL asteroids
    for (const a of this.asteroids) {
      this.score += scoreForSize(a.size) * this.combo;
      this._bumpCombo();
      this._explode({
        x: a.pos.x, y: a.pos.y,
        baseColor: "rgba(255, 120, 30, 0.95)",
        count: 15 + a.size * 5,
        speed: 200 + a.size * 40
      });
    }
    this.asteroids = [];

    // Destroy ALL enemies
    for (const e of this.enemies) {
      this.score += e.scoreValue * this.combo;
      this._bumpCombo();
      this._explode({
        x: e.pos.x, y: e.pos.y,
        baseColor: "rgba(255, 50, 100, 0.95)",
        count: 40,
        speed: 350
      });
    }
    this.enemies = [];
    this.audio.stopAllUfoHums();

    // Damage Bosses heavily
    for (const boss of this.bosses) {
      boss.life -= 80; // massive damage
      boss.flashTimer = 0.2;
      this._explode({
        x: boss.pos.x, y: boss.pos.y,
        baseColor: "rgba(255, 50, 150, 0.95)",
        count: 20,
        speed: 250
      });
      if (boss.life <= 0) {
        this.score += boss.scoreValue * this.combo;
        this._bumpCombo();
        this._explode({ x: boss.pos.x, y: boss.pos.y, baseColor: "rgba(255, 50, 150, 0.95)", count: 80, speed: 450 });
      }
    }

    // Clear enemy bullets
    this.bullets = this.bullets.filter(b => !b.foe);

    // Big boom audio + screen shake
    this.audio.explosion({ size: 3 });
    setTimeout(() => this.audio.explosion({ size: 2 }), 100);
    setTimeout(() => this.audio.explosion({ size: 1 }), 200);
    this.addTrauma(1.0);
    this.input.rumble({ durationMs: 400, strong: 1.0, weak: 0.7 });
  }

  _splitAsteroid(asteroid) {
    const { x, y } = asteroid.pos;
    const color = asteroid.size === 1 ? "rgba(255,210,120,0.95)" : "rgba(120,220,255,0.9)";
    this._explode({ x, y, baseColor: color, count: 20 + asteroid.size * 6, speed: 260 + asteroid.size * 60 });
    if (asteroid.size <= 1) return;
    const childSize = asteroid.size - 1;
    const r = radiusForSize(childSize);
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU);
      const sp = rand(90, 170) * (1.0 + this.level * 0.05);
      const type = Math.random() < splitExplosiveChance(this.level) ? "explosive" : "normal";
      this.asteroids.push(
        new Asteroid({
          x: x + Math.cos(a) * r * 0.25,
          y: y + Math.sin(a) * r * 0.25,
          vx: asteroid.vel.x * 0.4 + Math.cos(a) * sp,
          vy: asteroid.vel.y * 0.4 + Math.sin(a) * sp,
          size: childSize,
          level: this.level,
          type,
        }),
      );
    }
  }

  _detonateExplosiveAsteroid(asteroid) {
    const { x, y } = asteroid.pos;
    const blastRadius = 220;

    this._explode({ x, y, baseColor: "rgba(255, 120, 30, 0.95)", count: 50, speed: 450 });
    this.addTrauma(0.5);
    this.audio.explosion({ size: 3 });

    const hitAsteroids = [];
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const other = this.asteroids[i];
      if (distSq(x, y, other.pos.x, other.pos.y) < blastRadius * blastRadius) {
        hitAsteroids.push(other);
        this.asteroids.splice(i, 1);
      }
    }

    const hitEnemies = [];
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (distSq(x, y, e.pos.x, e.pos.y) < blastRadius * blastRadius) {
        hitEnemies.push(e);
        this.enemies.splice(i, 1);
      }
    }

    for (const other of hitAsteroids) {
      if (other.type === "explosive") this._detonateExplosiveAsteroid(other);
      else this._splitAsteroid(other);
      this.score += scoreForSize(other.size) * this.combo;
      this._bumpCombo();
    }

    for (const e of hitEnemies) {
      e.life = 0;
      this.score += e.scoreValue * this.combo;
      this._bumpCombo();
      this._explode({ x: e.pos.x, y: e.pos.y, baseColor: "rgba(255, 50, 100, 0.95)", count: 40, speed: 350 });
    }

    if (!this.ship.dead && this.ship.invuln <= 0) {
      if (distSq(x, y, this.ship.pos.x, this.ship.pos.y) < blastRadius * blastRadius) {
        this.lives -= 1;
        this.ship.kill();
        this.audio.stopThrust();
        this._explode({ x: this.ship.pos.x, y: this.ship.pos.y, baseColor: "rgba(210,120,255,0.95)", count: 40, speed: 440 });
        this.audio.explosion({ size: 1.5 });
        this.input.rumble({ durationMs: 200, strong: 1.0, weak: 0.8 });
      }
    }
  }

  _setGameOver() {
    this.mode = "gameover";
    this.audio.stopAllUfoHums();
    this.audio.stopThrust();
    if (saveHighScore(this.score)) {
      this.highScore = Math.floor(this.score);
      this.newRecord = true;
    }
    this._syncHud();
  }

  applySmokeFixture(name) {
    const cy = Math.round(this.bounds.h * 0.5);
    const clearWorld = () => {
      this.asteroids.length = 0;
      this.enemies.length = 0;
      this.bosses.length = 0;
      this.powerups.length = 0;
      this.bullets.length = 0;
      this.particles.length = 0;
      this.audio.stopAllUfoHums();
      this.audio.stopThrust();
      this.mode = "playing";
      this.enemySpawnTimer = 999;
      this.shockwaveTimer = 0;
      this.comboTimer = 0;
      this.bombs = 0;
    };

    if (name === "smoke_explosive_pierce_lane") {
      clearWorld();
      this.level = 2;
      this.score = 0;
      this.combo = 1;
      this.lives = 3;
      this.ship.respawn(180, cy);
      this.ship.invuln = 0;
      this.ship.angle = 0;
      this.ship.weapon = "pierce";
      this.ship.weaponTimer = 15;
      this.ship.shootCooldown = 0;
      this.ship.vel.x = 0;
      this.ship.vel.y = 0;

      this.asteroids.push(
        new Asteroid({ x: 420, y: cy, vx: 0, vy: 0, size: 1, level: this.level, type: "explosive" }),
      );
      this.asteroids.push(
        new Asteroid({ x: 560, y: cy, vx: 0, vy: 0, size: 1, level: this.level, type: "normal" }),
      );
      this.asteroids.push(
        new Asteroid({ x: 720, y: cy, vx: 0, vy: 0, size: 1, level: this.level, type: "normal" }),
      );
      this.asteroids.push(
        new Asteroid({ x: 980, y: cy + 150, vx: 0, vy: 0, size: 1, level: this.level, type: "normal" }),
      );
      this._syncHud();
      return true;
    }

    if (name === "smoke_collision_gameover") {
      clearWorld();
      this.level = 1;
      this.score = 900;
      this.combo = 1;
      this.lives = 1;
      this.ship.respawn(Math.round(this.bounds.w * 0.5), cy);
      this.ship.invuln = 0;
      this.ship.angle = 0;
      this.ship.weapon = "normal";
      this.ship.weaponTimer = 0;
      this.ship.shootCooldown = 0;
      this.ship.vel.x = 0;
      this.ship.vel.y = 0;

      this.asteroids.push(
        new Asteroid({
          x: this.ship.pos.x + 6,
          y: this.ship.pos.y,
          vx: 0,
          vy: 0,
          size: 1,
          level: this.level,
          type: "normal",
        }),
      );
      this._syncHud();
      return true;
    }

    return false;
  }

  tick(nowMs) {
    const dt = clamp((nowMs - this._lastTime) / 1000, 0, 0.05);
    this._lastTime = nowMs;

    if (this.mode !== "paused" && this.mode !== "menu" && this.mode !== "gameover") {
      this._accum += dt;
      while (this._accum >= FIXED_DT) {
        this.updateOnce(FIXED_DT);
        this._accum -= FIXED_DT;
      }
    } else {
      this._syncHud();
    }

    this._renderFrame(1 / 60);
  }

  advanceTime(ms) {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      if (this.mode === "playing") this.updateOnce(FIXED_DT);
    }
    this._renderFrame(ms / 1000);
  }

  _renderFrame(dt) {
    if (this.background3d?.enabled) {
      this.background3d.render(this._backgroundState(dt));
    }
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.bounds.w;
    const h = this.bounds.h;

    // Decay trauma faster (was 0.8, then 1.8)
    this.trauma = clamp(this.trauma - 2.5 * (1 / 60), 0, 1);
    // Reduced shake multiplier (was 25, then 8, now 3)
    const shake = this.trauma * this.trauma * 3;
    const angle = rand(0, TAU);
    const sx = Math.cos(angle) * shake;
    const sy = Math.sin(angle) * shake;

    ctx.save();
    ctx.translate(sx, sy);

    if (!this.webglBackground) {
      const bgShake = this.trauma * 3;
      neonBg(ctx, w, h, bgShake);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    // Chromatic Aberration removed for performance (was causing lag)
    /*
    if (this.trauma > 0.3) {
      // ... (code removed) ...
    }
    */

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this._drawWorld(ctx);
    ctx.restore();

    if (this.mode === "paused") {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    ctx.restore(); // end shake
  }

  getTextState() {
    const payload = {
      mode: this.mode,
      coord: { origin: "top-left", x: "right", y: "down", unit: "px (canvas internal resolution)" },
      ship: {
        x: Math.round(this.ship.pos.x),
        y: Math.round(this.ship.pos.y),
        vx: Math.round(this.ship.vel.x),
        vy: Math.round(this.ship.vel.y),
        angle: Number(this.ship.angle.toFixed(3)),
        invuln_s: Number(this.ship.invuln.toFixed(2)),
        dead: this.ship.dead,
        weapon: this.ship.weapon || "normal",
      },
      asteroids: this.asteroids.map((a) => ({
        x: Math.round(a.pos.x),
        y: Math.round(a.pos.y),
        r: Math.round(a.r),
        size: a.size,
        type: a.type || "normal",
      })),
      bullets: this.bullets.map((b) => ({
        x: Math.round(b.pos.x),
        y: Math.round(b.pos.y),
        type: b.type || "normal",
        team: b.team || "player",
      })),
      score: this.score,
      highScore: Math.max(this.highScore, this.sessionBest),
      combo: this.combo,
      lives: this.lives,
      level: this.level,
      input: { scheme: this.input.scheme, gamepad: this.input.gamepadName || null },
    };
    return JSON.stringify(payload);
  }

  _drawWorld(ctx) {
    if (this._stars) {
      for (const s of this._stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "rgba(140,210,255,1)";
        ctx.shadowColor = "rgba(80,200,255,0.6)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.shockwaveTimer > 0) {
      ctx.save();
      const progress = 1.0 - this.shockwaveTimer; // 0 to 1
      const radius = progress * Math.max(this.bounds.w, this.bounds.h);
      ctx.beginPath();
      ctx.arc(this.bounds.w / 2, this.bounds.h / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 120, 30, ${this.shockwaveTimer})`;
      ctx.lineWidth = 30 * this.shockwaveTimer;
      ctx.stroke();
      ctx.restore();
    }

    if (!this.webglBackground) {
      for (const a of this.asteroids) a.draw(ctx);
    }
    for (const e of this.enemies) e.draw(ctx);
    for (const boss of this.bosses) boss.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    if (!this.webglBackground) this.ship.draw(ctx);
    for (const p of this.particles) p.draw(ctx);
  }
}
