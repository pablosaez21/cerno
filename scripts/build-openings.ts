// Builds src/core/data/openings.json from the Lichess chess-openings TSV files.
// Output: { names: [eco, name][], positions: { [epd]: nameIndex | -1 } }
// -1 marks a position that is on a known line but has no name of its own.
import fs from "node:fs";
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";

const names: [string, string][] = [];
const positions: Record<string, number> = {};
const epd = (pos: Chess) => makeFen(pos.toSetup()).split(" ").slice(0, 4).join(" ");

for (const f of ["a", "b", "c", "d", "e"]) {
  const lines = fs.readFileSync(`data/openings/${f}.tsv`, "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split("\t");
    const pos = Chess.default();
    for (const tok of pgn.split(/\s+/)) {
      if (/^\d+\.$/.test(tok)) continue;
      const move = parseSan(pos, tok);
      if (!move) throw new Error(`bad move ${tok} in ${name}`);
      pos.play(move);
      const key = epd(pos);
      if (!(key in positions)) positions[key] = -1;
    }
    positions[epd(pos)] = names.length;
    names.push([eco, name]);
  }
}
fs.writeFileSync("src/core/data/openings.json", JSON.stringify({ names, positions }));
console.log(names.length, "names,", Object.keys(positions).length, "positions");
