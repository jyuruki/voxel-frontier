import { GameSettings, MobState } from "./types";
import { hashString, seededRandom } from "./prng";

type SoundName = "mine" | "break" | "place" | "step" | "hurt" | "craft" | "machine" | "click" | "attack" | "shoot" | "trade" | "rift";

export class FrontierAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private musicTimer: number | null = null;
  private settings: GameSettings;
  private readonly random: () => number;

  constructor(settings: GameSettings, seed: string) {
    this.settings = settings;
    this.random = seededRandom(hashString(`music:${seed}`));
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.effects = this.context.createGain();
      this.music = this.context.createGain();
      this.effects.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(this.context.destination);
      this.applyVolumes();
    }
    if (this.context.state === "suspended") await this.context.resume();
    this.startMusic();
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.effects || !this.music) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.masterVolume, now, 0.03);
    this.effects.gain.setTargetAtTime(this.settings.effectsVolume, now, 0.03);
    this.music.gain.setTargetAtTime(this.settings.musicVolume * 0.32, now, 0.05);
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: GainNode,
    offset = 0,
  ): void {
    if (!this.context) return;
    const start = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.72), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, destination?: AudioNode): void {
    if (!this.context || !this.effects) return;
    const output = destination ?? this.effects;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) channel[index] = this.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start();
  }

  play(name: SoundName): void {
    if (!this.context || !this.effects) return;
    if (name === "mine") {
      this.noise(0.055, 0.055);
      this.tone(105, 0.06, "square", 0.025, this.effects);
    } else if (name === "break") {
      this.noise(0.16, 0.085);
      this.tone(92, 0.13, "sawtooth", 0.04, this.effects);
    } else if (name === "place") {
      this.tone(145, 0.08, "triangle", 0.05, this.effects);
      this.tone(104, 0.07, "triangle", 0.04, this.effects, 0.03);
    } else if (name === "step") {
      this.noise(0.045, 0.025);
    } else if (name === "hurt") {
      this.tone(185, 0.24, "sawtooth", 0.07, this.effects);
    } else if (name === "craft") {
      this.tone(392, 0.16, "triangle", 0.045, this.effects);
      this.tone(587, 0.2, "triangle", 0.045, this.effects, 0.09);
    } else if (name === "machine") {
      this.tone(74, 0.12, "square", 0.022, this.effects);
    } else if (name === "attack") {
      this.noise(0.08, 0.04);
      this.tone(178, 0.11, "sawtooth", 0.045, this.effects);
    } else if (name === "shoot") {
      this.tone(720, 0.1, "square", 0.04, this.effects);
      this.tone(310, 0.16, "sine", 0.035, this.effects, 0.035);
    } else if (name === "trade") {
      this.tone(330, 0.16, "triangle", 0.045, this.effects);
      this.tone(495, 0.18, "triangle", 0.045, this.effects, 0.1);
      this.tone(660, 0.22, "sine", 0.035, this.effects, 0.2);
    } else if (name === "rift") {
      this.noise(0.7, 0.035);
      this.tone(92, 0.72, "sawtooth", 0.035, this.effects);
      this.tone(184, 0.82, "sine", 0.06, this.effects, 0.08);
      this.tone(368, 0.9, "sine", 0.035, this.effects, 0.18);
    } else {
      this.tone(260, 0.045, "sine", 0.025, this.effects);
    }
  }

  playCreature(kind: MobState["kind"], mood: "idle" | "hurt" | "step" | "attack", distance = 0): void {
    if (!this.context || !this.effects || distance > 24) return;
    const voice = this.context.createGain();
    const attenuation = Math.max(0.035, 1 - distance / 25);
    voice.gain.value = attenuation;
    voice.connect(this.effects);
    window.setTimeout(() => voice.disconnect(), 1400);

    if (mood === "step") {
      this.noise(0.035, kind === "thornback" ? 0.03 : 0.014, voice);
      return;
    }
    if (mood === "hurt") {
      const base = kind === "nightwisp" ? 520 : kind === "thornback" ? 92 : 190;
      this.tone(base, 0.24, kind === "nightwisp" ? "sine" : "sawtooth", 0.075, voice);
      return;
    }
    if (mood === "attack") {
      const base = kind === "cinderling" ? 130 : kind === "nightwisp" ? 610 : 108;
      this.noise(0.08, 0.025, voice);
      this.tone(base, 0.18, "square", 0.06, voice);
      return;
    }

    if (kind === "glowgrazer") {
      this.tone(238, 0.34, "sine", 0.045, voice);
      this.tone(318, 0.28, "triangle", 0.026, voice, 0.13);
    } else if (kind === "mireling") {
      this.tone(108, 0.18, "square", 0.04, voice);
      this.tone(82, 0.28, "triangle", 0.045, voice, 0.11);
    } else if (kind === "cinderling") {
      this.noise(0.22, 0.035, voice);
      this.tone(148, 0.3, "sawtooth", 0.04, voice);
    } else if (kind === "thornback") {
      this.tone(76, 0.42, "sawtooth", 0.055, voice);
      this.tone(58, 0.35, "triangle", 0.035, voice, 0.08);
    } else if (kind === "nightwisp") {
      this.tone(512, 0.58, "sine", 0.04, voice);
      this.tone(704, 0.62, "sine", 0.024, voice, 0.17);
    } else {
      this.tone(196, 0.26, "triangle", 0.04, voice);
      this.tone(247, 0.24, "sine", 0.027, voice, 0.12);
    }
  }

  private startMusic(): void {
    if (this.musicTimer !== null || !this.context || !this.music) return;
    const scale = [110, 146.83, 164.81, 220, 246.94, 293.66];
    const schedulePhrase = () => {
      if (!this.context || !this.music) return;
      for (let beat = 0; beat < 8; beat += 1) {
        const note = scale[Math.floor(this.random() * scale.length)];
        this.tone(note, 1.8, "sine", beat % 4 === 0 ? 0.09 : 0.045, this.music, beat * 1.15);
        if (beat % 2 === 0) this.tone(note / 2, 2.2, "triangle", 0.025, this.music, beat * 1.15);
      }
    };
    schedulePhrase();
    this.musicTimer = window.setInterval(schedulePhrase, 9200);
  }

  dispose(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    void this.context?.close();
    this.context = null;
  }
}
