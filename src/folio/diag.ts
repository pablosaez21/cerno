// What an analysis did on this device, for «Copiar diagnóstico» on the wait screen: browser,
// cores, engines, Maia's backend, time per phase, the page's stalls per phase and the CPU pressure
// states seen. It stays in the page; the button copies it to the clipboard and nothing is sent.

/** A frame later than this is a stall: the page could not draw for that long. */
export const STALL_MS = 50;

export interface PhaseStats {
  ms: number;
  frames: number;
  stalls: number;
  maxMs: number;
}

export interface DiagInfo {
  userAgent: string;
  cores: number;
  memoryGb?: number;
  load: string;
  workers: number;
  games?: number;
  backend?: string;
  /** Maia loaded after the Stockfish passes (a phone, see mobile.ts). */
  maiaAfter?: boolean;
  pressureApi: boolean;
}

/** Collects the per-phase figures. `phase()` names what is running now (e.g. "pass1+maia"). */
export class Diag {
  readonly byPhase: Record<string, PhaseStats> = {};
  readonly pressure: Record<string, Record<string, number>> = {};
  /** Engine limit changes by the brake: seconds since the start, new limit. */
  readonly limits: [number, number][] = [];
  hiddenMs = 0;
  private last = 0;
  private raf = 0;
  private readonly t0 = performance.now();
  private ended?: number;

  constructor(
    public info: DiagInfo,
    private readonly phase: () => string,
  ) {}

  private stats(k: string): PhaseStats {
    return (this.byPhase[k] ??= { ms: 0, frames: 0, stalls: 0, maxMs: 0 });
  }

  /** Measures every frame until stop(). A hidden tab draws nothing: that time is not a stall. */
  start(): void {
    const loop = (t: number) => {
      if (this.ended !== undefined) return;
      const d = this.last ? t - this.last : 0;
      this.last = t;
      if (d > 0) {
        if (document.hidden) this.hiddenMs += d;
        else {
          const s = this.stats(this.phase());
          s.ms += d;
          s.frames++;
          if (d > STALL_MS) s.stalls++;
          if (d > s.maxMs) s.maxMs = Math.round(d);
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private onVisibility = () => {
    // The first frame after the tab comes back measures the time it was hidden, not a stall.
    this.last = 0;
  };

  pressureState(state: string): void {
    const k = this.phase();
    const p = (this.pressure[k] ??= {});
    p[state] = (p[state] ?? 0) + 1;
  }

  limit(n: number): void {
    this.limits.push([Math.round((performance.now() - this.t0) / 1000), n]);
  }

  stop(): void {
    if (this.ended !== undefined) return;
    this.ended = performance.now();
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  /** Plain text, one fact per line, for pasting into a message. */
  text(extra: { status?: string; error?: string; timings?: object } = {}): string {
    const i = this.info;
    const secs = (ms: number) => (ms / 1000).toFixed(1) + " s";
    const lines = [
      "Cerno · diagnóstico",
      `navegador: ${i.userAgent}`,
      `núcleos (hardwareConcurrency): ${i.cores}`,
      `memoria (deviceMemory): ${i.memoryGb ?? "?"} GB`,
      `modo: ${i.load} · motores: ${i.workers}`,
      `Maia: ${i.backend ?? "?"}${i.maiaAfter ? " · después de Stockfish" : ""}`,
      `partidas: ${i.games ?? "?"}`,
      `presión de CPU (API): ${i.pressureApi ? "sí" : "no"}`,
      `estado: ${extra.status ?? "?"}${extra.error ? ` (${extra.error})` : ""}`,
      `duración: ${secs((this.ended ?? performance.now()) - this.t0)} · pestaña oculta: ${secs(this.hiddenMs)}`,
      "",
      `fase: tiempo · fotogramas · parones >${STALL_MS} ms · parón máximo · presión`,
    ];
    for (const k of new Set([...Object.keys(this.byPhase), ...Object.keys(this.pressure)])) {
      const s = this.byPhase[k] ?? { ms: 0, frames: 0, stalls: 0, maxMs: 0 };
      const pr = this.pressure[k];
      const prs = pr ? Object.entries(pr).map(([st, c]) => `${st} ${c}`).join(", ") : "–";
      lines.push(`${k}: ${secs(s.ms)} · ${s.frames} · ${s.stalls} · ${s.maxMs} ms · ${prs}`);
    }
    if (this.limits.length) lines.push("", "freno (s: motores): " + this.limits.map(([t, n]) => `${t}: ${n}`).join(", "));
    if (extra.timings) lines.push("", "tiempos: " + JSON.stringify(extra.timings));
    return lines.join("\n");
  }
}
