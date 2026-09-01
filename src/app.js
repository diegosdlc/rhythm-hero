(function (global) {
  'use strict';

  const RH = global.RhythmHero;
  const MOUTH_FRAMES = [
    'assets/mouth/mouth-closed.png',
    'assets/mouth/mouth-half.png',
    'assets/mouth/mouth-open.png',
    'assets/mouth/mouth-half.png'
  ];

  class MouthAnimator {
    constructor(root, frame) {
      this.root = root;
      this.frame = frame;
      this.currentFrame = -1;
      MOUTH_FRAMES.forEach(src => { const image = new Image(); image.src = src; });
    }
    update(session, position) {
      const isOnPitch = session.state === 'playing' && session.rhythm.isOnPitch;
      const frameIndex = isOnPitch ? Math.floor(session.now() / 0.12) % MOUTH_FRAMES.length : 0;
      if (frameIndex !== this.currentFrame) {
        this.frame.src = MOUTH_FRAMES[frameIndex];
        this.currentFrame = frameIndex;
      }
      if (position) {
        this.root.style.left = `${position.x}px`;
        this.root.style.top = `${position.y}px`;
      }
      this.root.classList.toggle('is-holding', isOnPitch);
    }
  }
  RH.MouthAnimator = MouthAnimator;

  class GenericRenderer {
    constructor(canvas, level) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.level = level;
      this.lastWidth = 0;
      this.lastHeight = 0;
    }
    resize() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr), h = Math.floor(rect.height * dpr);
      if (w !== this.canvas.width || h !== this.canvas.height) {
        this.canvas.width = w; this.canvas.height = h;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lastWidth = rect.width; this.lastHeight = rect.height;
    }
    playfield() {
      return {
        top: 70,
        bottom: this.lastHeight - 90,
        hitX: Math.max(90, this.lastWidth * 0.18)
      };
    }
    cursorPosition(pitch) {
      const field = this.playfield();
      return {
        x: field.hitX,
        y: field.top + (field.bottom - field.top) * Math.max(0, Math.min(1, pitch))
      };
    }
    draw(session) {
      this.resize();
      const ctx = this.ctx, W = this.lastWidth, H = this.lastHeight;
      const t = session.now();
      ctx.clearRect(0, 0, W, H);

      const field = this.playfield();
      const playTop = field.top, playBottom = field.bottom, hitX = field.hitX;
      const horizon = 2.5;

      ctx.strokeStyle = 'rgba(38, 32, 29, .72)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hitX, playTop); ctx.lineTo(hitX, playBottom); ctx.stroke();

      for (const note of session.rhythm.activeState(t, horizon)) {
        if (note.state === 'hit' || note.state === 'miss') continue;
        const fallbackIndex = Math.max(0, Number(String(note.note).split('_')[1]) - 1 || 0);
        const notePitch = Number.isFinite(note.y) ? note.y : (fallbackIndex + 0.5) / 7;
        const y = playTop + (playBottom - playTop) * notePitch;
        const x = hitX + ((note.time - t) / horizon) * (W - hitX - 30);
        const width = note.duration > 0 ? Math.max(28, note.duration / horizon * (W - hitX - 30)) : 28;
        const height = note.state === 'holding' ? 24 : 20;
        ctx.fillStyle = note.state === 'holding' ? '#f472b6' : '#667cff';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y - height / 2, width, height, height / 2);
        else ctx.rect(x, y - height / 2, width, height);
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui, sans-serif';
        ctx.fillText(this.level.noteMapping[note.note], x + 8, y + 5);
        if (note.lyric) {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText(note.lyric, x + 28, y + 5);
        }
      }

      if (session.lastJudgement && t - session.lastJudgement.time < 0.55) {
        ctx.font = '800 28px system-ui, sans-serif';
        ctx.fillStyle = '#fff'; ctx.fillText(session.lastJudgement.grade, hitX + 18, playTop - 24);
      }
    }
  }

  class App {
    constructor() {
      this.level = global.RHYTHM_LEVELS.demo;
      this.clock = new RH.BrowserAudioClock('audio-instrumental', 'audio-vocal');
      this.bridge = new RH.MinigameBridge({ gameId: 'rhythm-hero' });
      this.session = new RH.GameSession(this.level, this.clock, this.bridge);
      this.canvas = document.getElementById('game-canvas');
      this.renderer = new GenericRenderer(this.canvas, this.level);
      this.mouthAnimator = new MouthAnimator(
        document.getElementById('singing-mouth'),
        document.getElementById('singing-mouth-frame')
      );
      this.router = new RH.InputRouter(() => this.session.now());
      this.router.onInput(evt => {
        this.session.handleInput(evt);
        this._setInputMode(evt.source);
      });
      this.router.add(new RH.KeyboardInputAdapter());
      this.router.add(new RH.GamepadInputAdapter());
      this.router.add(new RH.PointerPitchInputAdapter(document.getElementById('screen-game')));

      this.lastInterruptionSignature = null;
      const prefersTouch = (global.matchMedia && global.matchMedia('(pointer: coarse)').matches) || global.innerWidth <= 620;
      this._setInputMode(prefersTouch ? 'touch' : 'mouse');
      this._bindUI();
      this._bindHostCommands();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    _bindUI() {
      document.getElementById('btn-start').addEventListener('click', () => {
        this.session.start(); this._show('screen-game');
      });
      document.getElementById('btn-restart').addEventListener('click', () => {
        this.session.start(); this._show('screen-game');
      });
      document.getElementById('btn-menu').addEventListener('click', () => {
        this.clock.stop(); this.session.state = 'idle'; this._show('screen-start');
      });
      document.getElementById('btn-resume').addEventListener('click', () => this.session.resume());

      document.getElementById('interruption-options').addEventListener('click', e => {
        const btn = e.target.closest('[data-choice]');
        const active = this.session.interruptions.current();
        if (!btn || !active) return;
        this.session.interruptions.choose(active.id, btn.dataset.choice, this.session.now());
      });
    }

    _bindHostCommands() {
      this.bridge.on('game.start', () => { if (this.session.state === 'idle' || this.session.state === 'completed') { this.session.start(); this._show('screen-game'); } });
      this.bridge.on('game.pause', () => this.session.pause());
      this.bridge.on('game.resume', () => this.session.resume());
      this.bridge.on('state.request', () => this.bridge.emit('state.snapshot', this.session.snapshot(), this.session.now()));
    }

    _show(id) {
      document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    _setInputMode(source) {
      const mode = source === 'gamepad' ? 'gamepad' : source === 'touch' ? 'touch' : 'desktop';
      document.body.dataset.inputMode = mode;
    }

    _updateHUD() {
      const s = this.session.score.snapshot();
      document.getElementById('score-value').textContent = s.score.toLocaleString();
      document.getElementById('combo-value').textContent = s.combo;
      document.getElementById('accuracy-value').textContent = `${(s.accuracy * 100).toFixed(1)}%`;
      document.getElementById('time-value').textContent = this.session.now().toFixed(2);
    }

    _updateInterruption() {
      const e = this.session.interruptions.current();
      const overlay = document.getElementById('interruption');
      if (!e) {
        overlay.classList.remove('visible'); this.lastInterruptionSignature = null; return;
      }
      overlay.classList.add('visible');
      const signature = `${e.id}:${e.selectedIndex}`;
      if (signature === this.lastInterruptionSignature) return;
      document.getElementById('interruption-title').textContent = e.title || e.type;
      document.getElementById('interruption-text').textContent = e.text || '';
      const options = document.getElementById('interruption-options');
      options.innerHTML = '';
      (e.options || [{ id: 'dismissed', label: 'Dismiss' }]).forEach((option, index) => {
        const btn = document.createElement('button');
        btn.dataset.choice = option.id;
        btn.className = index === e.selectedIndex ? 'selected' : '';
        const key = document.createElement('kbd');
        key.textContent = String(index + 1);
        const label = document.createElement('span');
        label.textContent = option.label;
        btn.append(key, label);
        options.appendChild(btn);
      });
      this.lastInterruptionSignature = signature;
    }

    _updateScreens() {
      if (this.session.state === 'paused') document.getElementById('pause-layer').classList.add('visible');
      else document.getElementById('pause-layer').classList.remove('visible');

      if (this.session.state === 'completed' && !document.getElementById('screen-result').classList.contains('active')) {
        const s = this.session.score.snapshot();
        document.getElementById('result-score').textContent = s.score.toLocaleString();
        document.getElementById('result-accuracy').textContent = `${(s.accuracy * 100).toFixed(1)}%`;
        document.getElementById('result-combo').textContent = s.maxCombo;
        document.getElementById('result-decisions').textContent = JSON.stringify(this.session.interruptions.decisions, null, 2);
        this._show('screen-result');
      }
    }

    _loop() {
      this.router.update();
      this.session.update();
      if (this.session.state === 'playing' || this.session.state === 'paused') this.renderer.draw(this.session);
      this.mouthAnimator.update(this.session, this.renderer.cursorPosition(this.session.pitch));
      this._updateHUD();
      this._updateInterruption();
      this._updateScreens();
      requestAnimationFrame(this._loop);
    }
  }

  global.addEventListener('DOMContentLoaded', () => new App());
})(window);
