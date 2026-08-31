(function (global) {
  'use strict';

  const RH = global.RhythmHero = global.RhythmHero || {};
  const A = RH.ACTIONS;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  class InputRouter {
    constructor(getTime) {
      this.getTime = getTime;
      this.listeners = [];
      this.adapters = [];
    }
    onInput(fn) { this.listeners.push(fn); }
    emit(action, phase, source, detail) {
      if (!action) return;
      const evt = Object.assign({
        action, phase, source,
        timestamp: this.getTime ? this.getTime() : 0
      }, detail || {});
      for (const fn of this.listeners) fn(evt);
    }
    add(adapter) { adapter.attach(this); this.adapters.push(adapter); return adapter; }
    update() { for (const adapter of this.adapters) if (adapter.update) adapter.update(); }
    destroy() { for (const adapter of this.adapters) if (adapter.destroy) adapter.destroy(); this.adapters = []; }
  }

  class PitchController {
    constructor(router, source) {
      this.router = router;
      this.source = source;
      this.pitch = null;
    }
    setPitch(position) {
      const nextPitch = clamp(position, 0, 1);
      if (this.pitch !== null && Math.abs(nextPitch - this.pitch) < 0.0001) return;
      this.pitch = nextPitch;
      this.router.emit(A.PITCH, 'changed', this.source, { pitch: nextPitch });
    }
  }

  class KeyboardInputAdapter {
    constructor() {
      this.down = new Set();
      this.map = {
        KeyW: A.NAV_PREVIOUS, KeyS: A.NAV_NEXT,
        ArrowUp: A.NAV_PREVIOUS, ArrowLeft: A.NAV_PREVIOUS,
        ArrowDown: A.NAV_NEXT, ArrowRight: A.NAV_NEXT,
        Enter: A.CONFIRM, Space: A.CONFIRM,
        Digit1: A.OPTION_1, Digit2: A.OPTION_2, Digit3: A.OPTION_3, Digit4: A.OPTION_4,
        Escape: A.PAUSE
      };
    }
    attach(router) {
      this.router = router;
      this.keydown = e => {
        const action = this.map[e.code];
        if (!action || this.down.has(e.code)) return;
        this.down.add(e.code);
        e.preventDefault();
        router.emit(action, 'pressed', 'keyboard');
      };
      this.keyup = e => {
        const action = this.map[e.code];
        if (!action) return;
        this.down.delete(e.code);
        router.emit(action, 'released', 'keyboard');
      };
      global.addEventListener('keydown', this.keydown, { passive: false });
      global.addEventListener('keyup', this.keyup);
    }
    destroy() {
      global.removeEventListener('keydown', this.keydown);
      global.removeEventListener('keyup', this.keyup);
    }
  }

  class PointerPitchInputAdapter {
    constructor(root, options) {
      this.root = root;
      this.options = Object.assign({ topInset: 70, bottomInset: 90, touchWidth: 0.55 }, options || {});
      this.activePointer = null;
    }
    attach(router) {
      this.router = router;
      this.controllers = {
        mouse: new PitchController(router, 'mouse'),
        touch: new PitchController(router, 'touch'),
        pen: new PitchController(router, 'touch')
      };
      this.move = e => {
        const type = this._pointerType(e);
        if (type !== 'mouse' && this.activePointer !== e.pointerId) return;
        if (!this._accepts(e, type, type === 'mouse')) return;
        this.controllers[type].setPitch(this._pitch(e));
      };
      this.down = e => {
        const type = this._pointerType(e);
        if ((type === 'mouse' && e.button !== 0) || !this._accepts(e, type, false)) return;
        e.preventDefault();
        this.activePointer = e.pointerId;
        this.controllers[type].setPitch(this._pitch(e));
        if (this.root.setPointerCapture) this.root.setPointerCapture(e.pointerId);
      };
      this.up = e => {
        if (this.activePointer !== e.pointerId) return;
        e.preventDefault();
        this.activePointer = null;
      };
      this.root.addEventListener('pointermove', this.move, { passive: false });
      this.root.addEventListener('pointerdown', this.down, { passive: false });
      this.root.addEventListener('pointerup', this.up, { passive: false });
      this.root.addEventListener('pointercancel', this.up, { passive: false });
    }
    _pointerType(e) {
      return e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    }
    _accepts(e, type, allowMouseMove) {
      if (e.target && e.target.closest && e.target.closest('#interruption, #pause-layer, button')) return false;
      if (type === 'mouse') return allowMouseMove || e.button === 0;
      const rect = this.root.getBoundingClientRect();
      return e.clientX - rect.left <= rect.width * this.options.touchWidth;
    }
    _pitch(e) {
      const rect = this.root.getBoundingClientRect();
      const top = rect.top + this.options.topInset;
      const height = Math.max(1, rect.height - this.options.topInset - this.options.bottomInset);
      const position = clamp((e.clientY - top) / height, 0, 1);
      return position;
    }
    destroy() {
      this.root.removeEventListener('pointermove', this.move);
      this.root.removeEventListener('pointerdown', this.down);
      this.root.removeEventListener('pointerup', this.up);
      this.root.removeEventListener('pointercancel', this.up);
    }
  }

  class GamepadInputAdapter {
    constructor() {
      this.previous = {};
      this.controllers = {};
    }
    attach(router) { this.router = router; }
    update() {
      const pads = global.navigator && global.navigator.getGamepads ? global.navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad) continue;
        const key = pad.index;
        const previous = this.previous[key] || { buttons: {}, rightStickZone: 0 };
        const controller = this.controllers[key] || new PitchController(this.router, 'gamepad');
        this.controllers[key] = controller;

        const leftY = pad.axes[1] || 0;
        const pitch = (clamp(leftY, -1, 1) + 1) / 2;
        controller.setPitch(pitch);

        const rightY = pad.axes[3] || 0;
        const rightStickZone = rightY < -0.6 ? -1 : rightY > 0.6 ? 1 : 0;
        if (rightStickZone !== previous.rightStickZone && rightStickZone !== 0) {
          this.router.emit(rightStickZone < 0 ? A.NAV_PREVIOUS : A.NAV_NEXT, 'pressed', 'gamepad');
        }
        previous.rightStickZone = rightStickZone;

        this._buttonEdge(pad, previous, 0, A.CONFIRM);
        this._buttonEdge(pad, previous, 9, A.PAUSE);
        this._buttonEdge(pad, previous, 12, A.NAV_PREVIOUS);
        this._buttonEdge(pad, previous, 13, A.NAV_NEXT);
        this.previous[key] = previous;
      }
    }
    _buttonEdge(pad, previous, index, action) {
      const pressed = !!(pad.buttons[index] && pad.buttons[index].pressed);
      const wasPressed = !!previous.buttons[index];
      if (pressed !== wasPressed) this.router.emit(action, pressed ? 'pressed' : 'released', 'gamepad');
      previous.buttons[index] = pressed;
    }
  }

  RH.InputRouter = InputRouter;
  RH.KeyboardInputAdapter = KeyboardInputAdapter;
  RH.PointerPitchInputAdapter = PointerPitchInputAdapter;
  RH.GamepadInputAdapter = GamepadInputAdapter;
})(window);
