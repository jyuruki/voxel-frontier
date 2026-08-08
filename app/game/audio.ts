import { GameSettings, MobState } from "./types";
import { hashString, seededRandom } from "./prng";

type SoundName = "mine" | "break" | "place" | "step" | "hurt" | "craft" | "machine" | "click" | "attack" | "critical" | "shoot" | "trade" | "rift";

export class FrontierAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicPhrase = 0;
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
    this.music.gain.setTargetAtTime(this.settings.musicVolume * 0.42, now, 0.05);
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

  private voicedCall(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode,
    offset = 0,
    filterFrequency = 900,
    vibratoRate = 0,
    vibratoDepth = 0,
  ): void {
    if (!this.context) return;
    const start = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, endFrequency), start + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrequency, start);
    filter.Q.value = 2.1;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.045, duration * 0.18));
    gain.gain.setValueAtTime(volume * 0.82, start + duration * 0.58);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    let vibrato: OscillatorNode | null = null;
    if (vibratoRate > 0 && vibratoDepth > 0) {
      vibrato = this.context.createOscillator();
      const vibratoGain = this.context.createGain();
      vibrato.frequency.value = vibratoRate;
      vibratoGain.gain.value = vibratoDepth;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscillator.frequency);
      vibrato.start(start);
      vibrato.stop(start + duration + 0.02);
    }
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private musicNote(
    frequency: number,
    duration: number,
    volume: number,
    destination: AudioNode,
    offset: number,
    type: OscillatorType = "sine",
    attack = 0.05,
  ): void {
    if (!this.context) return;
    const start = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = "lowpass";
    filter.frequency.value = type === "triangle" ? 1500 : 2300;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(attack, duration * 0.3));
    gain.gain.setValueAtTime(volume * 0.84, start + duration * 0.58);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
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
    } else if (name === "critical") {
      this.noise(0.11, 0.055);
      this.tone(294, 0.14, "triangle", 0.055, this.effects);
      this.tone(440, 0.18, "triangle", 0.045, this.effects, 0.035);
      this.tone(740, 0.21, "sine", 0.035, this.effects, 0.07);
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
      if (["cow", "sheep", "pig", "chicken"].includes(kind)) {
        const base = kind === "cow" ? 145 : kind === "sheep" ? 260 : kind === "pig" ? 230 : 920;
        this.voicedCall(base, base * 1.24, kind === "chicken" ? 0.13 : 0.28, "sawtooth", 0.07, voice, 0, kind === "cow" ? 520 : 1250, 7, base * 0.025);
        return;
      }
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

    if (kind === "cow") {
      this.voicedCall(122, 79, 0.72, "sawtooth", 0.052, voice, 0, 520, 4.2, 2.6);
      this.voicedCall(244, 158, 0.66, "triangle", 0.024, voice, 0.035, 760, 4.2, 4.8);
      if (this.random() > 0.48) this.voicedCall(96, 72, 0.46, "sawtooth", 0.038, voice, 0.68, 480, 3.8, 2);
    } else if (kind === "sheep") {
      this.voicedCall(235, 190, 0.58, "sawtooth", 0.048, voice, 0, 1050, 11.5, 12);
      this.voicedCall(470, 380, 0.54, "triangle", 0.019, voice, 0.025, 1550, 11.5, 22);
    } else if (kind === "pig") {
      this.voicedCall(178, 235, 0.17, "square", 0.047, voice, 0, 780, 18, 9);
      this.noise(0.095, 0.021, voice);
      if (this.random() > 0.42) this.voicedCall(205, 142, 0.14, "square", 0.038, voice, 0.19, 720, 15, 7);
    } else if (kind === "chicken") {
      this.voicedCall(920, 540, 0.09, "triangle", 0.041, voice, 0, 2100, 0, 0);
      this.voicedCall(790, 430, 0.08, "triangle", 0.038, voice, 0.105, 1900, 0, 0);
      this.voicedCall(660, 390, 0.075, "triangle", 0.031, voice, 0.205, 1700, 0, 0);
      this.noise(0.055, 0.012, voice);
    } else if (kind === "glowgrazer") {
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
    const schedulePhrase = () => {
      if (!this.context || !this.music) return;
      const beat = 60 / 72;
      const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
      const progressions = [
        [[50, 54, 57, 64], [45, 52, 57, 61], [47, 50, 54, 57], [43, 50, 54, 59]],
        [[47, 50, 54, 57], [43, 50, 54, 59], [50, 54, 57, 64], [45, 50, 57, 62]],
      ];
      const progression = progressions[this.musicPhrase % progressions.length];
      const motifs = [
        [0, 2, 4, 2, 1, 2, 5, 4],
        [4, 2, 1, 0, 2, 4, 6, 5],
        [2, 4, 5, 4, 2, 1, 0, 2],
      ];
      const scale = [62, 64, 66, 67, 69, 71, 73];
      const motif = motifs[(this.musicPhrase + Math.floor(this.random() * motifs.length)) % motifs.length];
      const leadIn = 0.08;
      for (let bar = 0; bar < 4; bar += 1) {
        const chord = progression[bar];
        const barStart = leadIn + bar * 4 * beat;
        for (const [voiceIndex, note] of chord.entries()) {
          this.musicNote(midi(note), beat * 3.86, voiceIndex === 0 ? 0.023 : 0.013, this.music, barStart + voiceIndex * 0.018, voiceIndex === 0 ? "triangle" : "sine", 0.32);
        }
        this.musicNote(midi(chord[0] - 12), beat * 1.7, 0.025, this.music, barStart, "triangle", 0.08);
        this.musicNote(midi(chord[0] - 5), beat * 1.45, 0.016, this.music, barStart + beat * 2, "triangle", 0.06);
        for (let eighth = 0; eighth < 8; eighth += 1) {
          const chordTone = chord[[0, 2, 1, 3, 2, 1, 3, 1][eighth] % chord.length] + 12;
          this.musicNote(midi(chordTone), beat * 0.37, 0.009, this.music, barStart + eighth * beat * 0.5, "sine", 0.03);
        }
        for (let noteIndex = 0; noteIndex < 2; noteIndex += 1) {
          const motifIndex = bar * 2 + noteIndex;
          const melodyMidi = scale[motif[motifIndex] % scale.length] + (bar === 3 && noteIndex === 1 ? -2 : 0);
          const delay = noteIndex === 0 ? beat * 0.5 : beat * 2.5;
          this.musicNote(midi(melodyMidi), beat * 1.1, 0.018, this.music, barStart + delay, "sine", 0.09);
        }
      }
      this.musicPhrase += 1;
    };
    schedulePhrase();
    this.musicTimer = window.setInterval(schedulePhrase, (60 / 72) * 16 * 1000);
  }

  dispose(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    void this.context?.close();
    this.context = null;
  }
}
