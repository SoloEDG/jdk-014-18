import type {
  ActionCue,
  PanelTransition,
  Soundscape,
} from "../../../shared/document";

export interface SceneAudio {
  sound: Soundscape;
  transition: PanelTransition;
  action: ActionCue | null;
}

export interface MixLevels {
  ambience: number;
  effects: number;
  duck: number;
}

interface EngineHooks {
  onBed?: (sound: Soundscape | null) => void;
  onAction?: (action: ActionCue | null) => void;
  onDecoding?: (decoding: boolean) => void;
  onError?: (message: string) => void;
}

interface Bed {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  timer: number | null;
}

interface ActiveCue {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Fade timings, in seconds, used when the soundscape identity changes. */
const BED_FADE: Record<PanelTransition, { out: number; in: number }> = {
  // Let the previous scene ring out under the incoming bed.
  continue: { out: 2.4, in: 0.7 },
  fade: { out: 0.9, in: 0.9 },
  // A few milliseconds is enough to avoid a click without being audible.
  cut: { out: 0.02, in: 0.02 },
};

const ACTION_SECONDS: Record<ActionCue, number> = {
  steps: 0.95,
  door: 1.15,
  chime: 1.35,
  thunder: 3.8,
  splash: 0.8,
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Builds a seamless looping buffer for one soundscape identity. */
function renderBed(sound: Soundscape, rate: number): Float32Array {
  const length = Math.floor(rate * 6),
    blend = Math.round(rate * 0.9),
    // Render a little extra so the loop point can be crossfaded continuously.
    raw = new Float32Array(length + blend),
    out = new Float32Array(length);
  let brown = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = i / rate,
      white = Math.random() * 2 - 1;
    if (sound === "pulse") {
      const swell = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.1 - Math.PI / 2),
        beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.2);
      raw[i] = Math.sin(t * Math.PI * 2 * 55) * 0.14 * (0.35 + 0.65 * swell) +
        Math.sin(t * Math.PI * 2 * 110) * 0.04 * beat;
    } else if (sound === "wind") {
      brown = (brown + 0.02 * white) / 1.02;
      const gust = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 0.17);
      raw[i] = brown * 3.4 * gust;
    } else {
      raw[i] = white * 0.34;
    }
  }
  for (let i = 0; i < length; i++) {
    if (i >= blend) {
      out[i] = raw[i];
      continue;
    }
    // Equal-power crossfade: the tail continues into the head, so the loop
    // point follows the same noise stream instead of restarting it.
    const x = i / blend,
      head = Math.sin((x * Math.PI) / 2),
      tail = Math.cos((x * Math.PI) / 2);
    out[i] = raw[i] * head + raw[length + i] * tail;
  }
  return out;
}

function renderAction(action: ActionCue, rate: number): Float32Array {
  const duration = ACTION_SECONDS[action],
    length = Math.floor(rate * duration),
    out = new Float32Array(length);
  let lp = 0,
    brown = 0,
    step = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    let value = 0;
    // Advance the filters on every sample so each layer hears a continuous
    // noise stream instead of bursts of fresh randomness.
    const white = Math.random() * 2 - 1;
    step += 0.35 * (white - step);
    if (action === "steps") {
      for (const at of [0.04, 0.35, 0.64]) {
        const d = t - at;
        if (d < 0 || d > 0.24) continue;
        const envelope = Math.exp(-d * 26);
        value +=
          (step * 0.9 + Math.sin(d * Math.PI * 2 * 86) * 0.4) * envelope;
      }
    } else if (action === "door") {
      const creak = t < 0.62 ? Math.sin(Math.PI * 2 * (170 + 70 * t) * t) : 0,
        creakEnv = t < 0.62 ? Math.min(1, t / 0.06) * (1 - t / 0.62) : 0;
      value += creak * creakEnv * 0.16;
      lp += 0.18 * (white - lp);
      if (t > 0.68 && t < 1.1) {
        const d = t - 0.68;
        value +=
          (lp * 1.4 + Math.sin(d * Math.PI * 2 * 72) * 0.5) *
          Math.exp(-d * 16);
      }
    } else if (action === "chime") {
      for (const [at, frequency] of [
        [0.04, 880],
        [0.22, 1320],
      ] as const) {
        const d = t - at;
        if (d < 0 || d > 1.1) continue;
        value +=
          (Math.sin(d * Math.PI * 2 * frequency) * 0.24 +
            Math.sin(d * Math.PI * 2 * frequency * 2) * 0.07) *
          Math.exp(-d * 3.4) *
          Math.min(1, d / 0.01);
      }
    } else if (action === "thunder") {
      brown = (brown + 0.035 * white) / 1.02;
      lp += 0.05 * (white - lp);
      const roll = Math.min(1, t / 0.18) * Math.exp(-Math.max(0, t - 0.5) / 2.6),
        crack = t < 0.3 ? Math.exp(-t * 18) * white * 0.35 : 0;
      value = brown * 3.8 * roll + lp * 1.6 * roll + crack;
    } else {
      const d = t;
      lp += 0.5 * (white - lp);
      value =
        (white - lp) * 0.5 * Math.exp(-d * 8) +
        Math.sin(d * Math.PI * 2 * 190) * 0.08 * Math.exp(-d * 14);
    }
    const edge = Math.min(
      1,
      i / Math.max(1, rate * 0.006),
      (length - 1 - i) / Math.max(1, rate * 0.06),
    );
    out[i] = value * Math.max(0, edge);
  }
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const trim = peak > 0.82 ? 0.82 / peak : 1;
  if (trim !== 1) for (let i = 0; i < length; i++) out[i]! *= trim;
  return out;
}

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function filterFor(ctx: AudioContext, sound: Soundscape) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = sound === "rain" ? 1800 : sound === "pulse" ? 420 : 760;
  filter.Q.value = 0.6;
  return filter;
}

/**
 * Owns every audible node. A soundscape identity has at most one bed source,
 * so revisiting it (or advancing quickly) never duplicates the loop. Action
 * cues are owned by a single panel visit and cancelled on the next visit.
 */
export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambientBus!: GainNode;
  private effectBus!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private enabled = false;
  private volume = 0.35;
  private mix: MixLevels = { ambience: 1, effects: 0.9, duck: 0.45 };
  private ducked = true;
  private beds = new Map<Soundscape, Bed>();
  private bedBuffers = new Map<Soundscape, AudioBuffer>();
  private decoded = new Map<ActionCue, AudioBuffer>();
  private decoding = new Map<ActionCue, Promise<AudioBuffer>>();
  private currentBed: Soundscape | null = null;
  private scene: SceneAudio | null = null;
  /** Incremented for every panel visit; stale async work compares against it. */
  private visit = 0;
  private actionRun = 0;
  private activeCue: ActiveCue | null = null;
  private pendingAction: { action: ActionCue; visit: number } | null = null;
  private playedVisit = -1;
  private hidden =
    typeof document !== "undefined" && document.visibilityState === "hidden";

  constructor(private hooks: EngineHooks = {}) {
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibility);
  }

  private visibility = () => {
    this.hidden = document.visibilityState === "hidden";
    if (this.hidden || !this.enabled || !this.ctx) return;
    // Only the current scene is restored; anything that happened while the
    // page was away is dropped rather than replayed as a backlog.
    void this.ctx.resume().then(
      () => this.reconcileAfterResume(),
      () => undefined,
    );
  };

  /** Rebuilds the current shot after the browser suspended audio. */
  resumeCurrent() {
    if (!this.enabled || !this.ctx || this.hidden) return;
    void this.ctx.resume().then(
      () => this.reconcileAfterResume(),
      () => undefined,
    );
  }

  setVolume(value: number) {
    this.volume = clamp01(value);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume, now, 0.05);
  }

  setMix(levels: MixLevels) {
    this.mix = {
      ambience: clamp01(levels.ambience),
      effects: clamp01(levels.effects),
      duck: clamp01(levels.duck),
    };
    this.applyMix(0.04);
  }

  setDucked(ducked: boolean) {
    this.ducked = ducked;
    this.applyMix(0.06);
  }


  async enable(scene: SceneAudio): Promise<void> {
    this.enabled = true;
    try {
      await this.ensureContext();
      if (!this.enabled) return;
      this.scene = scene;
      this.applyMix(0.02);
      this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
      this.master.gain.setValueAtTime(this.master.gain.value, this.ctx!.currentTime);
      this.master.gain.linearRampToValueAtTime(
        this.volume,
        this.ctx!.currentTime + 0.15,
      );
      await this.enter(scene);
    } catch (error) {
      this.disable();
      throw error;
    }
  }

  disable() {
    this.enabled = false;
    this.visit++;
    this.scene = null;
    this.cancelActions();
    this.pendingAction = null;
    const ctx = this.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0, this.master.gain.value), now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.05);
      for (const [key, bed] of [...this.beds]) this.retire(bed, key, 0.05, now, 80);
    }
    // Beds stay in the map until their stop timer fires so that re-enabling
    // within a moment reuses the same source instead of doubling it.
    this.currentBed = null;
    this.hooks.onBed?.(null);
  }

  async enter(scene: SceneAudio, triggerAction = true) {
    this.scene = scene;
    const visit = ++this.visit;
    // Any short sound still queued or ringing belongs to the previous shot.
    this.cancelActions();
    if (!this.enabled) return;
    try {
      await this.ensureContext();
    } catch {
      if (visit === this.visit && triggerAction && scene.action)
        this.pendingAction = { action: scene.action, visit };
      return;
    }
    if (visit !== this.visit || !this.enabled) return;
    this.switchBed(scene.sound, scene.transition);
    if (triggerAction && scene.action) void this.playAction(scene.action, visit);
  }

  /**
   * Manual audition of a cue. It replaces whatever the shot was playing (only
   * one short sound layer is ever owned at a time) but is tagged stale if the
   * panel changes before its buffer is ready.
   */
  audition(action: ActionCue) {
    if (!this.enabled || !this.ctx) return;
    this.cancelActions();
    void this.playAction(action, this.visit, true);
  }

  /** Silences anything queued or ringing without visiting another panel. */
  clearActions() {
    this.cancelActions();
  }

  dispose() {
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibility);
    this.enabled = false;
    this.visit++;
    this.cancelActions();
    for (const [key, bed] of [...this.beds]) this.retire(bed, key, 0.02, this.ctx?.currentTime ?? 0, 20);
    this.beds.clear();
    this.currentBed = null;
    this.hooks.onBed?.(null);
    const ctx = this.ctx;
    this.ctx = null;
    this.bedBuffers.clear();
    this.decoded.clear();
    this.decoding.clear();
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.ambientBus = ctx.createGain();
      this.effectBus = ctx.createGain();
      this.ambientBus.connect(this.master);
      this.effectBus.connect(this.master);
      this.master.connect(this.limiter).connect(ctx.destination);
      this.master.gain.value = 0;
      this.ambientBus.gain.value = 0;
      this.effectBus.gain.value = 0;
      this.ctx = ctx;
      ctx.onstatechange = () => {
        if (ctx.state === "running") this.reconcileAfterResume();
      };
    }
    const ctx = this.ctx;
    if (ctx.state === "closed") {
      this.ctx = null;
      throw new Error("Audio context closed");
    }
    if (ctx.state !== "running") await ctx.resume();
    if (ctx.state !== "running") throw new Error("Audio context cannot start");
    return ctx;
  }

  private applyMix(smoothing: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime,
      ambient =
        this.mix.ambience * (this.ducked ? 1 - this.mix.duck : 1);
    if (smoothing <= 0.01) {
      this.ambientBus.gain.setValueAtTime(ambient, now);
      this.effectBus.gain.setValueAtTime(this.mix.effects, now);
      return;
    }
    this.ambientBus.gain.setTargetAtTime(ambient, now, smoothing);
    this.effectBus.gain.setTargetAtTime(this.mix.effects, now, smoothing);
  }

  private switchBed(sound: Soundscape, transition: PanelTransition) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime,
      fade = BED_FADE[transition];
    for (const [key, bed] of [...this.beds]) {
      if (key !== sound) this.retire(bed, key, fade.out, now);
    }
    let bed = this.beds.get(sound);
    if (bed) {
      if (bed.timer !== null) {
        clearTimeout(bed.timer);
        bed.timer = null;
      }
    } else {
      let buffer = this.bedBuffers.get(sound);
      if (!buffer) {
        buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 6), ctx.sampleRate);
        buffer.getChannelData(0).set(renderBed(sound, ctx.sampleRate));
        this.bedBuffers.set(sound, buffer);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = filterFor(ctx, sound);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.ambientBus);
      source.start();
      bed = { source, filter, gain, timer: null };
      this.beds.set(sound, bed);
    }
    const param = bed.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0.0001, param.value), now);
    param.linearRampToValueAtTime(1, now + fade.in);
    this.currentBed = sound;
    this.hooks.onBed?.(sound);
  }

  private retire(
    bed: Bed,
    key: Soundscape,
    seconds: number,
    now: number,
    overrideMs?: number,
  ) {
    const fade = Math.max(0.02, seconds),
      param = bed.gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0, param.value), now);
    param.linearRampToValueAtTime(0, now + fade);
    if (bed.timer !== null) clearTimeout(bed.timer);
    bed.timer = window.setTimeout(
      () => {
        if (this.beds.get(key) === bed) this.beds.delete(key);
        try {
          bed.source.stop();
        } catch {
          /* already stopped */
        }
        bed.source.disconnect();
        bed.filter.disconnect();
        bed.gain.disconnect();
      },
      overrideMs ?? fade * 1000 + 40,
    );
  }

  /**
   * Cancels any queued or ringing action cue. Every panel visit bumps the run
   * id, so a cue whose buffer finishes decoding after the shot changed is
   * discarded instead of firing into the new scene.
   */
  private cancelActions() {
    this.actionRun++;
    this.pendingAction = null;
    const cue = this.activeCue;
    this.activeCue = null;
    if (cue && this.ctx) {
      const now = this.ctx.currentTime,
        param = cue.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0, param.value), now);
      param.linearRampToValueAtTime(0, now + 0.02);
      const source = cue.source,
        gain = cue.gain;
      window.setTimeout(() => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
        source.disconnect();
        gain.disconnect();
      }, 45);
    }
    // A decode still in flight is made stale by actionRun above and is
    // dropped when it resolves, even if it finishes much later.
    this.hooks.onAction?.(null);
    this.hooks.onDecoding?.(false);
  }

  private loadAction(action: ActionCue): Promise<AudioBuffer> {
    const cached = this.decoded.get(action);
    if (cached) return Promise.resolve(cached);
    const pending = this.decoding.get(action);
    if (pending) return pending;
    const ctx = this.ctx!;
    const promise = ctx
      .decodeAudioData(encodeWav(renderAction(action, ctx.sampleRate), ctx.sampleRate))
      .then((buffer) => {
        this.decoded.set(action, buffer);
        return buffer;
      })
      .finally(() => this.decoding.delete(action));
    this.decoding.set(action, promise);
    return promise;
  }

  private async playAction(
    action: ActionCue,
    visit: number,
    audition = false,
  ) {
    if (!this.enabled || this.ctx === null) return;
    if (!audition && visit !== this.visit) return;
    const ctx = this.ctx;
    if (this.hidden || ctx.state !== "running") {
      this.pendingAction = { action, visit };
      this.hooks.onAction?.(null);
      return;
    }
    const run = ++this.actionRun;
    this.hooks.onDecoding?.(true);
    let buffer: AudioBuffer;
    try {
      buffer = await this.loadAction(action);
    } catch {
      if (run === this.actionRun) this.hooks.onDecoding?.(false);
      if (this.enabled)
        this.hooks.onError?.("动作音效解码失败，已跳过这一次触发");
      return;
    }
    // The panel/chapter may have changed while a long cue was decoding.
    if (run !== this.actionRun || (!audition && visit !== this.visit)) return;
    if (!this.enabled || !this.ctx) return;
    if (this.hidden || this.ctx.state !== "running") {
      this.pendingAction = { action, visit };
      this.hooks.onDecoding?.(false);
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 0.015);
    source.connect(gain).connect(this.effectBus);
    const cue: ActiveCue = { source, gain };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.activeCue !== cue) return;
      this.activeCue = null;
      this.hooks.onAction?.(null);
    };
    source.start();
    this.activeCue = cue;
    this.playedVisit = visit;
    this.pendingAction = null;
    this.hooks.onDecoding?.(false);
    this.hooks.onAction?.(action);
  }

  /**
   * The browser may suspend the AudioContext or hide the page while panels
   * move on. On return we rebuild only the current scene — never a backlog of
   * actions that were missed while away.
   */
  private reconcileAfterResume() {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    // Rebuild whatever the current shot needs, even if its first attempt was
    // refused while the context was suspended.
    if (this.scene) this.switchBed(this.scene.sound, "continue");
    const pending = this.pendingAction;
    if (!pending || pending.visit !== this.visit) return;
    this.pendingAction = null;
    if (this.playedVisit !== pending.visit)
      void this.playAction(pending.action, pending.visit);
  }
}
