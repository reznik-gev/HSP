/**
 * Frame-rate meter based on requestAnimationFrame deltas. A frame the browser cannot produce
 * (because the main thread or the renderer is busy) shows up as a long delta.
 */

export interface FrameStats {
  frames: number;
  durationMs: number;
  avgFps: number;
  p95FrameMs: number;
  worstFrameMs: number;
}

export class FrameMeter {
  private last = 0;
  private running = false;
  private readonly recent: number[] = [];
  private recording: number[] | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = (t: number) => {
      if (!this.running) return;
      if (this.last) {
        const dt = t - this.last;
        this.recent.push(dt);
        if (this.recent.length > 120) this.recent.shift();
        this.recording?.push(dt);
      }
      this.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    this.last = 0;
  }

  /** Live stats over roughly the last two seconds. */
  live(): FrameStats {
    return summarize(this.recent.slice(-60));
  }

  startRecording(): void {
    this.recording = [];
  }

  stopRecording(): FrameStats {
    const frames = this.recording ?? [];
    this.recording = null;
    return summarize(frames);
  }
}

export function summarize(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) {
    return { frames: 0, durationMs: 0, avgFps: 0, p95FrameMs: 0, worstFrameMs: 0 };
  }
  const durationMs = deltas.reduce((a, b) => a + b, 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  return {
    frames: deltas.length,
    durationMs: round(durationMs),
    avgFps: round((deltas.length * 1000) / durationMs),
    p95FrameMs: round(p95),
    worstFrameMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
