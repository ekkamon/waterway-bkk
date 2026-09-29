// Builds simplified GeoJSON of the major rivers that drain into Bangkok and the
// central-region river mouths (Chao Phraya system + Tha Chin + Mae Klong).
// Usage: node scripts/fetch-central-rivers.mjs [--force]
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const OUT_FILE = path.join(process.cwd(), "public", "data", "rivers-central.json");
const TOLERANCE_DEG = 0.0015;

// OSM name -> river key used by lib/waterway/basin.ts
const RIVERS = {
  "แม่น้ำปิง": "ping",
  "แม่น้ำวัง": "wang",
  "แม่น้ำยม": "yom",
  "แม่น้ำน่าน": "nan",
  "แม่น้ำเจ้าพระยา": "chaophraya",
  "แม่น้ำป่าสัก": "pasak",
  "แม่น้ำสะแกกรัง": "sakaekrang",
  "แม่น้ำน้อย": "noi",
  "แม่น้ำลพบุรี": "lopburi",
  "แม่น้ำท่าจีน": "thachin",
  "แม่น้ำสุพรรณบุรี": "thachin",
  "แม่น้ำนครชัยศรี": "thachin",
  "แม่น้ำมะขามเฒ่า": "thachin",
  "แม่น้ำแม่กลอง": "maeklong",
  "แม่น้ำแควใหญ่": "maeklong",
  "แม่น้ำแควน้อย": "maeklong",
};

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
        signal: AbortSignal.timeout(180_000),
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

function perpendicular(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

const round = (n) => Math.round(n * 1e4) / 1e4;

async function main() {
  if (existsSync(OUT_FILE) && !process.argv.includes("--force")) {
    console.log("rivers-central.json exists, skipping (use --force to refetch)");
    return;
  }
  const names = Object.keys(RIVERS).map((n) => n.replace("แม่น้ำ", "")).join("|");
  console.log("Major central-region rivers...");
  const ways = await overpass(`[out:json][timeout:240];
way["waterway"="river"]["name"~"^แม่น้ำ(${names})$"](12.9,98.3,19.95,101.6);
out geom tags;`);

  const features = [];
  for (const way of ways) {
    const name = way.tags?.["name:th"] ?? way.tags?.name;
    const river = RIVERS[name];
    if (!river) continue;
    const coords = simplify(
      (way.geometry ?? []).map((p) => [p.lon, p.lat]),
      TOLERANCE_DEG,
    ).map(([x, y]) => [round(x), round(y)]);
    if (coords.length < 2) continue;
    features.push({
      type: "Feature",
      id: way.id,
      properties: { r: river, n: name },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const body = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(OUT_FILE, body);
  const counts = {};
  for (const f of features) counts[f.properties.r] = (counts[f.properties.r] ?? 0) + 1;
  console.log(`wrote rivers-central.json: ${features.length} ways, ${(body.length / 1e6).toFixed(2)} MB`, counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
