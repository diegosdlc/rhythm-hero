(function (global) {
  'use strict';

  const RH = global.RhythmHero = global.RhythmHero || {};

  const ACTIONS = Object.freeze({
    NOTE_1: 'NOTE_1', NOTE_2: 'NOTE_2', NOTE_3: 'NOTE_3', NOTE_4: 'NOTE_4',
    NOTE_5: 'NOTE_5', NOTE_6: 'NOTE_6', NOTE_7: 'NOTE_7',
    NAV_PREVIOUS: 'NAV_PREVIOUS', NAV_NEXT: 'NAV_NEXT', CONFIRM: 'CONFIRM', PAUSE: 'PAUSE'
  });

  const WINDOWS = { PERFECT: 0.05, GREAT: 0.10, GOOD: 0.16 };
  const SCORE = { PERFECT: 300, GREAT: 200, GOOD: 100, MISS: 0 };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function gradeForDelta(delta) {
    const d = Math.abs(delta);
    if (d <= WINDOWS.PERFECT) return 'PERFECT';
    if (d <= WINDOWS.GREAT) return 'GREAT';
    if (d <= WINDOWS.GOOD) return 'GOOD';
    return 'MISS';
  }

  class BrowserAudioClock {
    constructor(instrumentalId, vocalId) {
      this.instrumental = document.getElementById(instrumentalId);
      this.vocal = document.getElementById(vocalId);
      this.playing = false;
    }
    now() { return this.instrumental ? this.instrumental.currentTime : 0; }
    duration() { return this.instrumental && isFinite(this.instrumental.duration) ? this.instrumental.duration : 0; }
    start() {
      this.instrumental.currentTime = 0;
      this.vocal.currentTime = 0;
      this.instrumental.play();
      this.vocal.play();
      this.playing = true;
    }
    pause() { this.playing = false; this.instrumental.pause(); this.vocal.pause(); }
    resume() { this.playing = true; this.instrumental.play(); this.vocal.play(); }
    stop() {
      this.playing = false;
      this.instrumental.pause(); this.vocal.pause();
      this.instrumental.currentTime = 0; this.vocal.currentTime = 0;
    }
    sync() {
      if (!this.playing || this.instrumental.paused || this.vocal.seeking || this.instrumental.seeking) return;
      if (Math.abs(this.instrumental.currentTime - this.vocal.currentTime) > 0.1) {
        this.vocal.currentTime = this.instrumental.currentTime;
      }
    }
    setVocalFeedback(grade) {
      const levels = { PERFECT: 1, GREAT: 0.82, GOOD: 0.55, MISS: 0.12 };
      this.vocal.volume = levels[grade] == null ? 1 : levels[grade];
    }
  }

  class ScoreSystem {
    constructor() { this.reset(); }
    reset() {
      this.score = 0; this.combo = 0; this.maxCombo = 0; this.total = 0;
      this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    }
    register(grade) {
      this.total++;
      this.counts[grade]++;
      if (grade === 'MISS') this.combo = 0;
      else { this.combo++; this.score += SCORE[grade]; }
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    accuracy() {
      if (!this.total) return 1;
      const weighted = this.counts.PERFECT + this.counts.GREAT * 0.67 + this.counts.GOOD * 0.33;
      return weighted / this.total;
    }
    snapshot() {
      return { score: this.score, combo: this.combo, maxCombo: this.maxCombo, accuracy: this.accuracy(), counts: Object.assign({}, this.counts) };
    }
  }

  class RhythmSystem {
    constructor(notes, score, onJudge) {
      this.sourceNotes = notes || [];
      this.score = score;
      this.onJudge = onJudge || function () {};
      this.reset();
    }
    reset() {
      this.notes = this.sourceNotes.map((n, i) => Object.assign({ id: n.id || `n${i}`, duration: 0 }, n, {
        state: 'pending', startedAt: null, releasedAt: null, startGrade: null
      }));
    }
    handleAction(action, phase, time) {
      if (!action || action.indexOf('NOTE_') !== 0) return;
      if (phase === 'pressed') this._press(action, time);
      else if (phase === 'released') this._release(action, time);
    }
    _press(action, time) {
      const candidates = this.notes.filter(n => n.note === action && n.state === 'pending' && Math.abs(n.time - time) <= WINDOWS.GOOD);
      if (!candidates.length) return;
      candidates.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time));
      const note = candidates[0];
      const grade = gradeForDelta(time - note.time);
      note.startGrade = grade;
      if (note.duration > 0) {
        note.state = 'holding';
        note.startedAt = time;
      } else {
        note.state = grade === 'MISS' ? 'miss' : 'hit';
        this._judge(note, grade, time);
      }
    }
    _release(action, time) {
      const active = this.notes.find(n => n.note === action && n.state === 'holding');
      if (!active) return;
      active.releasedAt = time;
      const targetEnd = active.time + active.duration;
      const heldFraction = clamp((time - active.time) / active.duration, 0, 1);
      let grade = active.startGrade;
      if (heldFraction < 0.55) grade = 'MISS';
      else if (heldFraction < 0.8 && grade !== 'MISS') grade = 'GOOD';
      else if (Math.abs(time - targetEnd) > 0.18 && grade === 'PERFECT') grade = 'GREAT';
      active.state = grade === 'MISS' ? 'miss' : 'hit';
      this._judge(active, grade, time);
    }
    update(time) {
      for (const note of this.notes) {
        if (note.state === 'pending' && time > note.time + WINDOWS.GOOD) {
          note.state = 'miss'; this._judge(note, 'MISS', time);
        } else if (note.state === 'holding' && time > note.time + note.duration + 0.2) {
          note.state = 'hit'; this._judge(note, note.startGrade || 'GOOD', time);
        }
      }
    }
    _judge(note, grade, time) {
      if (note.judged) return;
      note.judged = true;
      this.score.register(grade);
      this.onJudge({ note, grade, time });
    }
    activeState(time, horizon) {
      const h = horizon == null ? 2.5 : horizon;
      return this.notes.filter(n => n.time + n.duration >= time - 0.25 && n.time <= time + h);
    }
    isComplete() { return this.notes.every(n => n.judged); }
  }

  class InterruptionSystem {
    constructor(events, emit) {
      this.sourceEvents = events || [];
      this.emit = emit || function () {};
      this.reset();
    }
    reset() {
      this.events = this.sourceEvents.map(e => Object.assign({}, e, { state: 'scheduled', selectedIndex: 0 }));
      this.active = [];
      this.decisions = {};
    }
    update(time) {
      for (const event of this.events) {
        if (event.state === 'scheduled' && time >= event.time) {
          event.state = 'active';
          event.startedAt = time;
          this.active.push(event);
          this.emit('interruption.started', { id: event.id, type: event.type });
        }
        if (event.state === 'active' && event.timeout && time >= event.startedAt + event.timeout) {
          this.resolve(event, 'timeout', time);
        }
      }
      this.active = this.active.filter(e => e.state === 'active');
    }
    current() { return this.active[this.active.length - 1] || null; }
    handleAction(action, phase, time) {
      if (phase !== 'pressed') return;
      const event = this.current();
      if (!event) return;
      const options = event.options || [];
      if (action === ACTIONS.NAV_PREVIOUS && options.length) event.selectedIndex = (event.selectedIndex - 1 + options.length) % options.length;
      if (action === ACTIONS.NAV_NEXT && options.length) event.selectedIndex = (event.selectedIndex + 1) % options.length;
      if (action === ACTIONS.CONFIRM) {
        const choice = options.length ? options[event.selectedIndex].id : 'dismissed';
        this.resolve(event, choice, time);
      }
    }
    choose(eventId, choiceId, time) {
      const event = this.active.find(e => e.id === eventId);
      if (event) this.resolve(event, choiceId, time);
    }
    resolve(event, choiceId, time) {
      if (!event || event.state !== 'active') return;
      event.state = 'resolved';
      event.resolvedAt = time;
      this.decisions[event.id] = choiceId;
      this.emit('decision.made', { decisionId: event.id, choiceId, type: event.type });
      this.emit('interruption.resolved', { id: event.id, choiceId });
    }
  }

  class GameSession {
    constructor(level, clock, bridge) {
      this.level = level;
      this.clock = clock;
      this.bridge = bridge;
      this.score = new ScoreSystem();
      this.state = 'idle';
      this.lastJudgement = null;
      this.rhythm = new RhythmSystem(level.notes, this.score, j => this._onJudge(j));
      this.interruptions = new InterruptionSystem(level.events, (type, payload) => this.bridge.emit(type, payload, this.now()));
    }
    now() { return this.clock.now(); }
    start() {
      this.score.reset(); this.rhythm.reset(); this.interruptions.reset();
      this.lastJudgement = null; this.state = 'playing';
      this.clock.start();
      this.bridge.begin(this.level.id);
      this.bridge.emit('game.started', { levelId: this.level.id }, 0);
    }
    pause() { if (this.state === 'playing') { this.state = 'paused'; this.clock.pause(); this.bridge.emit('game.paused', {}, this.now()); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; this.clock.resume(); this.bridge.emit('game.resumed', {}, this.now()); } }
    handleInput(evt) {
      if (evt.action === ACTIONS.PAUSE && evt.phase === 'pressed') { this.state === 'playing' ? this.pause() : this.resume(); return; }
      if (this.state !== 'playing') return;
      this.rhythm.handleAction(evt.action, evt.phase, evt.timestamp);
      this.interruptions.handleAction(evt.action, evt.phase, evt.timestamp);
    }
    update() {
      if (this.state !== 'playing') return;
      const t = this.now();
      this.clock.sync();
      this.rhythm.update(t);
      this.interruptions.update(t);
      const duration = this.clock.duration();
      if ((duration && t >= duration - 0.05) || (this.rhythm.isComplete() && duration && t > duration - 1)) this.complete();
    }
    _onJudge(j) {
      this.lastJudgement = j;
      this.clock.setVocalFeedback(j.grade);
      this.bridge.emit('score.updated', this.score.snapshot(), j.time);
    }
    complete() {
      if (this.state === 'completed') return;
      this.state = 'completed';
      const payload = this.snapshot();
      this.clock.stop();
      this.bridge.emit('game.completed', payload, this.now());
    }
    snapshot() {
      return {
        levelId: this.level.id,
        rhythm: this.score.snapshot(),
        decisions: Object.assign({}, this.interruptions.decisions)
      };
    }
  }

  RH.ACTIONS = ACTIONS;
  RH.WINDOWS = WINDOWS;
  RH.BrowserAudioClock = BrowserAudioClock;
  RH.ScoreSystem = ScoreSystem;
  RH.RhythmSystem = RhythmSystem;
  RH.InterruptionSystem = InterruptionSystem;
  RH.GameSession = GameSession;
})(window);
