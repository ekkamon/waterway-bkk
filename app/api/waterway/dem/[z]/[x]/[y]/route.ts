// Serves FABDEM elevation as Terrarium-encoded PNG tiles (same wire format the client's DEM
// loader already decodes — see lib/waterway/flood.ts), sourced from the bare-earth GeoTIFFs
// `npm run fetch:dem` downloads into data/dem-src/. This replaces the AWS Terrain Tiles (SRTM)
// endpoint for the central basin: FABDEM is built specifically to strip the canopy/rooftop bias
// documented in flood.ts, which SRTM does not.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fromFile, type GeoTIFF } from "geotiff";
import { PNG } from "pngjs";
import { NextResponse } from "next/server";

// Every tile is a unique path with its own file-backed cache (see cacheFile below), not
// something Next's static generation should try to prerender.
export const dynamic = "force-dynamic";

// DEM_DATA_DIR mirrors DATA_DIR's role for snapshots (see lib/waterway/snapshot.ts and
// scripts/postbuild-standalone.mjs): the standalone server chdir()s into .next/standalone, so
// process.cwd() there is NOT the project root, and that build directory's data/ is wiped on
// every rebuild anyway. postbuild-standalone.mjs anchors this env var two levels up (the actual
// project root) so tiles fetched once with `npm run fetch:dem` survive rebuilds and are found at
// runtime, instead of each build silently looking in (and finding nothing in) a fresh location.
const SRC_DIR = process.env.DEM_DATA_DIR
  ? path.resolve(process.env.DEM_DATA_DIR)
  : path.join(process.cwd(), "data", "dem-src");
const CACHE_DIR = path.join(path.dirname(SRC_DIR), "dem-tiles");
const TILE = 256;
const ZOOMS = new Set([10, 11, 12]);
// The extent scripts/fetch-dem.mjs downloads (FABDEM tile south-west corners).
const LAT_RANGE = [13, 19];
const LON_RANGE = [98, 101];

type SourceTile = { data: Float32Array; width: number; height: number; west: number; north: number; dx: number; dy: number };

const openTiffs = new Map<string, Promise<GeoTIFF>>();
const rasterCache = new Map<string, SourceTile>();
const RASTER_CACHE_LIMIT = 12; // ~12 × 50 MB float32 tiles, bounded so this stays a modest server process

function sourceTileName(lat: number, lon: number) {
  return `N${String(lat).padStart(2, "0")}E${String(lon).padStart(3, "0")}_FABDEM_V1-2.tif`;
}

async function loadSourceTile(lat: number, lon: number): Promise<SourceTile | null> {
  const key = `${lat}_${lon}`;
  const cached = rasterCache.get(key);
  if (cached) {
    // Re-insert so the Map's iteration order (used for LRU eviction below) reflects recency.
    rasterCache.delete(key);
    rasterCache.set(key, cached);
    return cached;
  }

  const file = path.join(SRC_DIR, sourceTileName(lat, lon));
  if (!existsSync(file)) return null;

  let tiffPromise = openTiffs.get(key);
  if (!tiffPromise) {
    tiffPromise = fromFile(file);
    openTiffs.set(key, tiffPromise);
  }
  const tiff = await tiffPromise;
  const image = await tiff.getImage();
  const [west, south, east, north] = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();
  const [raster] = (await image.readRasters()) as unknown as Float32Array[];

  const tile: SourceTile = {
    data: raster,
    width,
    height,
    west,
    north,
    dx: (east - west) / width,
    dy: (north - south) / height,
  };
  rasterCache.set(key, tile);
  if (rasterCache.size > RASTER_CACHE_LIMIT) {
    const oldest = rasterCache.keys().next().value;
    if (oldest !== undefined) rasterCache.delete(oldest);
  }
  return tile;
}

// Nearest-neighbour sample; FABDEM's own ~30 m pixels are already close to our finest output
// zoom (z12 ≈ 37 m/px), so bilinear here wouldn't add real detail.
function sampleElevation(tile: SourceTile, lat: number, lon: number): number | null {
  const col = Math.floor((lon - tile.west) / tile.dx);
  const row = Math.floor((tile.north - lat) / tile.dy);
  if (col < 0 || col >= tile.width || row < 0 || row >= tile.height) return null;
  const v = tile.data[row * tile.width + col];
  return Number.isFinite(v) && v > -1000 ? v : null; // FABDEM nodata is -9999
}

function pxToLat(py: number, z: number) {
  const n = Math.PI - (2 * Math.PI * py) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
function pxToLng(px: number, z: number) {
  return (px / (TILE * 2 ** z)) * 360 - 180;
}

// Terrarium encoding: value = R*256 + G + B/256 − 32768 (mapzen/joerd's convention, the same
// one AWS Terrain Tiles uses and lib/waterway/flood.ts already decodes on the client).
function encodeTerrarium(elevation: number | null): [number, number, number] {
  if (elevation === null) return [0, 0, 0]; // decodes to −32768, which flood.ts treats as nodata
  const e = elevation + 32768;
  const r = Math.floor(e / 256) & 0xff;
  const g = Math.floor(e) & 0xff;
  const b = Math.round((e % 1) * 256) & 0xff;
  return [r, g, b];
}

export async function GET(_request: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z: zParam, x: xParam, y: yParam } = await params;
  const z = Number(zParam);
  const x = Number(xParam);
  const y = Number(yParam.replace(/\.png$/, ""));
  if (!ZOOMS.has(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return new NextResponse(null, { status: 404 });
  }

  const cacheFile = path.join(CACHE_DIR, String(z), String(x), `${y}.png`);
  if (existsSync(cacheFile)) {
    return new NextResponse(new Uint8Array(await readFile(cacheFile)), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // Quick reject: does this tile's bbox even touch the extent we downloaded?
  const west = pxToLng(x * TILE, z);
  const east = pxToLng((x + 1) * TILE, z);
  const north = pxToLat(y * TILE, z);
  const south = pxToLat((y + 1) * TILE, z);
  if (east < LON_RANGE[0] || west > LON_RANGE[1] + 1 || south < LAT_RANGE[0] || north > LAT_RANGE[1] + 1) {
    return new NextResponse(null, { status: 404 });
  }

  const png = new PNG({ width: TILE, height: TILE });
  let anyData = false;
  for (let py = 0; py < TILE; py++) {
    const lat = pxToLat(y * TILE + py, z);
    for (let px = 0; px < TILE; px++) {
      const lng = pxToLng(x * TILE + px, z);
      const lat0 = Math.floor(lat);
      const lon0 = Math.floor(lng);
      const tile =
        lat0 >= LAT_RANGE[0] && lat0 <= LAT_RANGE[1] && lon0 >= LON_RANGE[0] && lon0 <= LON_RANGE[1]
          ? await loadSourceTile(lat0, lon0)
          : null;
      const elevation = tile ? sampleElevation(tile, lat, lng) : null;
      if (elevation !== null) anyData = true;
      const [r, g, b] = encodeTerrarium(elevation);
      const i = (py * TILE + px) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }

  if (!anyData) return new NextResponse(null, { status: 404 });

  const buffer = PNG.sync.write(png);
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, buffer);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
