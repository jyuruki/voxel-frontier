import { GameSettings } from "./types";
import { hashString, seededRandom } from "./prng";

type SoundName = "mine" | "break" | "place" | "step" | "hurt" | "craft" | "machine" | "click" | "attack" | "shoot";

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

  private noise(duration: number, volume: number): void {
    if (!this.context || !this.effects) return;
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
    gain.connect(this.effects);
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
    } else {
      this.tone(260, 0.045, "sine", 0.025, this.effects);
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
