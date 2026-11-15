// Automatic brake: fewer Stockfish engines while the whole computer is under CPU pressure, and
// back up when it eases. The signal is Chrome's Compute Pressure API (PressureObserver, source
// "cpu"): it describes the whole system, not only Cerno. Without the API nothing changes.
// Only the number of engines searching at once changes, never what they search: the report is
// the same (EnginePool.setLimit, pool-size.test.ts).

export type PressureState = "nominal" | "fair" | "serious" | "critical";

/** Under pressure, one engine less every DOWN_MS while it lasts (half of them at once if critical). */
export const DOWN_MS = 4_000;
/** One engine back after UP_MS without pressure, and no sooner than UP_MS after the last change. */
export const UP_MS = 20_000;

/**
 * The policy, without the browser: feed it the states and a clock, read `limit`.
 * The gap between DOWN_MS and UP_MS is the hysteresis that keeps it from oscillating.
 */
export class Brake {
  limit: number;
  private state: PressureState = "nominal";
  /** Since when the state has been calm (nominal or fair). */
  private calmSince: number;
  private lastChange: number;

  constructor(
    readonly max: number,
    now: number,
  ) {
    this.limit = max;
    this.calmSince = now;
    this.lastChange = now;
  }

  /** A new state from the observer. Returns the new limit if it changed. */
  observe(state: PressureState, now: number): number | undefined {
    const prev = this.state;
    const wasCalm = prev === "nominal" || prev === "fair";
    this.state = state;
    const calm = state === "nominal" || state === "fair";
    if (calm && !wasCalm) this.calmSince = now;
    if (!calm && wasCalm) return this.cut(now);
    if (state === "critical" && prev !== "critical") return this.cut(now);
    return this.tick(now);
  }

  /** Call regularly (about once a second): the observer reports changes only. */
  tick(now: number): number | undefined {
    const calm = this.state === "nominal" || this.state === "fair";
    if (!calm) return now - this.lastChange >= DOWN_MS ? this.cut(now) : undefined;
    if (this.limit < this.max && now - this.calmSince >= UP_MS && now - this.lastChange >= UP_MS) return this.set(this.limit + 1, now);
    return undefined;
  }

  private cut(now: number): number | undefined {
    const to = this.state === "critical" ? Math.floor(this.limit / 2) : this.limit - 1;
    return this.set(Math.max(1, to), now);
  }

  private set(n: number, now: number): number | undefined {
    this.lastChange = now;
    if (n === this.limit) return undefined;
    this.limit = n;
    return n;
  }
}

interface PressureRecord {
  state: PressureState;
}
interface PressureObserverLike {
  observe(source: "cpu", opts?: { sampleInterval?: number }): Promise<void>;
  disconnect(): void;
}
type PressureObserverCtor = new (cb: (records: PressureRecord[]) => void) => PressureObserverLike;

/** Whether this browser has the Compute Pressure API. */
export function hasPressure(): boolean {
  return typeof globalThis !== "undefined" && "PressureObserver" in globalThis;
}

/**
 * Watches the CPU pressure. `onState` gets every state reported; `onLimit` the new engine limit
 * when `max` is given (the brake). Returns a stop function. Does nothing without the API.
 */
export function watchPressure(opts: { max?: number; onLimit?: (n: number) => void; onState?: (s: PressureState) => void }): () => void {
  if (!hasPressure()) return () => {};
  const Ctor = (globalThis as unknown as { PressureObserver: PressureObserverCtor }).PressureObserver;
  const brake = opts.max ? new Brake(opts.max, performance.now()) : undefined;
  const apply = (n: number | undefined) => n !== undefined && opts.onLimit?.(n);
  const obs = new Ctor((records) => {
    for (const r of records) {
      opts.onState?.(r.state);
      if (brake) apply(brake.observe(r.state, performance.now()));
    }
  });
  obs.observe("cpu", { sampleInterval: 1000 }).catch(() => {
    // Not allowed here (a policy, an insecure context): no brake, nothing else changes.
  });
  const timer = brake ? setInterval(() => apply(brake.tick(performance.now())), 1000) : undefined;
  return () => {
    obs.disconnect();
    if (timer) clearInterval(timer);
  };
}
