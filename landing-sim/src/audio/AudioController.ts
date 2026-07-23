import type { FlightPhase, Telemetry } from "../sim/types";

export type AudioCue = "engage" | "phase" | "alarm" | "landed" | "crashed";

interface AudioState {
  phase: FlightPhase;
  alarm: string | null;
}

export function detectAudioCue(
  previous: Readonly<AudioState> | null,
  current: Readonly<AudioState>,
): AudioCue | null {
  if (!previous) return null;
  if (current.phase === "LANDED" && previous.phase !== "LANDED") return "landed";
  if (current.phase === "CRASHED" && previous.phase !== "CRASHED") return "crashed";
  if (current.alarm && current.alarm !== previous.alarm) return "alarm";
  if (current.phase === "BRAKING" && previous.phase === "STANDBY") return "engage";
  if (current.phase !== previous.phase) return "phase";
  return null;
}

/**
 * Procedural Web Audio soundscape. It creates no AudioContext until a user
 * gesture activates sound, so loading the simulator remains autoplay-safe.
 */
export class AudioController {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineTone: OscillatorNode | null = null;
  private engineNoise: AudioBufferSourceNode | null = null;
  private previous: AudioState | null = null;
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  async activate(): Promise<void> {
    if (!this.enabled) return;
    this.ensureGraph();
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  async toggle(): Promise<boolean> {
    this.enabled = !this.enabled;
    if (this.enabled) {
      await this.activate();
    }
    this.setMasterLevel(this.enabled ? 0.62 : 0);
    return this.enabled;
  }

  update(telemetry: Readonly<Telemetry>, running: boolean, paused: boolean): void {
    const current = { phase: telemetry.phase, alarm: telemetry.alarm };
    const cue = detectAudioCue(this.previous, current);
    this.previous = current;

    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const engineOn =
      running &&
      !paused &&
      telemetry.thrustN > 0 &&
      telemetry.phase !== "LANDED" &&
      telemetry.phase !== "CRASHED";
    const throttle = engineOn ? telemetry.throttle : 0;

    this.engineGain?.gain.setTargetAtTime(
      throttle > 0 ? 0.015 + throttle * 0.105 : 0,
      now,
      0.08,
    );
    this.engineFilter?.frequency.setTargetAtTime(110 + throttle * 330, now, 0.12);
    this.engineTone?.frequency.setTargetAtTime(38 + throttle * 24, now, 0.1);

    if (cue) this.playCue(cue, now);
  }

  reset(): void {
    this.previous = null;
    if (this.context && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
    }
  }

  dispose(): void {
    this.engineTone?.stop();
    this.engineNoise?.stop();
    void this.context?.close();
    this.context = null;
  }

  private ensureGraph(): void {
    if (this.context) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = this.enabled ? 0.62 : 0;
    master.connect(context.destination);

    const engineGain = context.createGain();
    engineGain.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 180;
    engineFilter.Q.value = 0.7;
    engineFilter.connect(engineGain).connect(master);

    const tone = context.createOscillator();
    tone.type = "sawtooth";
    tone.frequency.value = 44;
    tone.connect(engineFilter);
    tone.start();

    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context);
    noise.loop = true;
    noise.connect(engineFilter);
    noise.start();

    this.context = context;
    this.master = master;
    this.engineGain = engineGain;
    this.engineFilter = engineFilter;
    this.engineTone = tone;
    this.engineNoise = noise;
  }

  private setMasterLevel(value: number): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }

  private playCue(cue: AudioCue, now: number): void {
    if (!this.context || !this.master) return;
    const notes: Record<AudioCue, readonly number[]> = {
      engage: [220, 330],
      phase: [440],
      alarm: [880, 660, 880],
      landed: [392, 523.25, 659.25],
      crashed: [130.81, 98, 65.41],
    };
    const step = cue === "alarm" ? 0.11 : 0.14;
    notes[cue].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const start = now + index * step;
      const duration = cue === "crashed" ? 0.34 : 0.18;
      oscillator.type = cue === "crashed" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(cue === "alarm" ? 0.12 : 0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * 1.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  return buffer;
}
