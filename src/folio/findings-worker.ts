// Web Worker for the wait screen's live findings: the report of the games finished so far, rebuilt
// off the page's thread (it took up to ~210 ms at 100 games there, a visible stall every few seconds
// of pass 2). Each finished game is sent once; a "build" message answers with the findings only.
// Bundled by scripts/copy-maia.mjs into public/findings-worker.js.
import { DEFAULT_SETTINGS, type AnalyzedGame } from "@/core/analyze";
import { buildFolioData, type FolioData } from "@/core/folio-data";
import { buildReport } from "@/core/report";

export type FindingsIn = { type: "game"; game: AnalyzedGame } | { type: "build"; id: number; user: string };
export type FindingsOut = { type: "findings"; id: number; findings?: FolioData["findings"] };

const games: AnalyzedGame[] = [];
const post = (m: FindingsOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<FindingsIn>) => {
  const m = e.data;
  if (m.type === "game") {
    games.push(m.game);
    return;
  }
  let findings: FolioData["findings"] | undefined;
  try {
    findings = buildFolioData(buildReport(games, m.user, DEFAULT_SETTINGS), games, []).findings;
  } catch {
    // A partial sample the report cannot take yet: wait for more games.
  }
  post({ type: "findings", id: m.id, findings });
};
