(function (global) {
  'use strict';

  const RH = global.RhythmHero;
  const MOUTH_FRAMES = [
    'assets/mouth/mouth-closed.png',
    'assets/mouth/mouth-half.png',
    'assets/mouth/mouth-open.png',
    'assets/mouth/mouth-half.png'
  ];

  const LYRIC_BOX_ASSET = 'assets/lyric-boxes.png';
  const LYRIC_BOX_VARIANTS = Object.freeze([
    { x: 5,   y: 38,  width: 518, height: 187, leftCap: 200, rightCap: 200, heightScale: 1.00, rotation: -0.010 },
    { x: 548, y: 45,  width: 457, height: 185, leftCap: 175, rightCap: 175, heightScale: 0.92, rotation:  0.008 },
    { x: 15,  y: 260, width: 483, height: 190, leftCap: 190, rightCap: 190, heightScale: 1.08, rotation: -0.006 },
    { x: 537, y: 313, width: 420, height: 203, leftCap: 165, rightCap: 165, heightScale: 1.16, rotation:  0.012 },
    { x: 96,  y: 482, width: 391, height: 154, leftCap: 155, rightCap: 155, heightScale: 0.88, rotation: -0.014 }
  ]);
  const LYRIC_BOX_MIN_WIDTH = 62;
  const LYRIC_BOX_HEIGHT = 56;

  function lyricBoxGeometry(note, time, hitX, trackWidth, horizon) {
    const duration = Math.max(0, Number(note.duration) || 0);
    const startX = hitX + ((note.time - time) / horizon) * trackWidth;
    const fullWidth = duration > 0
      ? Math.max(LYRIC_BOX_MIN_WIDTH, duration / horizon * trackWidth)
      : LYRIC_BOX_MIN_WIDTH;
    const consumedWidth = Math.max(0, hitX - startX);
    return {
      x: Math.max(hitX, startX),
      width: Math.max(LYRIC_BOX_MIN_WIDTH, fullWidth - consumedWidth)
    };
  }
  RH.lyricBoxGeometry = lyricBoxGeometry;

  function lyricBoxVariant(note) {
    const key = String(note.id || note.note || note.lyric || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return hash % LYRIC_BOX_VARIANTS.length;
  }
  RH.lyricBoxVariant = lyricBoxVariant;

  class LyricBoxSprite {
    constructor() {
      this.image = new Image();
      this.ready = false;
      this.image.onload = () => { this.ready = true; };
      this.image.src = LYRIC_BOX_ASSET;
    }

    sliceLayout(width, height, variantIndex) {
      const source = LYRIC_BOX_VARIANTS[variantIndex] || LYRIC_BOX_VARIANTS[0];
      const naturalLeft = height * source.leftCap / source.height;
      const naturalRight = height * source.rightCap / source.height;
      const scale = Math.min(1, width / (naturalLeft + naturalRight));
      const left = naturalLeft * scale;
      const right = naturalRight * scale;
      return { left, middle: Math.max(0, width - left - right), right };
    }

    heightFor(variantIndex, baseHeight) {
      const source = LYRIC_BOX_VARIANTS[variantIndex] || LYRIC_BOX_VARIANTS[0];
      return baseHeight * source.heightScale;
    }

    draw(ctx, x, centerY, width, height, state, variantIndex) {
      const source = LYRIC_BOX_VARIANTS[variantIndex] || LYRIC_BOX_VARIANTS[0];
      const top = centerY - height / 2;
      const layout = this.sliceLayout(width, height, variantIndex);
      const isReady = this.ready || (this.image.complete && this.image.naturalWidth > 0);

      ctx.save();
      if (source.rotation) {
        const centerX = x + width / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(source.rotation);
        ctx.translate(-centerX, -centerY);
      }
      if (state === 'holding') {
        ctx.shadowColor = 'rgba(244, 114, 182, .75)';
        ctx.shadowBlur = 16;
        if ('filter' in ctx) ctx.filter = 'brightness(1.12) saturate(1.15)';
      }

      if (!isReady) {
        ctx.fillStyle = state === 'holding' ? '#b85cf6' : '#9f54e8';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, top, width, height, 9);
        else ctx.rect(x, top, width, height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.drawImage(
        this.image,
        source.x, source.y, source.leftCap, source.height,
        x, top, layout.left, height
      );

      if (layout.middle > 0.5) {
        ctx.drawImage(
          this.image,
          source.x + source.leftCap, source.y,
          source.width - source.leftCap - source.rightCap, source.height,
          x + layout.left, top, layout.middle, height
        );
      }

      ctx.drawImage(
        this.image,
        source.x + source.width - source.rightCap, source.y,
        source.rightCap, source.height,
        x + width - layout.right, top, layout.right, height
      );
      ctx.restore();
    }
  }
  RH.LyricBoxSprite = LyricBoxSprite;

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
      this.lyricBox = new LyricBoxSprite();
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
      ctx.fillStyle = '#10131a'; ctx.fillRect(0, 0, W, H);

      const field = this.playfield();
      const playTop = field.top, playBottom = field.bottom, hitX = field.hitX;
      const horizon = 2.5;

      const gradient = ctx.createLinearGradient(0, playTop, 0, playBottom);
      gradient.addColorStop(0, '#171d29');
      gradient.addColorStop(0.5, '#111722');
      gradient.addColorStop(1, '#171d29');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, playTop, W, playBottom - playTop);
      ctx.strokeStyle = 'rgba(143, 160, 185, .12)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = playTop + (playBottom - playTop) * i / 5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(241, 245, 249, .9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hitX, playTop); ctx.lineTo(hitX, playBottom); ctx.stroke();

      for (const note of session.rhythm.activeState(t, horizon)) {
        if (note.state === 'hit' || note.state === 'miss') continue;
        const fallbackIndex = Math.max(0, Number(String(note.note).split('_')[1]) - 1 || 0);
        const notePitch = Number.isFinite(note.y) ? note.y : (fallbackIndex + 0.5) / 7;
        const y = playTop + (playBottom - playTop) * notePitch;
        const trackWidth = W - hitX - 30;
        const geometry = lyricBoxGeometry(note, t, hitX, trackWidth, horizon);
        const lyric = note.lyric || this.level.noteMapping[note.note] || '';
        const variantIndex = lyricBoxVariant(note);
        const boxHeight = this.lyricBox.heightFor(variantIndex, LYRIC_BOX_HEIGHT);

        this.lyricBox.draw(
          ctx,
          geometry.x,
          y,
          geometry.width,
          boxHeight,
          note.state,
          variantIndex
        );

        const horizontalPadding = Math.min(22, geometry.width * 0.18);
        const textMaxWidth = Math.max(12, geometry.width - horizontalPadding * 2);
        let fontSize = 16;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(24, 8, 41, .7)';
        ctx.shadowBlur = 3;
        do {
          ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
          if (ctx.measureText(lyric).width <= textMaxWidth || fontSize <= 10) break;
          fontSize -= 1;
        } while (fontSize >= 10);
        ctx.beginPath();
        ctx.rect(geometry.x + horizontalPadding, y - boxHeight / 2 + 7, textMaxWidth, boxHeight - 14);
        ctx.clip();
        ctx.fillText(lyric, geometry.x + geometry.width / 2, y + 1, textMaxWidth);
        ctx.restore();
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
