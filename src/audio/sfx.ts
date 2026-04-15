export type SfxName =
  | "shot"
  | "empty"
  | "reload"
  | "hit"
  | "kill"
  | "wave-start"
  | "player-dead";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

function envTone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  freqEnd?: number,
): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(freqEnd, 1),
      now + duration,
    );
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noiseBurst(duration: number, gain: number, filterHz: number): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = filterHz;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(ac.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

export function play(name: SfxName): void {
  try {
    switch (name) {
      case "shot":
        noiseBurst(0.12, 0.35, 1800);
        envTone(180, 0.1, "square", 0.12, 60);
        break;
      case "empty":
        envTone(900, 0.05, "square", 0.1);
        break;
      case "reload":
        envTone(400, 0.08, "triangle", 0.12);
        setTimeout(() => envTone(600, 0.08, "triangle", 0.12), 120);
        break;
      case "hit":
        noiseBurst(0.08, 0.25, 1000);
        break;
      case "kill":
        envTone(220, 0.18, "sawtooth", 0.14, 80);
        noiseBurst(0.15, 0.2, 700);
        break;
      case "wave-start":
        envTone(520, 0.1, "triangle", 0.14);
        setTimeout(() => envTone(780, 0.16, "triangle", 0.14), 110);
        break;
      case "player-dead":
        envTone(300, 0.5, "sawtooth", 0.18, 40);
        break;
    }
  } catch {
    // audio may be blocked before user interaction
  }
}

export function unlockAudio(): void {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") ac.resume();
  } catch {
    // ignore
  }
}
