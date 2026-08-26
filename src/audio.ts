export type SoundName = 'move' | 'card' | 'alert' | 'win';

interface Tone {
  frequency: number;
  duration: number;
  offset?: number;
}

const soundTones: Record<SoundName, Tone[]> = {
  move: [{ frequency: 180, duration: 0.045 }],
  card: [
    { frequency: 440, duration: 0.07 },
    { frequency: 660, duration: 0.09, offset: 0.06 },
  ],
  alert: [
    { frequency: 150, duration: 0.11 },
    { frequency: 110, duration: 0.16, offset: 0.1 },
  ],
  win: [
    { frequency: 392, duration: 0.09 },
    { frequency: 523, duration: 0.1, offset: 0.08 },
    { frequency: 659, duration: 0.16, offset: 0.17 },
  ],
};

export class GameAudio {
  private context: AudioContext | null = null;

  public constructor(private muted: boolean) {}

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public play(name: SoundName): void {
    if (this.muted) {
      return;
    }
    const AudioContextConstructor = window.AudioContext;
    this.context ??= new AudioContextConstructor();
    void this.context.resume();
    const start = this.context.currentTime;

    for (const tone of soundTones[name]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const toneStart = start + (tone.offset ?? 0);
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
      gain.gain.setValueAtTime(0.055, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.001, toneStart + tone.duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + tone.duration);
    }
  }
}
