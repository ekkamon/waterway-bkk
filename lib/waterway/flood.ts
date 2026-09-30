// Client-side flood sketch for overbank reaches, driven by a DEM served from our own
// /api/waterway/dem (see that route and scripts/fetch-dem.mjs): FABDEM, a bare-earth correction
// of Copernicus GLO-30 that machine-learning-strips canopy and rooftop height — built for
// exactly the bias a raw surface model (SRTM, ASTER, the AWS Terrain Tiles this used before) has
// along a riverbank. Because FABDEM's absolute elevation is trustworthy (checked against 58
// central-basin gauges: FABDEM at the gauge tracks its ม.รทก. level to within a few metres, no
// systematic offset — see git history for the version of this file that tried to route around a
// biased DEM using each gauge's *relative* overbank height instead, which is more moving parts
// for a worse result now that the absolute value can just be trusted directly), the seed surface
// at every river cell is simply the gauge's own water level, unchanged along the reach. Every
// other cell takes the surface of its *nearest* river cell (a height-above-nearest-drainage view)
// and floods when it lies below it and touches already-flooded cells, up to a distance cap.
// Carrying the highest upstream surface instead would pour a sloping river's head water
// kilometres down its own valley. How far that spread is allowed to go is sized per reach from
// its discharge (see `reachRadiusKm`), not one fixed distance for a minor canal and the Chao
// Phraya mainstem alike. The DEM is despiked first (see `despike`) so a lone tree or rooftop
// pixel FABDEM's own correction missed can't wall off an entire flooded reach; a small crossable
// margin right at each seed (see `BANK_CROSSING_M`) covers the rest. It is a screening view, not
// a hydraulic model: no routing, levees, storage or time are simulated — discharge only sets a
// plausible spread radius, not a water balance.

const DEM_URL = "/api/waterway/dem";
const TILE = 256;
const MAX_TILES = 180;
const ZOOMS = [12, 11, 10];
const LOAD_CONCURRENCY = 8;
const NODATA = Number.NEGATIVE_INFINITY;
// SRTM reads sea and big open water as ~0 m; treating it as a wall keeps the gulf from "flooding".
const MIN_LAND = 0.5;
export const MIN_DEPTH = 0.05;
const DEPTH_BIN_M = 0.1;
const DEPTH_BINS = 300;
// How far a flooded reach is allowed to spread scales with its own discharge, not one distance
// for every river: a minor canal at a few m³/s shouldn't reach as far as the Chao Phraya mainstem
// at a couple of thousand. This is a plausibility heuristic, not a water-balance calculation —
// there's no channel geometry, storage or duration here to solve one properly — using the
// sub-linear width-vs-discharge scaling hydraulic geometry studies (Leopold & Maddock 1953)
// consistently find in real channels, so a 16x bigger river gets roughly a 2x bigger radius,
// not 16x. Calibrated so a mid-size gauged reach (~300 m³/s, e.g. the Pasak at S.42) lands near
// the tool's old fixed default of 3 km.
const REFERENCE_DISCHARGE_CMS = 300;
const REFERENCE_RADIUS_KM = 3;
const DISCHARGE_EXPONENT = 0.3;
const MIN_RADIUS_KM = 0.8;
const MAX_RADIUS_KM = 12;
// A cap on plausible depth, mainly to contain a failure mode in hilly terrain (the Pasak's upper
// reaches near Lopburi/Phetchabun are the case that found it): the search radius above limits how
// far a flood is allowed to spread in a straight line, but says nothing about whether the ground
// in between is the river's own floodplain or a separate valley the terrain happens to dip into.
// A gully connecting the two, entirely below the seed's surface, lets the fill pour through and
// pond an unrelated valley up to the river's elevation — a real central-plain flood is a few
// metres deep at most, so once a path implies more than this, it almost certainly is not really
// still in that floodplain, and further spread from it is cut off.
const MAX_DEPTH_M = 6;

function reachRadiusKm(discharge: number, multiplier: number): number {
  const km = REFERENCE_RADIUS_KM * (discharge / REFERENCE_DISCHARGE_CMS) ** DISCHARGE_EXPONENT * multiplier;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, km));
}
// A station reported as overbank is a fact — ThaiWater measured the crossing, not us — so a
// seed cell should never fail to flood just because the one FABDEM pixel under it reads a few
// metres high (a footbridge, a stray reflection). This crossable margin is deliberately small:
// unlike the abandoned relative-height approach, there is no wide, error-prone bank estimate
// here that needs a wide margin to compensate for — one pixel is plenty.
const BANK_CROSSING_M = 40;

export type FloodReach = {
  readonly coords: GeoJSON.Position[];
  /** Gauge level minus bank in metres (negative while below the bank), before any scenario offset. */
  readonly overflow: number;
  /** Gauge water level, ม.รทก. (≈ MSL). */
  readonly level: number;
  /** Best available size estimate for this reach, m³/s — see lib/waterway/central-status.ts. */
  readonly discharge: number;
};

export type FloodOptions = {
  readonly reaches: FloodReach[];
  /** Extra water height added on top of every reach, for "what if it rises further" scenarios. */
  readonly extraRise: number;
  /** Scales the discharge-based spread radius (see `reachRadiusKm`) for exploring scenarios;
   *  1 is the physically-motivated default. */
  readonly distanceMultiplier: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (loaded: number, total: number) => void;
};

type TileState = {
  readonly tx: number;
  readonly ty: number;
  readonly dem: Float32Array;
  readonly wse: Float32Array;
  readonly done: Uint8Array;
};

export type FloodPoint = { depth: number; ground: number; surface: number };

export type FloodResult = {
  readonly zoom: number;
  readonly tiles: TileState[];
  readonly areaKm2: number;
  readonly meanDepth: number;
  /** 95th-percentile depth; the true maximum is usually a single DEM pit (pond, quarry). */
  readonly p95Depth: number;
  readonly reachCount: number;
  readonly depthAt: (lat: number, lng: number) => FloodPoint | null;
};

export const DEPTH_SCALE: { min: number; label: string; rgb: [number, number, number] }[] = [
  { min: 3, label: "> 3 ม.", rgb: [49, 46, 129] },
  { min: 2, label: "2–3 ม.", rgb: [30, 64, 175] },
  { min: 1, label: "1–2 ม.", rgb: [37, 99, 235] },
  { min: 0.5, label: "0.5–1 ม.", rgb: [96, 165, 250] },
  { min: 0, label: "< 0.5 ม.", rgb: [165, 214, 255] },
];

// ---------------------------------------------------------------------------------------------
// Web Mercator helpers (global pixel coordinates at a given zoom)

function lngToPx(lng: number, z: number) {
  return ((lng + 180) / 360) * TILE * 2 ** z;
}

function latToPx(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

function pxToLat(py: number, z: number) {
  const n = Math.PI - (2 * Math.PI * py) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function pxToLng(px: number, z: number) {
  return (px / (TILE * 2 ** z)) * 360 - 180;
}

function metersPerPx(lat: number, z: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

const tileKey = (tx: number, ty: number) => tx * 65536 + ty;

// Dense cell path along every reach, in global pixels at zoom z.
function reachCells(reach: FloodReach, z: number): [number, number][] {
  const out: [number, number][] = [];
  const pts = reach.coords.map(([lng, lat]) => [lngToPx(lng, z), latToPx(lat, z)] as const);
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    if (i === pts.length - 1) {
      out.push([Math.floor(x0), Math.floor(y0)]);
      break;
    }
    const [x1, y1] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k < steps; k++) {
      out.push([Math.floor(x0 + ((x1 - x0) * k) / steps), Math.floor(y0 + ((y1 - y0) * k) / steps)]);
    }
  }
  return out;
}

function neededTiles(reaches: FloodReach[], z: number, multiplier: number): Set<number> {
  const tiles = new Set<number>();
  for (const reach of reaches) {
    const cells = reachCells(reach, z);
    if (!cells.length) continue;
    const lat = reach.coords[0][1];
    const pad = Math.ceil((reachRadiusKm(reach.discharge, multiplier) * 1000) / metersPerPx(lat, z));
    for (let i = 0; i < cells.length; i += 16) {
      const [gx, gy] = cells[i];
      for (let tx = (gx - pad) >> 8; tx <= (gx + pad) >> 8; tx++) {
        for (let ty = (gy - pad) >> 8; ty <= (gy + pad) >> 8; ty++) tiles.add(tileKey(tx, ty));
      }
    }
    const [gx, gy] = cells[cells.length - 1];
    for (let tx = (gx - pad) >> 8; tx <= (gx + pad) >> 8; tx++) {
      for (let ty = (gy - pad) >> 8; ty <= (gy + pad) >> 8; ty++) tiles.add(tileKey(tx, ty));
    }
  }
  return tiles;
}

// ---------------------------------------------------------------------------------------------
// DEM loading (Terrarium PNG: metres = R*256 + G + B/256 − 32768), cached across runs.

const demCache = new Map<string, Promise<Float32Array | null>>();
const DEM_CACHE_LIMIT = 600;

let scratch: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

function scratchContext() {
  if (scratch) return scratch;
  if (typeof OffscreenCanvas !== "undefined") {
    scratch = new OffscreenCanvas(TILE, TILE).getContext("2d", { willReadFrequently: true });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TILE;
    scratch = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!scratch) throw new Error("Canvas 2D is not available");
  return scratch;
}

// A 3×3 median, to strip single-pixel spikes. Terrarium is a surface model (it reads canopy and
// roofs, not bare ground), so a lone tree or rooftop pixel can read several metres above the
// ground around it, and the flood-fill below would treat it as an impassable wall — along a
// densely built, tree-lined bank (Koh Kret) that walls the water in before any realistic rise
// can climb it. A spike is one value in nine, so the median drops it, while anything wider than
// a pixel — a raised road or levee — survives. A minimum filter would also clear the spikes, but
// on the flat plain the DEM is noisy by ±2–3 m pixel to pixel, and taking the lowest of nine
// neighbours pulls the whole ground down ~1.5 m (measured around Ayutthaya and Koh Kret), which
// adds that much false depth everywhere. The median's bias there is ~0.
function despike(raw: Float32Array): Float32Array {
  const out = new Float32Array(TILE * TILE);
  const window = new Float32Array(9);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x;
      if (raw[i] === NODATA) {
        out[i] = NODATA;
        continue;
      }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= TILE) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= TILE) continue;
          const v = raw[yy * TILE + xx];
          if (v === NODATA) continue;
          // Insertion sort; at most nine values.
          let k = n++;
          while (k > 0 && window[k - 1] > v) {
            window[k] = window[k - 1];
            k--;
          }
          window[k] = v;
        }
      }
      out[i] = window[n >> 1];
    }
  }
  return out;
}

async function fetchDem(z: number, tx: number, ty: number): Promise<Float32Array | null> {
  const res = await fetch(`${DEM_URL}/${z}/${tx}/${ty}.png`);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const ctx = scratchContext();
  ctx.clearRect(0, 0, TILE, TILE);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, TILE, TILE);
  const raw = new Float32Array(TILE * TILE);
  for (let i = 0; i < raw.length; i++) {
    const v = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
    raw[i] = v < MIN_LAND ? NODATA : v;
  }
  return raw;
}

function loadDem(z: number, tx: number, ty: number) {
  const key = `${z}/${tx}/${ty}`;
  let entry = demCache.get(key);
  if (!entry) {
    if (demCache.size >= DEM_CACHE_LIMIT) demCache.delete(demCache.keys().next().value!);
    entry = fetchDem(z, tx, ty).catch(() => {
      demCache.delete(key);
      return null;
    });
    demCache.set(key, entry);
  }
  return entry;
}

// ---------------------------------------------------------------------------------------------
// Growable FIFO of cells; breadth-first order hands each cell to its nearest river cell.

class CellQueue {
  private gx = new Int32Array(4096);
  private gy = new Int32Array(4096);
  private surface = new Float32Array(4096);
  private ox = new Int32Array(4096);
  private oy = new Int32Array(4096);
  private maxCells2 = new Float64Array(4096);
  private head = 0;
  private tail = 0;

  get size() {
    return this.tail - this.head;
  }

  /**
   * (ox, oy) is the river cell the water came from, for the straight-line distance cap;
   * maxCells2 is that seed's own reach radius (squared, in cells) — each reach can carry a
   * different one now that it's sized from discharge.
   */
  push(gx: number, gy: number, surface: number, ox: number, oy: number, maxCells2: number) {
    if (this.tail === this.gx.length) this.compact();
    this.gx[this.tail] = gx;
    this.gy[this.tail] = gy;
    this.surface[this.tail] = surface;
    this.ox[this.tail] = ox;
    this.oy[this.tail] = oy;
    this.maxCells2[this.tail] = maxCells2;
    this.tail++;
  }

  shift(out: { gx: number; gy: number; surface: number; ox: number; oy: number; maxCells2: number }) {
    out.gx = this.gx[this.head];
    out.gy = this.gy[this.head];
    out.surface = this.surface[this.head];
    out.ox = this.ox[this.head];
    out.oy = this.oy[this.head];
    out.maxCells2 = this.maxCells2[this.head];
    this.head++;
  }

  private compact() {
    const used = this.tail - this.head;
    const n = used * 2 > this.gx.length ? this.gx.length * 2 : this.gx.length;
    const move = <A extends Int32Array | Float32Array | Float64Array>(src: A, dst: A) => {
      dst.set(src.subarray(this.head, this.tail));
      return dst;
    };
    this.gx = move(this.gx, new Int32Array(n));
    this.gy = move(this.gy, new Int32Array(n));
    this.surface = move(this.surface, new Float32Array(n));
    this.ox = move(this.ox, new Int32Array(n));
    this.oy = move(this.oy, new Int32Array(n));
    this.maxCells2 = move(this.maxCells2, new Float64Array(n));
    this.head = 0;
    this.tail = used;
  }
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function simulateFlood(options: FloodOptions): Promise<FloodResult> {
  const { reaches, extraRise, distanceMultiplier, signal, onProgress } = options;

  let zoom = ZOOMS[ZOOMS.length - 1];
  let wanted = new Set<number>();
  for (const z of ZOOMS) {
    wanted = neededTiles(reaches, z, distanceMultiplier);
    zoom = z;
    if (wanted.size <= MAX_TILES) break;
  }

  // Load DEM tiles with a small worker pool.
  const keys = [...wanted];
  const tiles = new Map<number, TileState>();
  let loaded = 0;
  onProgress?.(0, keys.length);
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      throwIfAborted(signal);
      const key = keys[next++];
      const tx = Math.floor(key / 65536);
      const ty = key % 65536;
      const dem = await loadDem(zoom, tx, ty);
      if (dem) {
        tiles.set(key, {
          tx,
          ty,
          dem: despike(dem),
          wse: new Float32Array(TILE * TILE).fill(NODATA),
          done: new Uint8Array(TILE * TILE),
        });
      }
      onProgress?.(++loaded, keys.length);
    }
  };
  await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
  throwIfAborted(signal);

  const cell = (gx: number, gy: number): [TileState, number] | null => {
    const t = tiles.get(tileKey(gx >> 8, gy >> 8));
    return t ? [t, (gy & 255) * TILE + (gx & 255)] : null;
  };

  // Seed every river cell with the gauge's own water level — trusted directly now (see the
  // top-of-file note), so no per-cell ground sampling is needed here at all.
  const seeds = new Map<number, { gx: number; gy: number; surface: number; maxCells2: number }>();
  let seedLat = 0;
  for (const reach of reaches) {
    const rise = reach.overflow + extraRise;
    if (rise <= 0) continue;
    const surface = reach.level + extraRise;
    const radiusCells = reachRadiusKm(reach.discharge, distanceMultiplier) * 1000;
    for (const [gx, gy] of reachCells(reach, zoom)) {
      const c = cell(gx, gy);
      if (!c || c[0].dem[c[1]] === NODATA) continue;
      const cells = radiusCells / metersPerPx(reach.coords[0][1], zoom);
      const key = gx * 1_048_576 + gy;
      const prev = seeds.get(key);
      if (!prev) seedLat += reach.coords[0][1];
      // Where reaches meet, the lower surface wins — the lower one is the constraint.
      if (!prev || surface < prev.surface) seeds.set(key, { gx, gy, surface, maxCells2: cells * cells });
    }
  }

  const queue = new CellQueue();
  for (const { gx, gy, surface, maxCells2 } of seeds.values()) {
    const [t, i] = cell(gx, gy)!;
    t.done[i] = 1;
    t.wse[i] = surface;
    queue.push(gx, gy, surface, gx, gy, maxCells2);
  }
  // A ring right at each seed is always crossable, so the one pixel directly under a reported
  // overbank reach can't wall off water that is, by the gauge's own reading, already over it.
  const crossing = Math.ceil(BANK_CROSSING_M / metersPerPx(seeds.size ? seedLat / seeds.size : 15, zoom));
  const crossing2 = crossing * crossing;
  const top = { gx: 0, gy: 0, surface: 0, ox: 0, oy: 0, maxCells2: 0 };
  let visited = 0;
  while (queue.size > 0) {
    queue.shift(top);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = top.gx + dx;
      const ny = top.gy + dy;
      const dist2 = (nx - top.ox) ** 2 + (ny - top.oy) ** 2;
      if (dist2 > top.maxCells2) continue;
      const n = cell(nx, ny);
      if (!n) continue;
      const [nt, ni] = n;
      if (nt.done[ni] || nt.dem[ni] === NODATA) continue;
      // Claimed by the nearest river cell even when dry, so a farther, higher reach cannot
      // reach around and flood it later.
      nt.done[ni] = 1;
      nt.wse[ni] = top.surface;
      const crossable = dist2 <= crossing2;
      const depth = top.surface - nt.dem[ni];
      if (depth <= MAX_DEPTH_M && (crossable || depth > 0)) {
        queue.push(nx, ny, top.surface, top.ox, top.oy, top.maxCells2);
      }
    }
    if (++visited % 200_000 === 0) {
      throwIfAborted(signal);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Keep only tiles that ended up with water on them and tally the numbers.
  const flooded: TileState[] = [];
  let areaKm2 = 0;
  let depthSum = 0;
  let cellCount = 0;
  const histogram = new Uint32Array(DEPTH_BINS + 1);
  for (const t of tiles.values()) {
    let count = 0;
    for (let i = 0; i < t.dem.length; i++) {
      if (!t.done[i]) continue;
      const depth = t.wse[i] - t.dem[i];
      // The last hop into a cell can still exceed the cap even though nothing propagates past
      // it (see MAX_DEPTH_M) — excluded here too so an implausible edge cell isn't counted.
      if (depth < MIN_DEPTH || depth > MAX_DEPTH_M) continue;
      count++;
      depthSum += depth;
      histogram[Math.min(Math.floor(depth / DEPTH_BIN_M), DEPTH_BINS)]++;
    }
    cellCount += count;
    if (!count) continue;
    flooded.push(t);
    const lat = pxToLat((t.ty + 0.5) * TILE, zoom);
    areaKm2 += (count * metersPerPx(lat, zoom) ** 2) / 1e6;
  }

  let p95Depth = 0;
  for (let b = 0, seen = 0; b < histogram.length; b++) {
    seen += histogram[b];
    if (seen >= cellCount * 0.95) {
      p95Depth = (b + 1) * DEPTH_BIN_M;
      break;
    }
  }

  const floodedByKey = new Map(flooded.map((t) => [tileKey(t.tx, t.ty), t]));
  return {
    zoom,
    tiles: flooded,
    areaKm2,
    meanDepth: cellCount ? depthSum / cellCount : 0,
    p95Depth,
    reachCount: reaches.length,
    depthAt: (lat, lng) => {
      const gx = Math.floor(lngToPx(lng, zoom));
      const gy = Math.floor(latToPx(lat, zoom));
      const t = floodedByKey.get(tileKey(gx >> 8, gy >> 8));
      if (!t) return null;
      const i = (gy & 255) * TILE + (gx & 255);
      const depth = t.wse[i] - t.dem[i];
      if (!t.done[i] || !(depth >= MIN_DEPTH) || depth > MAX_DEPTH_M) return null;
      return { depth, ground: t.dem[i], surface: t.wse[i] };
    },
  };
}

function depthColor(depth: number) {
  return (DEPTH_SCALE.find((s) => depth >= s.min) ?? DEPTH_SCALE[DEPTH_SCALE.length - 1]).rgb;
}

export function depthHex(index: number) {
  const [r, g, b] = DEPTH_SCALE[index].rgb;
  return `rgb(${r},${g},${b})`;
}

// Paint each flooded tile into an image with its Mercator bounds, ready for L.imageOverlay.
export function renderFloodTiles(result: FloodResult): { url: string; bounds: [[number, number], [number, number]] }[] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const z = result.zoom;
  return result.tiles.map((t) => {
    const img = ctx.createImageData(TILE, TILE);
    for (let i = 0; i < t.dem.length; i++) {
      if (!t.done[i]) continue;
      const depth = t.wse[i] - t.dem[i];
      if (depth < MIN_DEPTH || depth > MAX_DEPTH_M) continue;
      const [r, g, b] = depthColor(depth);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const x0 = t.tx * TILE;
    const y0 = t.ty * TILE;
    return {
      url: canvas.toDataURL("image/png"),
      bounds: [
        [pxToLat(y0 + TILE, z), pxToLng(x0, z)],
        [pxToLat(y0, z), pxToLng(x0 + TILE, z)],
      ],
    };
  });
}
