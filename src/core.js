(function (global) {
  'use strict';

  const RH = global.RhythmHero = global.RhythmHero || {};

  const ACTIONS = Object.freeze({
    PITCH: 'PITCH',
    NAV_PREVIOUS: 'NAV_PREVIOUS', NAV_NEXT: 'NAV_NEXT', CONFIRM: 'CONFIRM',
    OPTION_1: 'OPTION_1', OPTION_2: 'OPTION_2', OPTION_3: 'OPTION_3', OPTION_4: 'OPTION_4',
    PAUSE: 'PAUSE'
  });

  const WINDOWS = { PERFECT: 0.03, GREAT: 0.07, GOOD: 0.12 };
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
        state: 'pending', pitchSamples: [], liveGrade: null, judged: false
      }));
      this.isOnPitch = false;
      this.liveGrade = null;
    }
    _targetPitch(note) {
      if (Number.isFinite(note.y)) return clamp(note.y, 0, 1);
      const index = Math.max(0, Number(String(note.note || '').split('_')[1]) - 1 || 0);
      return clamp((index + 0.5) / 7, 0, 1);
    }
    update(time, pitch) {
      this.isOnPitch = false;
      this.liveGrade = null;
      const currentPitch = clamp(Number.isFinite(pitch) ? pitch : 0.5, 0, 1);
      const gradeRank = { PERFECT: 3, GREAT: 2, GOOD: 1, MISS: 0 };

      for (const note of this.notes) {
        if (note.judged || time < note.time) continue;
        const duration = Math.max(0, Number(note.duration) || 0);
        const target = this._targetPitch(note);

        if (duration === 0) {
          const grade = gradeForDelta(currentPitch - target);
          note.state = grade === 'MISS' ? 'miss' : 'hit';
          this._judge(note, grade, time);
          continue;
        }

        if (time < note.time + duration) {
          const delta = Math.abs(currentPitch - target);
          const grade = gradeForDelta(delta);
          note.pitchSamples.push(delta);
          note.liveGrade = grade;
          note.state = grade === 'MISS' ? 'active' : 'holding';
          if (grade !== 'MISS') this.isOnPitch = true;
          if (!this.liveGrade || gradeRank[grade] > gradeRank[this.liveGrade]) this.liveGrade = grade;
          continue;
        }

        const averageDelta = note.pitchSamples.length
          ? note.pitchSamples.reduce((sum, value) => sum + value, 0) / note.pitchSamples.length
          : Infinity;
        const grade = gradeForDelta(averageDelta);
        note.state = grade === 'MISS' ? 'miss' : 'hit';
        this._judge(note, grade, time);
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
      const directOption = /^OPTION_(\d)$/.exec(action);
      if (directOption) {
        const option = options[Number(directOption[1]) - 1];
        if (option) this.resolve(event, option.id, time);
        return;
      }
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
      this.pitch = 0.5;
      this.lastJudgement = null;
      this.rhythm = new RhythmSystem(level.notes, this.score, j => this._onJudge(j));
      this.interruptions = new InterruptionSystem(level.events, (type, payload) => this.bridge.emit(type, payload, this.now()));
    }
    now() { return this.clock.now(); }
    start() {
      this.score.reset(); this.rhythm.reset(); this.interruptions.reset();
      this.pitch = 0.5;
      this.lastJudgement = null; this.state = 'playing';
      this.clock.start();
      this.bridge.begin(this.level.id);
      this.bridge.emit('game.started', { levelId: this.level.id }, 0);
    }
    pause() { if (this.state === 'playing') { this.state = 'paused'; this.clock.pause(); this.bridge.emit('game.paused', {}, this.now()); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; this.clock.resume(); this.bridge.emit('game.resumed', {}, this.now()); } }
    handleInput(evt) {
      if (evt.action === ACTIONS.PITCH) {
        this.pitch = clamp(Number.isFinite(evt.pitch) ? evt.pitch : this.pitch, 0, 1);
        return;
      }
      if (evt.action === ACTIONS.PAUSE && evt.phase === 'pressed') { this.state === 'playing' ? this.pause() : this.resume(); return; }
      if (this.state !== 'playing') return;
      this.interruptions.handleAction(evt.action, evt.phase, evt.timestamp);
    }
    update() {
      if (this.state !== 'playing') return;
      const t = this.now();
      this.clock.sync();
      this.rhythm.update(t, this.pitch);
      this.clock.setVocalFeedback(this.rhythm.liveGrade || 'MISS');
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
