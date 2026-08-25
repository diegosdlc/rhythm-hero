/**
 * game.js — Rhythm Hero
 * Main game engine: Audio, Notes, Player, Hit Detection, Score, FX, Renderer
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PLAYER_X_RATIO  = 0.14;   // Player line position (% of canvas width)
const NOTE_TRAVEL_SEC = 1.5;    // Seconds for a note to travel from right to player
const HIT_WINDOW_Y    = {       // Hit windows as fraction of canvas height
  PERFECT: 0.030,
  GREAT:   0.070,
  GOOD:    0.120,
};
const SCORE_TABLE = { PERFECT: 300, GREAT: 200, GOOD: 100, MISS: 0 };
const COMBO_MULTIPLIERS = [1, 2, 4, 8]; // thresholds: <8, <16, <32, 32+
const NOTE_RADIUS  = 22;
const NOTE_COLOR   = { SPAWN: '#a855f7', body: '#c084fc', rim: '#e9d5ff' };
const LANE_COUNT   = 0; // Free-form (no discrete lanes)
const SONG_END_PAD = 3; // Extra seconds after last note before ending

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randRange(a, b) { return a + Math.random() * (b - a); }

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────────
/**
 * Dual-track audio engine — uses native HTMLAudioElement only.
 * No AudioContext / MediaElementSource needed → works perfectly with file://.
 *
 * Volume penalty : vocalEl.volume is reduced on GREAT/GOOD hits
 * Mute/unmute : vocalEl.volume  0 ↔ 1
 */
class AudioEngine {
  constructor() {
    this.instrumentalEl = null;
    this.vocalEl        = null;
    this.playing        = false;
    this._vocalMuted    = false;
    this.targetVolume   = 1.0;
    this.currentVolume  = 1.0;
  }

  /** Game time comes directly from the instrumental element's position. */
  get currentTime() {
    return this.instrumentalEl ? this.instrumentalEl.currentTime : 0;
  }

  /** Call from a button-click handler to guarantee browser autoplay permission. */
  start() {
    this.instrumentalEl = document.getElementById('audio-instrumental');
    this.vocalEl        = document.getElementById('audio-vocal');

    // Reset both tracks to the beginning
    this.instrumentalEl.currentTime = 0;
    this.vocalEl.currentTime        = 0;
    this.vocalEl.playbackRate       = 1;
    this.vocalEl.volume             = 1;
    this.targetVolume               = 1.0;
    this.currentVolume              = 1.0;
    this._vocalMuted = false;
    this.playing     = true;

    this.instrumentalEl.play();
    this.vocalEl.play();
  }

  /**
   * Adjust vocal volume based on accuracy.
   * Modifying pitch via playbackRate causes audio track desynchronization!
   */
  setAccuracyGrade(grade) {
    if (!this.vocalEl || !this.playing || this._vocalMuted) return;
    
    if      (grade === 'PERFECT') this.targetVolume = 1.0;
    else if (grade === 'GREAT')   this.targetVolume = 0.8;
    else if (grade === 'GOOD')    this.targetVolume = 0.5;
  }

  /** Silence vocal (MISS). */
  muteVocal() {
    if (!this.vocalEl || !this.playing || this._vocalMuted) return;
    this._vocalMuted  = true;
    this.targetVolume = 0;
  }

  /** Restore vocal after MISS. */
  unmuteVocal() {
    if (!this.vocalEl || !this.playing || !this._vocalMuted) return;
    this._vocalMuted  = false;
  }

  /** Keep vocal track strictly in sync with instrumental. */
  syncTracks(dt) {
    if (this.playing && this.instrumentalEl && this.vocalEl && !this.instrumentalEl.paused) {
      // 1. Smooth Volume transition (prevents audio zipper noise/clicks)
      this.currentVolume = lerp(this.currentVolume, this.targetVolume, 15 * dt);
      if (Math.abs(this.currentVolume - this.targetVolume) < 0.01) {
        this.currentVolume = this.targetVolume;
      }
      this.vocalEl.volume = clamp(this.currentVolume, 0, 1);

      // 2. Prevent infinite seeking loops
      if (this.vocalEl.seeking || this.instrumentalEl.seeking) return;

      const currentInstTime = this.instrumentalEl.currentTime;
      const currentVocTime = this.vocalEl.currentTime;
      // If tracks drift by more than 100ms, resync the vocal playback 
      if (Math.abs(currentInstTime - currentVocTime) > 0.1) {
        this.vocalEl.currentTime = currentInstTime;
      }
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this.instrumentalEl) this.instrumentalEl.pause();
    if (this.vocalEl)        this.vocalEl.pause();
  }

  resume() {
    if (this.playing) return;
    this.playing = true;
    if (this.instrumentalEl) this.instrumentalEl.play();
    if (this.vocalEl)        this.vocalEl.play();
  }

  stop() {
    this.playing = false;
    if (this.instrumentalEl) { this.instrumentalEl.pause(); this.instrumentalEl.currentTime = 0; }
    if (this.vocalEl)        { this.vocalEl.pause();        this.vocalEl.currentTime        = 0; }
  }
}

// ─── NOTE MANAGER ─────────────────────────────────────────────────────────────
class NoteManager {
  constructor(beatmap, canvas) {
    this.beatmap  = beatmap;
    this.canvas   = canvas;
    this.notes    = []; // active visual note objects
    this.nextIdx  = 0;
  }

  reset() {
    this.notes   = [];
    this.nextIdx = 0;
  }

  /**
   * Spawn notes that should appear now given currentTime.
   * A note spawns NOTE_TRAVEL_SEC seconds before its hit time.
   */
  update(currentTime) {
    const spawnThreshold = currentTime + NOTE_TRAVEL_SEC;
    while (this.nextIdx < this.beatmap.notes.length) {
      const n = this.beatmap.notes[this.nextIdx];
      if (n.time <= spawnThreshold) {
        this.notes.push({
          id:         this.nextIdx,
          hitTime:    n.time,
          y:          n.y,          // normalized 0..1
          duration:   n.duration,
          state:      'active',     // active | hit | miss
          hitGrade:   null,
          spawnTime:  currentTime,
        });
        this.nextIdx++;
      } else {
        break;
      }
    }
  }

  /** Returns note x position in canvas pixels given current time.
   *  Hold notes clamp to playerX once they arrive so the head stays visible. */
  noteX(note, currentTime, canvasW) {
    const playerX   = canvasW * PLAYER_X_RATIO;
    const rightEdge = canvasW + NOTE_RADIUS * 2;
    const t         = (note.hitTime - currentTime) / NOTE_TRAVEL_SEC; // 1=just spawned, 0=at player
    // For hold notes that have arrived, clamp t to 0 so head stays at playerX
    const tClamped  = (note.duration > 0) ? Math.max(0, t) : t;
    return playerX + tClamped * (rightEdge - playerX);
  }

  noteY(note, canvasH) {
    return note.y * canvasH;
  }

  /** How far along a hold note [0..1] */
  holdProgress(note, currentTime) {
    if (note.duration <= 0) return 0;
    return clamp((currentTime - note.hitTime) / note.duration, 0, 1);
  }
}

// ─── PARTICLE SYSTEM ──────────────────────────────────────────────────────────
class ParticleSystem {
  constructor() { this.particles = []; }

  emit(x, y, grade) {
    const colors = {
      PERFECT: ['#facc15','#fde68a','#fbbf24'],
      GREAT:   ['#4ade80','#86efac','#22c55e'],
      GOOD:    ['#60a5fa','#93c5fd','#3b82f6'],
      MISS:    ['#f87171','#fca5a5','#ef4444'],
    };
    const cols = colors[grade] || colors.GOOD;
    const count = grade === 'MISS' ? 6 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randRange(60, 200);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: randRange(1.2, 2.2),
        r: randRange(3, 8),
        color: cols[Math.floor(Math.random() * cols.length)],
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 300 * dt; // gravity
      p.life -= p.decay * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── SCORE SYSTEM ─────────────────────────────────────────────────────────────
class ScoreSystem {
  constructor() { this.reset(); }

  reset() {
    this.score      = 0;
    this.combo      = 0;
    this.maxCombo   = 0;
    this.totNotes   = 0;
    this.hitNotes   = 0;
    this.counts     = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    this.accuracy   = 100;
  }

  getMultiplier() {
    if (this.combo >= 32) return COMBO_MULTIPLIERS[3];
    if (this.combo >= 16) return COMBO_MULTIPLIERS[2];
    if (this.combo >= 8)  return COMBO_MULTIPLIERS[1];
    return COMBO_MULTIPLIERS[0];
  }

  registerHit(grade) {
    this.totNotes++;
    this.counts[grade]++;
    if (grade === 'MISS') {
      this.combo = 0;
    } else {
      this.combo++;
      this.hitNotes++;
      this.score += SCORE_TABLE[grade] * this.getMultiplier();
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const weight  = { PERFECT: 100, GREAT: 67, GOOD: 33, MISS: 0 };
    this.accuracy = this.totNotes === 0 ? 100
      : (this.counts.PERFECT * 100 + this.counts.GREAT * 67 + this.counts.GOOD * 33)
        / (this.totNotes * 100) * 100;
  }

  getGrade() {
    const acc = this.accuracy;
    if (acc >= 99) return 'S';
    if (acc >= 95) return 'A';
    if (acc >= 88) return 'B';
    if (acc >= 75) return 'C';
    return 'D';
  }
}

// ─── BACKGROUND ───────────────────────────────────────────────────────────────
class Background {
  constructor() {
    this.stars = [];
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        r: randRange(0.5, 2.5),
        speed: randRange(0.01, 0.04),
        alpha: randRange(0.3, 1.0),
      });
    }
  }

  update(dt) {
    for (const s of this.stars) {
      s.x -= s.speed * dt;
      if (s.x < 0) { s.x = 1; s.y = Math.random(); }
    }
  }

  draw(ctx, W, H) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.save();
    ctx.strokeStyle = 'rgba(168,85,247,0.04)';
    ctx.lineWidth   = 1;
    const gridSize  = 60;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // Stars
    for (const s of this.stars) {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle   = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Horizontal glow bands (atmosphere)
    const grad = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    grad.addColorStop(0,   'rgba(168,85,247,0.00)');
    grad.addColorStop(0.5, 'rgba(168,85,247,0.03)');
    grad.addColorStop(1,   'rgba(168,85,247,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── RENDERER ─────────────────────────────────────────────────────────────────
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  resize() {
    this.canvas.width  = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  drawPlayerLine(playerY, grade, pulsePhase) {
    const ctx    = this.ctx;
    const W      = this.canvas.width;
    const x      = W * PLAYER_X_RATIO;
    const glowColor = {
      PERFECT: '#facc15', GREAT: '#4ade80', GOOD: '#60a5fa', MISS: '#f87171', null: '#a855f7'
    }[grade] || '#a855f7';

    // Vertical guide line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 12]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Player circle
    const pulse = 1 + 0.12 * Math.sin(pulsePhase);
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 24 * pulse;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x, playerY, NOTE_RADIUS * 1.6 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.4;
    ctx.stroke();

    // Inner filled circle
    const grad = ctx.createRadialGradient(x, playerY, 0, x, playerY, NOTE_RADIUS);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.4, glowColor);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    ctx.arc(x, playerY, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawNote(note, nx, ny, canvasW, canvasH, grade) {
    const ctx = this.ctx;
    if (note.state === 'hit' || note.state === 'miss') return;

    // Hold note tail
    if (note.duration > 0) {
      const tailW = (note.duration / NOTE_TRAVEL_SEC) * (canvasW * (1 - PLAYER_X_RATIO));
      const tailX = nx;
      const tailH = NOTE_RADIUS * 0.8;

      ctx.save();
      const tailGrad = ctx.createLinearGradient(tailX, 0, tailX + tailW, 0);
      tailGrad.addColorStop(0, 'rgba(168,85,247,0.8)');
      tailGrad.addColorStop(1, 'rgba(168,85,247,0.1)');
      ctx.fillStyle = tailGrad;
      ctx.beginPath();
      ctx.roundRect(tailX, ny - tailH / 2, tailW, tailH, tailH / 2);
      ctx.fill();
      ctx.restore();
    }

    // Note circle
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur  = 18;

    const grad = ctx.createRadialGradient(nx - 5, ny - 5, 2, nx, ny, NOTE_RADIUS);
    grad.addColorStop(0, '#f3e8ff');
    grad.addColorStop(0.4, '#c084fc');
    grad.addColorStop(1, '#7c3aed');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(nx, ny, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Rim
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth   = 2; ctx.globalAlpha = 0.7;
    ctx.stroke();

    // Musical note symbol
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${NOTE_RADIUS}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', nx, ny);

    ctx.restore();
  }

  drawJudgement(text, x, y, alpha, grade) {
    const ctx = this.ctx;
    const cols = { PERFECT: '#facc15', GREAT: '#4ade80', GOOD: '#60a5fa', MISS: '#f87171' };
    ctx.save();
    ctx.globalAlpha    = alpha;
    ctx.fillStyle      = cols[grade] || '#fff';
    ctx.shadowColor    = cols[grade] || '#fff';
    ctx.shadowBlur     = 12;
    ctx.font           = `bold 22px 'Orbitron', monospace`;
    ctx.textAlign      = 'left';
    ctx.textBaseline   = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

// ─── GAME ─────────────────────────────────────────────────────────────────────
class RhythmGame {
  constructor() {
    this.canvas   = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.audio    = new AudioEngine();
    this.score    = new ScoreSystem();
    this.particles= new ParticleSystem();
    this.bg       = new Background();

    this.state      = 'idle'; // idle | playing | paused | ended
    this.playerY    = this.canvas.height / 2 || 300;
    this.lastTime   = 0;
    this.pulsePhase = 0;

    this.activeGrade  = null;    // last hit grade for player glow
    this.gradeTimer   = 0;       // seconds to show grade text

    // Judgement popups
    this.judgements   = [];      // [{text, x, y, grade, life}]

    // Beatmap
    this.beatmap    = DEMO_BEATMAP;
    this.notesMgr   = new NoteManager(this.beatmap, this.canvas);

    // Processed notes for hold tracking
    this._holdActive = {};       // noteId → bool

    // Last non-MISS grade — used to determine whether to unmute vocal
    this._lastHitGrade = null;

    this._bindEvents();
    this._loop = this._loop.bind(this);
  }

  // ── EVENTS ────────────────────────────────────────────────────────────────
  _bindEvents() {
    // Mouse move
    document.addEventListener('mousemove', e => {
      const rect    = this.canvas.getBoundingClientRect();
      this.playerY  = clamp(e.clientY - rect.top, 0, this.canvas.height);
    });

    // Touch support (for mobile / RPG Maker compat)
    document.addEventListener('touchmove', e => {
      e.preventDefault();
      const rect   = this.canvas.getBoundingClientRect();
      const touch  = e.touches[0];
      this.playerY = clamp(touch.clientY - rect.top, 0, this.canvas.height);
    }, { passive: false });

    // Start button
    document.getElementById('btn-start').addEventListener('click', () => this._onStart());

    // Restart button
    document.getElementById('btn-restart').addEventListener('click', () => this._onRestart());

    // Pause button (HUD)
    document.getElementById('btn-pause').addEventListener('click', () => this._onPause());

    // Resume button (pause screen)
    document.getElementById('btn-resume').addEventListener('click', () => this._onResume());

    // Quit to menu button (pause screen)
    document.getElementById('btn-quit').addEventListener('click', () => this._onQuit());

    // Escape key toggles pause
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (this.state === 'playing') this._onPause();
        else if (this.state === 'paused')  this._onResume();
      }
    });

    // Resize
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.playerY = clamp(this.playerY, 0, this.canvas.height);
    });
  }

  _onStart() {
    showScreen('screen-game');
    this.renderer.resize();
    this.score.reset();
    this.notesMgr.reset();
    this.particles.particles = [];
    this.judgements = [];
    this._holdActive = {};
    this._lastHitGrade = null;
    this.state = 'playing';

    // Start both tracks (native HTMLAudioElement — works with file://)
    this.audio.start();

    // End game when the song finishes naturally
    this.audio.instrumentalEl.addEventListener('ended', () => {
      if (this.state === 'playing' || this.state === 'paused') {
        this._endGame();
      }
    }, { once: true });

    this.lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  _onPause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.pause();
    // Show pause overlay on top of game screen (game screen stays visible behind)
    document.getElementById('screen-pause').classList.add('active');
  }

  _onResume() {
    if (this.state !== 'paused') return;
    document.getElementById('screen-pause').classList.remove('active');
    this.state = 'playing';
    this.audio.resume();
    // Re-anchor lastTime so dt doesn't spike after the pause
    this.lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  _onQuit() {
    this.audio.stop();
    document.getElementById('screen-pause').classList.remove('active');
    this.state = 'idle';
    showScreen('screen-start');
  }

  _onRestart() {
    this.audio.stop();
    showScreen('screen-start');
    this.state = 'idle';
  }

  // ── GAME LOOP ─────────────────────────────────────────────────────────────
  _loop(now) {
    if (this.state !== 'playing') return;

    const dt        = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime   = now;
    this.pulsePhase += dt * 4;

    const ct = this.audio.currentTime;

    // Actively keep audio tracks synchronized
    this.audio.syncTracks(dt);

    // Update subsystems
    this.bg.update(dt);
    this.notesMgr.update(ct);
    this._updateHitDetection(ct);
    this._updateJudgements(dt);
    this.particles.update(dt);
    this._updateHUD();

    // Grade timer
    if (this.gradeTimer > 0) this.gradeTimer -= dt;
    else this.activeGrade = null;

    // Draw
    this._draw(ct);

    requestAnimationFrame(this._loop);
  }

  // ── HIT DETECTION ─────────────────────────────────────────────────────────
  _updateHitDetection(ct) {
    const canvasH = this.canvas.height;
    const canvasW = this.canvas.width;
    const playerX = canvasW * PLAYER_X_RATIO;

    for (const note of this.notesMgr.notes) {
      if (note.state !== 'active') continue;

      const ny = this.notesMgr.noteY(note, canvasH);

      // ── HOLD NOTES ──────────────────────────────────────────────────────────
      if (note.duration > 0) {
        const holdStarted = ct >= note.hitTime;
        const holdEnded   = ct >= note.hitTime + note.duration;

        if (holdStarted && !holdEnded) {
          // Accumulate per-frame Y-accuracy samples during the hold
          if (!note._holdSamples) note._holdSamples = [];
          const liveDelta = Math.abs(this.playerY - ny) / canvasH;
          note._holdSamples.push(liveDelta);

          // ── Real-time vocal volume update ──────────────────────────
          // Determine which zone the player is in now
          let liveZone;
          if      (liveDelta < HIT_WINDOW_Y.PERFECT) liveZone = 'PERFECT';
          else if (liveDelta < HIT_WINDOW_Y.GREAT)   liveZone = 'GREAT';
          else if (liveDelta < HIT_WINDOW_Y.GOOD)    liveZone = 'GOOD';
          else                                        liveZone = 'MISS';

          // Update vocal feedback when the live zone changes
          if (liveZone !== note._lastLiveZone) {
            note._lastLiveZone = liveZone;
            if (liveZone !== 'MISS') {
              this.audio.unmuteVocal();
              this.audio.setAccuracyGrade(liveZone);
            } else {
              this.audio.muteVocal();
            }
          }
          continue; // don't apply miss check while holding
        }

        if (holdEnded && !note._evaluated) {
          note._evaluated = true;
          note.state = 'hit';
          // Grade based on average accuracy during the hold
          let avgDelta;
          if (note._holdSamples && note._holdSamples.length > 0) {
            avgDelta = note._holdSamples.reduce((a, b) => a + b, 0) / note._holdSamples.length;
          } else {
            // Note was never held (player missed the start) — grade by current distance
            avgDelta = Math.abs(this.playerY - ny) / canvasH;
          }
          let grade;
          if      (avgDelta < HIT_WINDOW_Y.PERFECT) grade = 'PERFECT';
          else if (avgDelta < HIT_WINDOW_Y.GREAT)   grade = 'GREAT';
          else if (avgDelta < HIT_WINDOW_Y.GOOD)    grade = 'GOOD';
          else                                        grade = 'MISS';
          this._judge(note, grade, playerX, ny);
          continue;
        }

        // Hold note approaching: apply miss check if it has scrolled fully past without starting
        if (!holdStarted) {
          const nx = this.notesMgr.noteX(note, ct, canvasW);
          if (nx < playerX - NOTE_RADIUS * 2) {
            // Arrived but hold never started — count as miss
            note._evaluated = true;
            note.state = 'miss';
            this._judge(note, 'MISS', playerX, ny);
          }
        }
        continue;
      }

      // ── TAP NOTES ───────────────────────────────────────────────────────────
      const nx = this.notesMgr.noteX(note, ct, canvasW);

      // Miss: tap note passed player line without being hit
      const pastPlayerX = playerX - NOTE_RADIUS * 2;
      if (nx < pastPlayerX) {
        if (!note._evaluated) {
          note._evaluated = true;
          note.state = 'miss';
          this._judge(note, 'MISS', pastPlayerX, ny);
        }
        continue;
      }

      // Evaluate tap when note enters the hit zone
      const distX    = Math.abs(nx - playerX);
      const hitZoneX = NOTE_RADIUS * 2.5;
      if (distX < hitZoneX && !note._evaluated) {
        note._evaluated = true;
        const deltaY = Math.abs(this.playerY - ny) / canvasH;
        let grade;
        if      (deltaY < HIT_WINDOW_Y.PERFECT) grade = 'PERFECT';
        else if (deltaY < HIT_WINDOW_Y.GREAT)   grade = 'GREAT';
        else if (deltaY < HIT_WINDOW_Y.GOOD)    grade = 'GOOD';
        else                                      grade = 'MISS';
        note.state = grade === 'MISS' ? 'miss' : 'hit';
        this._judge(note, grade, playerX, ny);
      }
    }
  }

  _judge(note, grade, x, y) {
    this.score.registerHit(grade);
    this.activeGrade = grade;
    this.gradeTimer  = 0.6;

    const labels = { PERFECT: '✶ PERFECT', GREAT: '✶ GREAT', GOOD: 'GOOD', MISS: 'MISS' };
    this.judgements.push({
      text:  labels[grade],
      x:     x + 24,
      y:     y,
      grade: grade,
      life:  1.0,
      vy:    -60,
    });

    // ── Vocal control ──────────────────────────────────────────────
    if (grade === 'MISS') {
      this.audio.muteVocal();
    } else {
      // Unmute if it was silenced by a previous MISS
      this.audio.unmuteVocal();
      this.audio.setAccuracyGrade(grade);
    }

    this._lastHitGrade = grade;

    if (grade !== 'MISS') {
      this.particles.emit(x, y, grade);
    }
  }

  _updateJudgements(dt) {
    for (const j of this.judgements) {
      j.y    += j.vy * dt;
      j.life -= dt * 1.8;
    }
    this.judgements = this.judgements.filter(j => j.life > 0);
  }

  // ── HUD UPDATE ────────────────────────────────────────────────────────────
  _updateHUD() {
    document.getElementById('score-value').textContent =
      this.score.score.toLocaleString();
    document.getElementById('combo-value').textContent =
      this.score.combo > 0 ? `×${this.score.combo}` : '—';
    const acc = this.score.accuracy.toFixed(1);
    document.getElementById('accuracy-text').textContent = `${acc}%`;
    document.getElementById('accuracy-bar-fill').style.width = `${acc}%`;
  }

  // ── DRAW ──────────────────────────────────────────────────────────────────
  _draw(ct) {
    const ctx  = this.renderer.ctx;
    const W    = this.canvas.width;
    const H    = this.canvas.height;

    this.bg.draw(ctx, W, H);

    // Notes
    for (const note of this.notesMgr.notes) {
      const nx = this.notesMgr.noteX(note, ct, W);
      const ny = this.notesMgr.noteY(note, H);
      this.renderer.drawNote(note, nx, ny, W, H);
    }

    // Particles
    this.particles.draw(ctx);

    // Player
    this.renderer.drawPlayerLine(this.playerY, this.activeGrade, this.pulsePhase);

    // Judgement popups
    for (const j of this.judgements) {
      this.renderer.drawJudgement(j.text, j.x, j.y, j.life, j.grade);
    }

    // Song progress bar
    this._drawProgressBar(ctx, ct, W, H);
  }

  _drawProgressBar(ctx, ct, W, H) {
    // Use actual audio duration when available, otherwise fall back to last note
    const audioDuration = this.audio.instrumentalEl
      ? this.audio.instrumentalEl.duration
      : null;
    const lastNote = this.beatmap.notes[this.beatmap.notes.length - 1];
    const total = (audioDuration && isFinite(audioDuration))
      ? audioDuration
      : (lastNote ? lastNote.time + lastNote.duration + 0.5 : 60);
    const prog     = clamp(ct / total, 0, 1);
    const barH     = 4;
    const y        = H - barH;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, y, W, barH);

    const grad = ctx.createLinearGradient(0, 0, W * prog, 0);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#22d3ee');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, W * prog, barH);
  }

  // ── END GAME ──────────────────────────────────────────────────────────────
  _endGame() {
    this.audio.stop();
    this.state = 'ended';

    document.getElementById('res-score').textContent    = this.score.score.toLocaleString();
    document.getElementById('res-accuracy').textContent = `${this.score.accuracy.toFixed(1)}%`;
    document.getElementById('res-combo').textContent    = this.score.maxCombo;
    document.getElementById('res-perfect').textContent  = this.score.counts.PERFECT;
    document.getElementById('res-great').textContent    = this.score.counts.GREAT;
    document.getElementById('res-good').textContent     = this.score.counts.GOOD;
    document.getElementById('res-miss').textContent     = this.score.counts.MISS;
    document.getElementById('result-grade').textContent = this.score.getGrade();

    // Grade color
    const gradeColors = { S:'#facc15', A:'#4ade80', B:'#60a5fa', C:'#fb923c', D:'#f87171' };
    const g = this.score.getGrade();
    document.getElementById('result-grade').style.background =
      `linear-gradient(135deg, ${gradeColors[g] || '#fff'}, #fff)`;

    showScreen('screen-result');
  }
}

// ─── SCREEN HELPERS ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  new RhythmGame();
});
