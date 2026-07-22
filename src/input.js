import { clamp, hypot } from "./util.js";

const DEFAULT_DEADZONE = 0.18;

export class InputManager {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.mouse = { x: 0, y: 0, left: false, right: false, movedAt: 0, clickedAt: 0 };
    this.lastMouseAt = 0;
    this.lastKeyboardAt = 0;
    this.lastGamepadAt = 0;
    this.lastTouchAt = 0;
    this.gamepadIndex = null;
    this.gamepadName = null;
    this.deadzone = DEFAULT_DEADZONE;
    this._lastGamepadButtons = {};

    // Touch joystick state
    this.touch = {
      active: false,       // is the joystick being used right now?
      angle: 0,            // aim angle from joystick
      thrust: 0,           // 0-1 thrust magnitude
      shooting: false,     // right-side touch held
      bomb: false,         // two-finger tap on right side
      teleport: false,     // three-finger tap anywhere
    };
    this._activeTouchCount = 0;
    this._joystickTouchId = null;
    this._fireTouchIds = new Set();
    this._joystickOrigin = { x: 0, y: 0 };

    // Joystick overlay elements (set after DOM ready)
    this._joyOverlay = null;
    this._joyBase = null;
    this._joyKnob = null;

    this._bind();
  }

  _bind() {
    const onKeyDown = (e) => {
      this.keysDown.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
      }
      this.lastKeyboardAt = performance.now();
    };
    const onKeyUp = (e) => this.keysDown.delete(e.code);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

    const toCanvas = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * this.canvas.width;
      const y = clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1) * this.canvas.height;
      return { x, y };
    };
    const onMouseMove = (e) => {
      const p = toCanvas(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.movedAt = performance.now();
      this.lastMouseAt = this.mouse.movedAt;
    };
    const onMouseDown = (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this.mouse.clickedAt = performance.now();
      this.lastMouseAt = this.mouse.clickedAt;
    };
    const onMouseUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };

    this.canvas.addEventListener("mousemove", onMouseMove);
    this.canvas.addEventListener("mousedown", onMouseDown);
    this.canvas.addEventListener("mouseup", onMouseUp);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("gamepadconnected", (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.gamepadName = e.gamepad.id || "Gamepad";
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.gamepadName = null;
      }
    });

    // Touch zones: virtual joystick (left) + tap-to-fire (right)
    this._bindTouchZones();
  }

  _bindTouchZones() {
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    // Grab joystick overlay elements
    this._joyOverlay = document.getElementById("joystick-overlay");
    this._joyBase = document.getElementById("joystick-base");
    this._joyKnob = document.getElementById("joystick-knob");

    const JOYSTICK_MAX_R = 60; // max drag radius in CSS pixels
    const DOUBLE_TAP_MS = 300;  // max ms between taps for double-tap thrust

    const screenMidX = () => window.innerWidth / 2;
    let lastLeftTapTime = 0;    // timestamp of last left-side tap start

    const isUIElement = (e) => {
      const tag = e.target.tagName;
      return tag === "BUTTON" || tag === "A" || tag === "INPUT" ||
        e.target.closest(".overlay, .pause, #gameover, .fs-prompt, .panel");
    };

    const onTouchStart = (e) => {
      if (isUIElement(e)) return;
      e.preventDefault();
      this._activeTouchCount += e.changedTouches.length;
      // Three-finger tap anywhere → teleport
      if (this._activeTouchCount >= 3) {
        this.touch.teleport = true;
        this.lastTouchAt = performance.now();
      }
      for (const t of e.changedTouches) {
        const x = t.clientX;
        const y = t.clientY;
        if (x < screenMidX()) {
          // Left half → joystick (aim only) + double-tap to thrust
          const now = performance.now();
          if (this._joystickTouchId === null) {
            this._joystickTouchId = t.identifier;
            this._joystickOrigin.x = x;
            this._joystickOrigin.y = y;
            this.touch.active = true;
            this.lastTouchAt = now;

            // Double-tap detection: if tapped again within window, thrust
            if (now - lastLeftTapTime < DOUBLE_TAP_MS) {
              this.touch.thrust = 1;
            }
            lastLeftTapTime = now;
            this._showJoystick(x, y);
          }
        } else {
          // Right half → fire
          this._fireTouchIds.add(t.identifier);
          this.touch.shooting = true;
          this.lastTouchAt = performance.now();
          // Two simultaneous fire touches → bomb
          if (this._fireTouchIds.size >= 2) {
            this.touch.bomb = true;
          }
        }
      }
    };

    const onTouchMove = (e) => {
      if (isUIElement(e)) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystickTouchId) {
          const dx = t.clientX - this._joystickOrigin.x;
          const dy = t.clientY - this._joystickOrigin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Aim only — thrust is NOT tied to drag distance
          if (dist > 6) {
            this.touch.angle = Math.atan2(dy, dx);
          }
          this.touch.active = true;
          this.lastTouchAt = performance.now();

          // Clamp knob visual position
          const clampedDist = Math.min(dist, JOYSTICK_MAX_R);
          const nx = dist > 0 ? dx / dist : 0;
          const ny = dist > 0 ? dy / dist : 0;
          this._moveJoystickKnob(nx * clampedDist, ny * clampedDist);
        }
      }
    };

    const onTouchEnd = (e) => {
      if (isUIElement(e)) return;  
      e.preventDefault();
      this._activeTouchCount = Math.max(0, this._activeTouchCount - e.changedTouches.length);
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystickTouchId) {
          this._joystickTouchId = null;
          this.touch.active = false;
          this.touch.thrust = 0;
          this._hideJoystick();
        }
        if (this._fireTouchIds.has(t.identifier)) {
          this._fireTouchIds.delete(t.identifier);
          if (this._fireTouchIds.size === 0) {
            this.touch.shooting = false;
          }
        }
      }
    };

    // Bind to the whole document so touches anywhere are captured
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", onTouchEnd, { passive: false });
  }

  _showJoystick(cx, cy) {
    if (!this._joyOverlay) return;
    this._joyOverlay.classList.add("visible");
    this._joyBase.style.left = `${cx}px`;
    this._joyBase.style.top = `${cy}px`;
    this._joyKnob.style.left = `${cx}px`;
    this._joyKnob.style.top = `${cy}px`;
  }

  _moveJoystickKnob(dx, dy) {
    if (!this._joyKnob) return;
    const bx = parseFloat(this._joyBase.style.left);
    const by = parseFloat(this._joyBase.style.top);
    this._joyKnob.style.left = `${bx + dx}px`;
    this._joyKnob.style.top = `${by + dy}px`;
  }

  _hideJoystick() {
    if (!this._joyOverlay) return;
    this._joyOverlay.classList.remove("visible");
  }

  /** Call once per frame to consume one-shot flags like bomb/teleport */
  consumeTouchFlags() {
    this.touch.bomb = false;
    this.touch.teleport = false;
  }

  get mouseEverUsed() {
    return this.mouse.movedAt > 0 || this.mouse.clickedAt > 0;
  }

  get isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  get scheme() {
    const now = performance.now();
    const touchRecent = this.lastTouchAt > 0 && now - this.lastTouchAt < 3000;
    const gamepadRecent = this.lastGamepadAt > 0 && now - this.lastGamepadAt < 2500;
    const mouseRecent = this.lastMouseAt > 0 && now - this.lastMouseAt < 7000;
    const keyboardRecent = this.lastKeyboardAt > 0 && now - this.lastKeyboardAt < 2500;
    const keyboardRotating =
      (this.isDown("ArrowLeft") || this.isDown("KeyA")) !== (this.isDown("ArrowRight") || this.isDown("KeyD"));

    if (gamepadRecent) return "Gamepad";
    if (touchRecent) return "Touch";
    if (keyboardRotating) return "Keyboard";
    if (mouseRecent) return "Mouse";
    if (!this.mouseEverUsed && keyboardRecent) return "Keyboard";
    return this.isTouchDevice ? "Touch" : (this.mouseEverUsed ? "Mouse" : "Keyboard");
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  getGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!pads) return null;
    if (this.gamepadIndex != null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const pad of pads) {
      if (pad) return pad;
    }
    return null;
  }

  pollGamepad() {
    const pad = this.getGamepad();
    if (!pad) return null;
    this.gamepadIndex = pad.index;
    this.gamepadName = pad.id || "Gamepad";

    const ax = pad.axes?.[0] ?? 0;
    const ay = pad.axes?.[1] ?? 0;
    const mag = hypot(ax, ay);
    const stickActive = mag > this.deadzone;
    const rx = pad.axes?.[2] ?? 0;
    const ry = pad.axes?.[3] ?? 0;
    const rmag = hypot(rx, ry);
    const rightStickActive = rmag > this.deadzone;

    const buttons = pad.buttons || [];
    const lt = buttons[6]?.value ?? 0;
    const rt = buttons[7]?.value ?? 0;
    const a = !!buttons[0]?.pressed;
    const b = !!buttons[1]?.pressed;
    const x = !!buttons[2]?.pressed;
    const y = !!buttons[3]?.pressed;
    const lb = !!buttons[4]?.pressed;
    const rb = !!buttons[5]?.pressed;
    const back = !!buttons[8]?.pressed;
    const start = !!buttons[9]?.pressed;
    const dpadUp = !!buttons[12]?.pressed;
    const dpadDown = !!buttons[13]?.pressed;
    const dpadLeft = !!buttons[14]?.pressed;
    const dpadRight = !!buttons[15]?.pressed;

    const anyMeaningful =
      stickActive || rightStickActive || lt > 0.15 || rt > 0.15 || a || b || x || y || lb || rb || back || start || buttons.some((bt) => bt?.pressed);
    if (anyMeaningful) this.lastGamepadAt = performance.now();

    const pressed = (name, down) => {
      const was = !!this._lastGamepadButtons[name];
      this._lastGamepadButtons[name] = !!down;
      return !!down && !was;
    };
    const aPressed = pressed("a", a);
    const bPressed = pressed("b", b);
    const xPressed = pressed("x", x);
    const yPressed = pressed("y", y);
    const lbPressed = pressed("lb", lb);
    const rbPressed = pressed("rb", rb);
    const backPressed = pressed("back", back);
    const startPressed = pressed("start", start);
    const confirmPressed = aPressed || startPressed;

    return {
      pad,
      ax,
      ay,
      stickActive,
      rx,
      ry,
      rightStickActive,
      lt,
      rt,
      a,
      b,
      x,
      y,
      lb,
      rb,
      back,
      start,
      dpadUp,
      dpadDown,
      dpadLeft,
      dpadRight,
      aPressed,
      bPressed,
      xPressed,
      yPressed,
      lbPressed,
      rbPressed,
      backPressed,
      startPressed,
      confirmPressed,
      pausePressed: startPressed,
    };
  }

  getMappingText() {
    return [
      "Left/right stick: aim direction",
      "RT (button 7) or A (button 0): shoot",
      "LT (button 6) or B/Circle (button 1): thrust",
      "X (button 2) or RB (button 5): bomb",
      "Y (button 3): teleport",
      "LB (button 4): hold shield",
      "A/Start: menu confirm",
      "Start (button 9): pause/resume",
      `Deadzone: ${this.deadzone.toFixed(2)}`,
    ].join("\n");
  }

  rumble({ durationMs = 80, strong = 0.35, weak = 0.15 } = {}) {
    const pad = this.getGamepad();
    const actuator = pad?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== "function") return;
    actuator
      .playEffect("dual-rumble", {
        duration: durationMs,
        strongMagnitude: clamp(strong, 0, 1),
        weakMagnitude: clamp(weak, 0, 1),
      })
      .catch(() => { });
  }
}
