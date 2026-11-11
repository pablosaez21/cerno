// Copies the Stockfish WASM build (lite, single-threaded) from node_modules to
// public/engine so the browser can load it as a Web Worker. GPLv3: the license
// text travels with the engine.
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/stockfish");
const dest = path.resolve("public/engine");
fs.mkdirSync(dest, { recursive: true });
for (const file of ["bin/stockfish-19-lite-single.js", "bin/stockfish-19-lite-single.wasm", "Copying.txt"]) {
  fs.copyFileSync(path.join(src, file), path.join(dest, path.basename(file)));
}
console.log("engine copied to public/engine");
