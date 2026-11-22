import type { AmbientSoundProfile, GamePhase, GameSettings } from '../engine/types';

/**
 * 100% procedural Web Audio API soundscape director.
 * Zero external audio file 404s. Starts strictly after user gesture.
 * Supports room-specific acoustics, "The House Goes Silent" dramatic drop,
 * Revelation bronze bell, door creaks, dice rolls, and live accessibility captions.
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private tickTimer: number | null = null;

  private settings: GameSettings;
  private currentProfile: AmbientSoundProfile = 'hearth';
  private currentPhase: GamePhase = 'exploration';
  private currentPressure = 10;
  private onCaption?: (text: string) => void;
  private silencedUntil = 0;

  constructor(settings: GameSettings, onCaption?: (text: string) => void) {
    this.settings = { ...settings };
    this.onCaption = onCaption;
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.ambientGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();

    this.ambientGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.applyVolumes();
    this.startAmbientBed();
    this.startPeriodicDetails();
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.ambientGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    const horrorScale = this.settings.reducedHorror ? 0.55 : 1.0;

    this.masterGain.gain.setTargetAtTime(master, now, 0.12);
    this.ambientGain.gain.setTargetAtTime(this.settings.ambientVolume * 0.25 * horrorScale, now, 0.2);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume * 0.24 * horrorScale, now, 0.2);
  }

  private emitCaption(text: string): void {
    if (this.settings.captionsEnabled && this.onCaption) {
      this.onCaption(text);
    }
  }

  private startAmbientBed(): void {
    if (!this.ctx || !this.ambientGain) return;
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.connect(this.ambientGain);

    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = 'triangle';
    this.droneOsc.frequency.value = 55; // A1 low warm room tone

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.value = 82.4; // E2 fifth

    const g1 = this.ctx.createGain();
    g1.gain.value = 0.24;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.14;

    this.droneOsc.connect(g1).connect(this.droneFilter);
    this.droneOsc2.connect(g2).connect(this.droneFilter);
    this.droneOsc.start();
    this.droneOsc2.start();
  }

  private startPeriodicDetails(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => {
      if (!this.ctx || this.settings.muted || Date.now() < this.silencedUntil) return;
      if (this.ctx.state !== 'running') return;

      if (this.currentProfile === 'clockwork') {
        this.playClockTick();
      } else if (this.currentProfile === 'musicbox' && Math.random() < 0.45) {
        this.playMusicBoxNote();
      } else if (this.currentProfile === 'water' && Math.random() < 0.4) {
        this.playWaterDrip();
      } else if (Math.random() < 0.28) {
        this.playHouseCreak();
      }
    }, 2400);
  }

  public setRoomAtmosphere(profile: AmbientSoundProfile, phase: GamePhase, pressure: number): void {
    this.currentProfile = profile;
    this.currentPhase = phase;
    this.currentPressure = pressure;

    if (!this.ctx || !this.droneOsc || !this.droneOsc2 || !this.droneFilter) return;
    const now = this.ctx.currentTime;
    const baseFreq =
      phase === 'revelation'
        ? 46.25 // F#1 tense drone
        : profile === 'void'
          ? 41.2
          : profile === 'sacred'
            ? 65.4
            : 55;
    const secondFreq = phase === 'revelation' ? baseFreq * 1.414 : baseFreq * 1.5; // tritone in Revelation, fifth in Exploration
    const cutoff = 140 + Math.min(320, pressure * 3);

    this.droneOsc.frequency.setTargetAtTime(baseFreq, now, 0.8);
    this.droneOsc2.frequency.setTargetAtTime(secondFreq, now, 0.8);
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, 0.8);
  }

  /**
   * WOW FEATURE 4: THE HOUSE GOES SILENT
   * Drops ambient bed to absolute zero for 1.3s, then rings a single deliberate sound.
   */
  public triggerHouseGoesSilent(followWithBell = true): void {
    this.unlock();
    this.silencedUntil = Date.now() + 2600;
    this.emitCaption('[The mansion falls abruptly silent...]');

    if (!this.ctx || !this.ambientGain || this.settings.muted) {
      if (followWithBell) {
        window.setTimeout(() => this.emitCaption('[A single distant bronze bell tolls.]'), 1200);
      }
      return;
    }

    const now = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(0.0001, now, 0.04);

    window.setTimeout(() => {
      if (followWithBell) {
        this.playBronzeBell();
      } else {
        this.playHouseCreak();
      }
      window.setTimeout(() => this.applyVolumes(), 1400);
    }, 1150);
  }

  public playCue(
    cue:
      | 'door'
      | 'dice'
      | 'ghost'
      | 'omen'
      | 'revelation'
      | 'clue'
      | 'silence_bell'
      | 'step'
      | 'item'
      | 'ending'
      | 'hover_tick'
      | 'piece_place'
      | 'card_deal'
      | 'turn_bell'
  ): void {
    if (cue !== 'hover_tick') {
      this.unlock();
    }
    switch (cue) {
      case 'hover_tick':
        this.playHoverTick();
        break;
      case 'piece_place':
        this.playPiecePlace();
        break;
      case 'card_deal':
        this.playCardDeal();
        break;
      case 'turn_bell':
        this.playTurnChime();
        break;
      case 'door':
        this.playDoorCreak();
        this.emitCaption('[Heavy oak door swings open on iron hinges.]');
        break;
      case 'dice':
        this.playDiceRoll();
        this.emitCaption('[Ivory dice clatter across walnut.]');
        break;
      case 'ghost':
        this.playGhostWhisper();
        this.emitCaption('[Cold spectral resonance ripples through the room.]');
        break;
      case 'omen':
        this.playOmenChord();
        this.emitCaption('[A low, ominous chord vibrates through the floorboards.]');
        break;
      case 'revelation':
        this.triggerHouseGoesSilent(true);
        break;
      case 'silence_bell':
        this.triggerHouseGoesSilent(true);
        break;
      case 'clue':
        this.playClueChime();
        this.emitCaption('[A crisp brass chime marks a discovery.]');
        break;
      case 'step':
        this.playPiecePlace();
        break;
      case 'item':
        this.playClueChime(523.25);
        break;
      case 'ending':
        this.playBronzeBell(0.9);
        this.emitCaption('[The mansion’s final bell echoes into the night.]');
        break;
    }
  }

  private playHoverTick(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.022);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.024);
    osc.connect(gain).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.028);
  }

  private playPiecePlace(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    // Weighted carved-wood tabletop pawn thud + crisp felt-rim knock
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(165, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(62, now + 0.075);
    bodyGain.gain.setValueAtTime(0.32, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    bodyOsc.connect(bodyGain).connect(this.musicGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.095);

    const knockOsc = this.ctx.createOscillator();
    const knockGain = this.ctx.createGain();
    knockOsc.type = 'triangle';
    knockOsc.frequency.setValueAtTime(520, now);
    knockOsc.frequency.exponentialRampToValueAtTime(190, now + 0.028);
    knockGain.gain.setValueAtTime(0.16, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    knockOsc.connect(knockGain).connect(this.musicGain);
    knockOsc.start(now);
    knockOsc.stop(now + 0.036);
  }

  private playCardDeal(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.14);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.12);
    filter.Q.value = 1.6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    src.connect(filter).connect(gain).connect(this.musicGain);
    src.start(now);
  }

  private playTurnChime(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    [329.63, 440].forEach((freq, i) => {
      if (!this.ctx || !this.musicGain) return;
      const t = now + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  private playDoorCreak(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(168, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.72);

    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 6;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);

    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  private playDiceRoll(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240 + i * 65, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.045);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  private playBronzeBell(scale = 1): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const partials = [196, 392, 466.16, 587.33]; // moody minor bell overtones
    partials.forEach((freq, i) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * scale;
      const amp = (0.35 / (i + 1)) * (this.settings.reducedHorror ? 0.65 : 1);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 3.2 - i * 0.45);
      osc.connect(gain).connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 3.4);
    });
  }

  private playGhostWhisper(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.9;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(1280, now + 0.45);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.9);
    filter.Q.value = 5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    noise.connect(filter).connect(gain).connect(this.musicGain);
    noise.start(now);
  }

  private playOmenChord(): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    [146.83, 174.61, 207.65].forEach((freq) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      osc.connect(gain).connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 1.85);
    });
  }

  private playClueChime(root = 440): void {
    if (!this.ctx || !this.musicGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    [root, root * 1.25, root * 1.5].forEach((freq, idx) => {
      if (!this.ctx || !this.musicGain) return;
      const t = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(gain).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.7);
    });
  }

  private playFootstep(): void {
    if (!this.ctx || !this.ambientGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.08);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playClockTick(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1100;
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(gain).connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  private playMusicBoxNote(): void {
    if (!this.ctx || !this.musicGain) return;
    const notes = [523.25, 622.25, 698.46, 783.99, 932.33];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.95);
  }

  private playWaterDrip(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(1450, now + 0.06);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  private playHouseCreak(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.linearRampToValueAtTime(64, now + 0.3);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain).connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public dispose(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    try {
      this.droneOsc?.stop();
      this.droneOsc2?.stop();
      this.ctx?.close();
    } catch {
      // noop
    }
    this.ctx = null;
  }
}
