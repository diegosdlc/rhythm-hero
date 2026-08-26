(function (global) {
  'use strict';

  const RH = global.RhythmHero = global.RhythmHero || {};

  class StandaloneTransport {
    send(message) {
      console.info('[MinigameBridge]', message);
      global.dispatchEvent(new CustomEvent('minigame:message', { detail: message }));
    }
  }

  class UnrealTransport {
    isAvailable() {
      return !!(global.unrealBridge && typeof global.unrealBridge.receiveFromMinigame === 'function');
    }
    send(message) {
      if (!this.isAvailable()) throw new Error('Unreal bridge is not available');
      global.unrealBridge.receiveFromMinigame(JSON.stringify(message));
    }
  }

  class MinigameBridge {
    constructor(options) {
      const unreal = new UnrealTransport();
      this.transport = options && options.transport ? options.transport : (unreal.isAvailable() ? unreal : new StandaloneTransport());
      this.gameId = (options && options.gameId) || 'rhythm-hero';
      this.protocolVersion = 1;
      this.sessionId = null;
      this.levelId = null;
      this.commandHandlers = new Map();
      global.rhythmHeroReceiveFromHost = raw => this.receive(raw);
    }
    begin(levelId) {
      this.sessionId = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      this.levelId = levelId;
      this.emit('game.ready', { levelId }, 0);
    }
    emit(type, payload, gameTime) {
      const message = {
        protocolVersion: this.protocolVersion,
        gameId: this.gameId,
        sessionId: this.sessionId,
        levelId: this.levelId,
        type,
        gameTime: Number(gameTime || 0),
        payload: payload || {}
      };
      this.transport.send(message);
      return message;
    }
    on(command, handler) { this.commandHandlers.set(command, handler); }
    receive(raw) {
      let message = raw;
      if (typeof raw === 'string') {
        try { message = JSON.parse(raw); } catch (err) { console.error('[MinigameBridge] Invalid host JSON', err); return; }
      }
      if (!message || !message.type) return;
      const handler = this.commandHandlers.get(message.type);
      if (handler) handler(message.payload || {}, message);
    }
  }

  RH.StandaloneTransport = StandaloneTransport;
  RH.UnrealTransport = UnrealTransport;
  RH.MinigameBridge = MinigameBridge;
})(window);
