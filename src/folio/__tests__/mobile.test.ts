import { describe, expect, it } from "vitest";
import { blockMaia, clearRun, isSmallDevice, maiaBlocked, markRun, markStage, takeCrash, unblockMaia } from "../mobile";

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

describe("isSmallDevice", () => {
  it("is true on phones and tablets, including an iPad that reports a Mac", () => {
    expect(isSmallDevice({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isSmallDevice({ userAgent: ANDROID, maxTouchPoints: 5, deviceMemory: 8 })).toBe(true);
    expect(isSmallDevice({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
  });
  it("is false on a computer, unless it says it has 4 GB or less", () => {
    expect(isSmallDevice({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(isSmallDevice({ userAgent: MAC_CHROME, maxTouchPoints: 0, deviceMemory: 8 })).toBe(false);
    expect(isSmallDevice({ userAgent: WINDOWS, deviceMemory: 4 })).toBe(true);
    expect(isSmallDevice({ userAgent: WINDOWS })).toBe(false);
  });
});

describe("run mark", () => {
  const input = { src: "chesscom", user: "p", n: 25 };
  it("comes back once after a page died, with the stage it was in", () => {
    const s = new MemStore();
    markRun(s, input, 1000);
    markStage(s, "maia");
    expect(takeCrash(s)).toEqual({ input, stage: "maia", startedAt: 1000 });
    expect(takeCrash(s)).toBeUndefined();
  });
  it("is gone once the run ended or the person left the page", () => {
    const s = new MemStore();
    markRun(s, input, 1000);
    expect(takeCrash(new MemStore())).toBeUndefined();
    clearRun(s);
    expect(takeCrash(s)).toBeUndefined();
  });
  it("stays at Stockfish until Maia starts loading", () => {
    const s = new MemStore();
    markRun(s, input, 1000);
    expect(takeCrash(s)?.stage).toBe("stockfish");
  });
  it("ignores what it cannot read, and blocked storage", () => {
    const s = new MemStore();
    s.setItem("cerno.run", "{not json");
    expect(takeCrash(s)).toBeUndefined();
    s.setItem("cerno.run", JSON.stringify({ input, stage: "other", startedAt: 1 }));
    expect(takeCrash(s)).toBeUndefined();
    expect(() => markRun(blocked, input, 1)).not.toThrow();
    expect(takeCrash(blocked)).toBeUndefined();
    expect(takeCrash(undefined)).toBeUndefined();
  });
});

describe("Maia block", () => {
  it("is remembered per device until the data is deleted", () => {
    const s = new MemStore();
    expect(maiaBlocked(s)).toBe(false);
    blockMaia(s);
    expect(maiaBlocked(s)).toBe(true);
    unblockMaia(s);
    expect(maiaBlocked(s)).toBe(false);
    expect(maiaBlocked(blocked)).toBe(false);
  });
});
