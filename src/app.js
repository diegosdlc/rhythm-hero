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
    update(session) {
      const isHolding = session.state === 'playing' && session.rhythm.notes.some(note => note.state === 'holding');
      const frameIndex = isHolding ? Math.floor(session.now() / 0.12) % MOUTH_FRAMES.length : 0;
      if (frameIndex !== this.currentFrame) {
        this.frame.src = MOUTH_FRAMES[frameIndex];
        this.currentFrame = frameIndex;
      }
      this.root.classList.toggle('is-holding', isHolding);
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
    draw(session) {
      this.resize();
      const ctx = this.ctx, W = this.lastWidth, H = this.lastHeight;
      const t = session.now();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#10131a'; ctx.fillRect(0, 0, W, H);

      const laneTop = 70, laneBottom = H - 90;
      const laneH = (laneBottom - laneTop) / 7;
      const hitX = Math.max(90, W * 0.18);
      const horizon = 2.5;

      ctx.font = '600 13px system-ui, sans-serif';
      for (let i = 0; i < 7; i++) {
        const y = laneTop + laneH * i;
        ctx.fillStyle = i % 2 ? '#151a24' : '#121720';
        ctx.fillRect(0, y, W, laneH);
        ctx.strokeStyle = '#283141'; ctx.strokeRect(0, y, W, laneH);
        const action = `NOTE_${i + 1}`;
        ctx.fillStyle = '#aeb8c8';
        ctx.fillText(`${this.level.noteMapping[action]}  (${i + 1})`, 16, y + laneH * 0.58);
      }

      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hitX, laneTop); ctx.lineTo(hitX, laneBottom); ctx.stroke();

      for (const note of session.rhythm.activeState(t, horizon)) {
        if (note.state === 'hit' || note.state === 'miss') continue;
        const idx = Number(note.note.split('_')[1]) - 1;
        const y = laneTop + laneH * idx + laneH * 0.15;
        const x = hitX + ((note.time - t) / horizon) * (W - hitX - 30);
        const width = note.duration > 0 ? Math.max(28, note.duration / horizon * (W - hitX - 30)) : 28;
        ctx.fillStyle = note.state === 'holding' ? '#8b5cf6' : '#4f6cff';
        ctx.fillRect(x, y, width, laneH * 0.7);
        ctx.fillStyle = '#fff'; ctx.font = '700 14px system-ui, sans-serif';
        ctx.fillText(this.level.noteMapping[note.note], x + 8, y + laneH * 0.43);
        if (note.lyric) {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText(note.lyric, x + 28, y + laneH * 0.43);
        }
      }

      if (session.lastJudgement && t - session.lastJudgement.time < 0.55) {
        ctx.font = '800 28px system-ui, sans-serif';
        ctx.fillStyle = '#fff'; ctx.fillText(session.lastJudgement.grade, hitX + 18, laneTop - 24);
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
      this.router.onInput(evt => this.session.handleInput(evt));
      this.router.add(new RH.KeyboardInputAdapter());
      this.router.add(new RH.GamepadInputAdapter());
      this.router.add(new RH.TouchInputAdapter(document.getElementById('touch-controls')));

      this.lastInterruptionId = null;
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
        overlay.classList.remove('visible'); this.lastInterruptionId = null; return;
      }
      overlay.classList.add('visible');
      document.getElementById('interruption-title').textContent = e.title || e.type;
      document.getElementById('interruption-text').textContent = e.text || '';
      const options = document.getElementById('interruption-options');
      options.innerHTML = '';
      (e.options || [{ id: 'dismissed', label: 'Dismiss' }]).forEach((option, index) => {
        const btn = document.createElement('button');
        btn.dataset.choice = option.id;
        btn.className = index === e.selectedIndex ? 'selected' : '';
        btn.textContent = option.label;
        options.appendChild(btn);
      });
      this.lastInterruptionId = e.id;
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
      this.mouthAnimator.update(this.session);
      this._updateHUD();
      this._updateInterruption();
      this._updateScreens();
      requestAnimationFrame(this._loop);
    }
  }

  global.addEventListener('DOMContentLoaded', () => new App());
})(window);
