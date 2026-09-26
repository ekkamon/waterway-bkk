// Builds static waterway GeoJSON (OpenStreetMap geometry) for Bangkok only.
// Usage: node scripts/fetch-waterways.mjs
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];


const OUT_DIR = path.join(process.cwd(), "public", "data");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "aegis-portal-waterway/1.0",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`${endpoint} -> HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error("no elements");
      return json.elements;
    } catch (err) {
      lastError = err;
      console.warn(`  retry ${attempt + 1}: ${err.message}`);
      await sleep(4000 * (attempt + 1));
    }
  }
  throw lastError;
}

const round = (n) => Math.round(n * 1e5) / 1e5;

function toFeature(el) {
  const coords = [];
  for (const p of el.geometry ?? []) {
    const c = [round(p.lon), round(p.lat)];
    const prev = coords[coords.length - 1];
    if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) coords.push(c);
  }
  if (coords.length < 2) return null;
  const tags = el.tags ?? {};
  const props = { t: tags.waterway };
  const name = tags["name:th"] ?? tags.name;
  if (name) props.n = name;
  if (tags["name:en"]) props.e = tags["name:en"];
  return {
    type: "Feature",
    id: el.id,
    properties: props,
    geometry: { type: "LineString", coordinates: coords },
  };
}

async function write(file, features) {
  await mkdir(OUT_DIR, { recursive: true });
  const body = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(path.join(OUT_DIR, file), body);
  console.log(
    `wrote ${file}: ${features.length} features, ${(body.length / 1e6).toFixed(2)} MB`,
  );
}

async function main() {
  const bkkFile = path.join(OUT_DIR, "waterways-bkk.json");
  if (existsSync(bkkFile) && !process.argv.includes("--force")) {
    console.log("Bangkok file exists, skipping (use --force to refetch)");
  } else {
    console.log("Bangkok (all canals, drains, rivers)...");
    const bkk = await overpass(`[out:json][timeout:200];
area["boundary"="administrative"]["admin_level"="4"]["name:th"="กรุงเทพมหานคร"]->.a;
way["waterway"~"^(river|canal|drain|stream|ditch)$"](area.a);
out geom tags;`);
    await write("waterways-bkk.json", bkk.map(toFeature).filter(Boolean));
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
