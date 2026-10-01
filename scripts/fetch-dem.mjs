// Downloads the FABDEM (Forest And Buildings removed Copernicus DEM) tiles covering the
// central river basin and stores them, unmodified, under data/dem-src/. FABDEM is a bare-earth
// correction of Copernicus GLO-30 built specifically to strip canopy and rooftop height, which
// is exactly the bias documented in lib/waterway/flood.ts.
//
// Usage: node scripts/fetch-dem.mjs [--force]
// Source: a Hugging Face mirror of the official dataset (huggingface.co/datasets/links-ads/
// fabdem-v12), served as plain files over HF's CDN — the official host, data.bris.ac.uk, answers
// but stalls for minutes at a time on some byte ranges under this script's own name; the mirror
// has been reliable where that wasn't. CC BY-NC-SA 4.0 — non-commercial use only; see
// https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn for the licence.
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://huggingface.co/buckets/links-ads/fabdem/resolve/tiles";
const OUT_DIR = path.join(process.cwd(), "data", "dem-src");
const FORCE = process.argv.includes("--force");

// CENTRAL_BOUNDS from lib/waterway/basin.ts, rounded out to whole degrees: [[13,19],[98,102]].
const LAT_RANGE = [13, 19];
const LON_RANGE = [98, 102];

// FABDEM's own 10°×10° block name — this mirror groups tiles into a directory per block, one
// level short of just keying files by their own name, so it still needs reconstructing.
function blockDir(lat, lon) {
  const blat = Math.floor(lat / 10) * 10;
  const blon = Math.floor(lon / 10) * 10;
  return `N${blat}E${String(blon).padStart(3, "0")}-N${blat + 10}E${String(blon + 10).padStart(3, "0")}_FABDEM_V1-2`;
}

function tileFile(lat, lon) {
  return `N${String(lat).padStart(2, "0")}E${String(lon).padStart(3, "0")}_FABDEM_V1-2.tif`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(lat, lon, attempts = 5) {
  const name = tileFile(lat, lon);
  const url = `${BASE}/${blockDir(lat, lon)}/${name}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) throw error;
      const wait = 5_000 * attempt;
      console.warn(`  retry ${attempt}/${attempts - 1} in ${wait / 1000}s: ${error.cause?.code ?? error.message}`);
      await sleep(wait);
    }
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const needed = [];
  for (let lat = LAT_RANGE[0]; lat <= LAT_RANGE[1]; lat++) {
    for (let lon = LON_RANGE[0]; lon <= LON_RANGE[1]; lon++) needed.push([lat, lon]);
  }
  const pending = needed.filter(([lat, lon]) => FORCE || !existsSync(path.join(OUT_DIR, tileFile(lat, lon))));
  if (!pending.length) {
    console.log(`All ${needed.length} FABDEM tiles already present in ${path.relative(process.cwd(), OUT_DIR)}/`);
    return;
  }

  let done = needed.length - pending.length;
  for (const [lat, lon] of pending) {
    const name = tileFile(lat, lon);
    const data = await fetchTile(lat, lon);
    // Write then rename, so an interrupted run never leaves a truncated tile that a rerun
    // would then skip as "already downloaded".
    const out = path.join(OUT_DIR, name);
    await writeFile(`${out}.part`, data);
    await rename(`${out}.part`, out);
    done++;
    console.log(`  [${done}/${needed.length}] ${name} (${(data.length / 1e6).toFixed(1)} MB)`);
  }

  console.log(`FABDEM tiles ready in ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
