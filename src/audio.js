export class AudioFx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.sounds = {};
    this.ufoHums = {};
    this.thrustSource = null; // Active thrust loop reference
    this.thrustGain = null;
  }

  ensure() {
    if (!this.enabled) return null;
    if (this.ctx) {
      // Always try to resume suspended context (iOS can suspend it)
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => { });
      return this.ctx;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);

    // Force iOS to unlock audio by playing a silent buffer
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => { });
    try {
      const silent = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = silent;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (e) { }

    // Load sounds in background (non-blocking)
    this.loadSound('laser', './assets/sounds/retro_laser_01.ogg');
    this.loadSound('laser2', './assets/sounds/retro_laser_02.ogg');
    this.loadSound('bang_small', './assets/sounds/bangSmall.wav');
    this.loadSound('bang_medium', './assets/sounds/bangMedium.wav');
    this.loadSound('bang_large', './assets/sounds/bangLarge.wav');
    this.loadSound('powerup', './assets/sounds/shoot_02.ogg');
    this.loadSound('shoot', './assets/sounds/shoot_01.ogg');
    this.loadSound('thrust', './assets/sounds/thrust.wav');
    this.loadSound('saucer_small', './assets/sounds/saucerSmall.wav');
    this.loadSound('saucer_big', './assets/sounds/saucerBig.wav');

    return this.ctx;
  }

  loadSound(name, url) {
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buffer => this.ctx.decodeAudioData(buffer))
      .then(decoded => { this.sounds[name] = decoded; })
      .catch(() => { });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.ctx && this.ctx.state !== "closed") {
      this.ctx.suspend().catch(() => { });
      this.stopAllUfoHums();
    } else if (enabled && this.ctx) {
      this.ctx.resume().catch(() => { });
    }
  }

  _play(bufferName, { volume = 0.7, pitch = 1.0 } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.sounds[bufferName]) return false;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    try {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = this.sounds[bufferName];
      source.playbackRate.value = pitch + (Math.random() * 0.1 - 0.05);
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(this.master);
      source.start(0);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Laser: different pitch for normal vs rapid
  laser({ pitch = 1.0 } = {}) {
    this._play('laser', { pitch, volume: 0.45 });
  }

  // Explosion: size-dependent sound (asteroid size: 1=small, 2=medium, 3=large)
  explosion({ size = 1.0 } = {}) {
    if (size >= 3) {
      this._play('bang_large', { volume: 0.8, pitch: 0.9 + Math.random() * 0.1 });
    } else if (size >= 2) {
      this._play('bang_medium', { volume: 0.6, pitch: 0.95 + Math.random() * 0.1 });
    } else {
      this._play('bang_small', { volume: 0.5, pitch: 1.0 + Math.random() * 0.15 });
    }
  }

  // UFO destruction - distinct sound
  ufoExplosion() {
    this._play('bang_large', { volume: 0.9, pitch: 0.5 });
    setTimeout(() => this._play('bang_medium', { volume: 0.6, pitch: 0.7 }), 80);
  }

  // UFO ambient hum - different tone for big vs small
  startUfoHum(type = "big") {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (this.ufoHums[type]) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });

    try {
      if (type === "small" && this.sounds.saucer_small) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = this.sounds.saucer_small;
        source.loop = true;
        source.playbackRate.value = 1.0;
        gain.gain.value = 0.25;
        source.connect(gain);
        gain.connect(this.master);
        source.start(0);
        this.ufoHums[type] = { source, gain, isBuffer: true };
      } else if (type === "big" && this.sounds.saucer_big) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = this.sounds.saucer_big;
        source.loop = true;
        source.playbackRate.value = 1.0;
        gain.gain.value = 0.20;
        source.connect(gain);
        gain.connect(this.master);
        source.start(0);
        this.ufoHums[type] = { source, gain, isBuffer: true };
      }
    } catch (e) { }
  }

  stopUfoHum(type) {
    const hum = this.ufoHums[type];
    if (!hum) return;
    try {
      const now = this.ctx.currentTime;
      hum.gain.gain.linearRampToValueAtTime(0, now + 0.15);
      const ref = hum.source;
      setTimeout(() => { try { ref.stop(); } catch (e) { } }, 200);
    } catch (e) { }
    delete this.ufoHums[type];
  }

  stopAllUfoHums() {
    for (const type of Object.keys(this.ufoHums)) {
      this.stopUfoHum(type);
    }
  }

  hit({ intensity = 1.0 } = {}) {
    this._play('shoot', { volume: intensity * 0.4, pitch: 0.6 });
  }

  powerup() {
    this._play('powerup', { volume: 0.8, pitch: 1.3 });
  }

  extraLife() {
    this._play('powerup', { volume: 0.9, pitch: 0.8 });
    setTimeout(() => this._play('powerup', { volume: 0.9, pitch: 1.6 }), 90);
  }

  // Thrust: looped while player holds thrust
  startThrust() {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.sounds.thrust || this.thrustSource) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = this.sounds.thrust;
      source.loop = true;
      source.playbackRate.value = 1.0;
      gain.gain.value = 0.35;
      source.connect(gain);
      gain.connect(this.master);
      source.start(0);
      this.thrustSource = source;
      this.thrustGain = gain;
    } catch (e) { }
  }

  stopThrust() {
    if (!this.thrustSource) return;
    try {
      const now = this.ctx.currentTime;
      this.thrustGain.gain.linearRampToValueAtTime(0, now + 0.1);
      const ref = this.thrustSource;
      setTimeout(() => { try { ref.stop(); } catch (e) { } }, 150);
    } catch (e) { }
    this.thrustSource = null;
    this.thrustGain = null;
  }
}
