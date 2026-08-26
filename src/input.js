(function (global) {
  'use strict';

  const RH = global.RhythmHero = global.RhythmHero || {};
  const A = RH.ACTIONS;

  class InputRouter {
    constructor(getTime) {
      this.getTime = getTime;
      this.listeners = [];
      this.adapters = [];
    }
    onInput(fn) { this.listeners.push(fn); }
    emit(action, phase, source) {
      if (!action) return;
      const evt = { action, phase, source, timestamp: this.getTime ? this.getTime() : 0 };
      for (const fn of this.listeners) fn(evt);
    }
    add(adapter) { adapter.attach(this); this.adapters.push(adapter); return adapter; }
    update() { for (const a of this.adapters) if (a.update) a.update(); }
    destroy() { for (const a of this.adapters) if (a.destroy) a.destroy(); this.adapters = []; }
  }

  class KeyboardInputAdapter {
    constructor() {
      this.down = new Set();
      this.map = {
        KeyA: A.NOTE_1, KeyB: A.NOTE_2, KeyC: A.NOTE_3, KeyD: A.NOTE_4,
        KeyE: A.NOTE_5, KeyF: A.NOTE_6, KeyG: A.NOTE_7,
        ArrowUp: A.NAV_PREVIOUS, ArrowLeft: A.NAV_PREVIOUS,
        ArrowDown: A.NAV_NEXT, ArrowRight: A.NAV_NEXT,
        Enter: A.CONFIRM, Space: A.CONFIRM, Escape: A.PAUSE
      };
    }
    attach(router) {
      this.router = router;
      this.keydown = e => {
        const action = this.map[e.code];
        if (!action || this.down.has(e.code)) return;
        this.down.add(e.code);
        if (action.indexOf('NOTE_') === 0 || action.indexOf('NAV_') === 0 || action === A.CONFIRM || action === A.PAUSE) e.preventDefault();
        router.emit(action, 'pressed', 'keyboard');
      };
      this.keyup = e => {
        const action = this.map[e.code];
        if (!action) return;
        this.down.delete(e.code);
        router.emit(action, 'released', 'keyboard');
      };
      window.addEventListener('keydown', this.keydown, { passive: false });
      window.addEventListener('keyup', this.keyup);
    }
    destroy() {
      window.removeEventListener('keydown', this.keydown);
      window.removeEventListener('keyup', this.keyup);
    }
  }

  class GamepadInputAdapter {
    constructor() { this.prev = {}; this.buttonMap = [A.NOTE_1, A.NOTE_2, A.NOTE_3, A.NOTE_4, A.NOTE_5, A.NOTE_6, A.NOTE_7, A.CONFIRM]; }
    attach(router) { this.router = router; }
    update() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad) continue;
        const key = pad.index;
        const prev = this.prev[key] || { buttons: [], axisY: 0 };
        for (let i = 0; i < this.buttonMap.length; i++) {
          const pressed = !!(pad.buttons[i] && pad.buttons[i].pressed);
          const was = !!prev.buttons[i];
          if (pressed !== was) this.router.emit(this.buttonMap[i], pressed ? 'pressed' : 'released', 'gamepad');
          prev.buttons[i] = pressed;
        }
        // Standard d-pad buttons 12/13 plus left-stick vertical as navigation.
        for (const pair of [[12, A.NAV_PREVIOUS], [13, A.NAV_NEXT]]) {
          const idx = pair[0], action = pair[1];
          const pressed = !!(pad.buttons[idx] && pad.buttons[idx].pressed);
          const was = !!prev.buttons[idx];
          if (pressed && !was) this.router.emit(action, 'pressed', 'gamepad');
          prev.buttons[idx] = pressed;
        }
        const y = pad.axes[1] || 0;
        const zone = y < -0.65 ? -1 : y > 0.65 ? 1 : 0;
        if (zone !== prev.axisY && zone !== 0) this.router.emit(zone < 0 ? A.NAV_PREVIOUS : A.NAV_NEXT, 'pressed', 'gamepad');
        prev.axisY = zone;
        this.prev[key] = prev;
      }
    }
  }

  class TouchInputAdapter {
    constructor(root) { this.root = root; this.active = new Map(); }
    attach(router) {
      this.router = router;
      this.down = e => {
        const button = e.target.closest('[data-action]');
        if (!button) return;
        e.preventDefault();
        const action = button.dataset.action;
        this.active.set(e.pointerId, action);
        button.setPointerCapture && button.setPointerCapture(e.pointerId);
        router.emit(action, 'pressed', 'touch');
      };
      this.up = e => {
        const action = this.active.get(e.pointerId);
        if (!action) return;
        e.preventDefault();
        this.active.delete(e.pointerId);
        router.emit(action, 'released', 'touch');
      };
      this.root.addEventListener('pointerdown', this.down, { passive: false });
      this.root.addEventListener('pointerup', this.up, { passive: false });
      this.root.addEventListener('pointercancel', this.up, { passive: false });
    }
    destroy() {
      this.root.removeEventListener('pointerdown', this.down);
      this.root.removeEventListener('pointerup', this.up);
      this.root.removeEventListener('pointercancel', this.up);
    }
  }

  RH.InputRouter = InputRouter;
  RH.KeyboardInputAdapter = KeyboardInputAdapter;
  RH.GamepadInputAdapter = GamepadInputAdapter;
  RH.TouchInputAdapter = TouchInputAdapter;
})(window);
