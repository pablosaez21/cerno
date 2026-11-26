// Phones. Measured in WebKit (Playwright, scripts/measure-memory.mjs): each Stockfish worker takes
// ~70 MB, while Maia-3's runtime (onnxruntime-web) takes ~0.6–0.9 GB once loaded and peaks at
// 1.4–1.8 GB per batch on WebGPU, whatever the batch size (32 to 256). On an iPhone the page then
// dies a few seconds into the analysis and Safari reloads it. So a phone runs Maia only after the
// Stockfish passes (whose results are cached by then), and a page that died mid-run says so when it
// comes back, instead of "no analysis running".

export interface DeviceInfo {
  userAgent: string;
  maxTouchPoints?: number;
  /** navigator.deviceMemory (GB), where the browser gives it (not Safari). */
  deviceMemory?: number;
}

/** A phone or tablet, or any device that says it has 4 GB or less. iPadOS reports a Mac with touch. */
export function isSmallDevice(d: DeviceInfo): boolean {
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(d.userAgent)) return true;
  if (/Macintosh/.test(d.userAgent) && (d.maxTouchPoints ?? 0) > 1) return true;
  return d.deviceMemory !== undefined && d.deviceMemory <= 4;
}

/** Where a run was when the page last saw it: Stockfish, or Maia loaded or loading. */
export type RunStage = "stockfish" | "maia";

export interface RunMark<I> {
  input: I;
  stage: RunStage;
  startedAt: number;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const RUN_KEY = "cerno.run";
const NO_MAIA_KEY = "cerno.noMaia";

/**
 * The run in progress, in sessionStorage: it survives the reload Safari does after killing the
 * page, and a new tab starts clean. Cleared when the run ends and on `pagehide` (a reload or a
 * navigation the person chose), which a killed page never fires.
 */
export function markRun<I>(store: Store | undefined, input: I, startedAt: number): void {
  write(store, RUN_KEY, JSON.stringify({ input, stage: "stockfish", startedAt } satisfies RunMark<I>));
}

export function markStage(store: Store | undefined, stage: RunStage): void {
  const m = readMark<unknown>(store);
  if (m && m.stage !== stage) write(store, RUN_KEY, JSON.stringify({ ...m, stage }));
}

export function clearRun(store: Store | undefined): void {
  try {
    store?.removeItem(RUN_KEY);
  } catch {
    // Storage blocked: nothing was saved.
  }
}

/** The run the page was doing when it died, once: reading it clears it. */
export function takeCrash<I>(store: Store | undefined): RunMark<I> | undefined {
  const m = readMark<I>(store);
  clearRun(store);
  return m;
}

/** Maia-3 killed the page on this device once: later runs here skip it (localStorage). */
export function maiaBlocked(store: Store | undefined): boolean {
  try {
    return store?.getItem(NO_MAIA_KEY) === "1";
  } catch {
    return false;
  }
}

export function blockMaia(store: Store | undefined): void {
  write(store, NO_MAIA_KEY, "1");
}

export function unblockMaia(store: Store | undefined): void {
  try {
    store?.removeItem(NO_MAIA_KEY);
  } catch {
    // Storage blocked: nothing was saved.
  }
}

function readMark<I>(store: Store | undefined): RunMark<I> | undefined {
  try {
    const m = JSON.parse(store?.getItem(RUN_KEY) ?? "null") as RunMark<I> | null;
    return m && m.input && (m.stage === "stockfish" || m.stage === "maia") ? m : undefined;
  } catch {
    return undefined;
  }
}

function write(store: Store | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Storage blocked or full: the page just won't know after a reload.
  }
}
