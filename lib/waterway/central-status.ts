import { RIVER_META } from "./basin";
import type {
  CentralStation,
  DamStation,
  RiverCollection,
  RiverKey,
  Situation,
} from "./types";

// Same colour meaning as the Bangkok view: red = overbank, orange = high, green = normal,
// sky = low. ThaiWater's own palette uses blue for "high water", which would contradict it.
export const SITUATION_META: Record<Situation, { label: string; color: string }> = {
  5: { label: "ล้นตลิ่ง", color: "#dc2626" },
  4: { label: "น้ำมาก", color: "#f97316" },
  3: { label: "ปกติ", color: "#22c55e" },
  2: { label: "น้ำน้อย", color: "#38bdf8" },
  1: { label: "น้ำน้อยวิกฤต", color: "#a16207" },
};

export const NO_DATA = { label: "ไม่มีข้อมูล", color: "#6b7280" };
export const RIVER_BASE_COLOR = "#94a3b8";

export const SITUATION_ORDER: Situation[] = [5, 4, 3, 2, 1];

export function stationColor(s: CentralStation): string {
  return s.situation ? SITUATION_META[s.situation].color : NO_DATA.color;
}

export function stationLabel(s: CentralStation): string {
  return s.situation ? SITUATION_META[s.situation].label : NO_DATA.label;
}

export const DAM_SCALE: { min: number; label: string; color: string }[] = [
  { min: 100, label: "เกินความจุปกติ (>100%)", color: "#dc2626" },
  { min: 80, label: "น้ำมาก (81–100%)", color: "#f97316" },
  { min: 50, label: "ปกติ (51–80%)", color: "#22c55e" },
  { min: 30, label: "ค่อนข้างน้อย (31–50%)", color: "#38bdf8" },
  { min: -Infinity, label: "น้ำน้อย (≤30%)", color: "#a16207" },
];

export function damColor(d: DamStation): string {
  if (d.storagePercent == null) return NO_DATA.color;
  return DAM_SCALE.find((s) => d.storagePercent! > s.min)?.color ?? NO_DATA.color;
}

export function damLabel(d: DamStation): string {
  if (d.storagePercent == null) return NO_DATA.label;
  return DAM_SCALE.find((s) => d.storagePercent! > s.min)?.label ?? NO_DATA.label;
}

export function formatNumber(v: number | null | undefined, digits = 2): string {
  return v == null || Number.isNaN(v)
    ? "-"
    : v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const MAX_MATCH_KM = 45;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dy = (bLat - aLat) * 111.32;
  const dx = (bLng - aLng) * 111.32 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// Each river segment takes the colour of the nearest reporting station on the same river,
// so the lines show where along the route the water is high.
export function computeRiverColors(
  rivers: RiverCollection,
  stations: CentralStation[],
): Map<string | number, string> {
  const colors = new Map<string | number, string>();
  for (const [id, s] of matchRiverStations(rivers, stations)) colors.set(id, stationColor(s));
  return colors;
}

// A river-wide fallback for stations that report no discharge of their own: most ThaiWater
// telemetry stations measure level only, not flow, so without this most reaches would have no
// size signal at all. Assumes discharge doesn't jump much over a short reach absent a confluence.
function nearestDischarge(stations: CentralStation[], riverKey: RiverKey, lat: number, lng: number): number | null {
  let best: { d: number; discharge: number } | null = null;
  for (const s of stations) {
    if (s.riverKey !== riverKey || s.discharge == null) continue;
    const d = km(lat, lng, s.lat, s.lng);
    if (!best || d < best.d) best = { d, discharge: s.discharge };
  }
  return best?.discharge ?? null;
}

// RIVER_META's hand-set line weight (1 = a minor canal, 4.5 = the Chao Phraya mainstem) is the
// last resort when a river has no discharge reading anywhere on it: scaled so a weight of 3
// (a typical named tributary — the Ping, the Pasak) lands near 300 m³/s, the rough middle of
// what our gauged reaches actually report.
function weightDischarge(riverKey: RiverKey): number {
  return ((RIVER_META[riverKey]?.weight ?? 2) / 3) * 300;
}

// Every coloured segment whose nearest station reports a level and a bank, with how far above
// (positive) or below (negative) the bank that station reads — the input for the DEM flood
// sketch, which floods a segment once its level plus the scenario rise tops the bank. `discharge`
// is the best size estimate available for that reach (see aboveDischarge helpers), never null,
// for sizing how far a flooded reach should be allowed to spread.
export function bankReaches(
  rivers: RiverCollection,
  stations: CentralStation[],
): { coords: GeoJSON.Position[]; overflow: number; level: number; discharge: number; station: CentralStation }[] {
  const matches = matchRiverStations(rivers, stations);
  const out: { coords: GeoJSON.Position[]; overflow: number; level: number; discharge: number; station: CentralStation }[] = [];
  for (const f of rivers.features) {
    const s = f.id != null ? matches.get(f.id) : undefined;
    if (!s || s.level == null || s.bankMin == null || !s.riverKey) continue;
    const discharge = s.discharge ?? nearestDischarge(stations, s.riverKey, s.lat, s.lng) ?? weightDischarge(s.riverKey);
    out.push({ coords: f.geometry.coordinates, overflow: s.level - s.bankMin, level: s.level, discharge, station: s });
  }
  return out;
}

export function matchRiverStations(
  rivers: RiverCollection,
  stations: CentralStation[],
): Map<string | number, CentralStation> {
  const byRiver = new Map<RiverKey, CentralStation[]>();
  for (const s of stations) {
    if (!s.riverKey || !s.situation) continue;
    const list = byRiver.get(s.riverKey) ?? [];
    list.push(s);
    byRiver.set(s.riverKey, list);
  }
  const matches = new Map<string | number, CentralStation>();
  for (const f of rivers.features) {
    const candidates = byRiver.get(f.properties.r);
    const coords = f.geometry.coordinates;
    const [lng, lat] = coords[Math.floor(coords.length / 2)];
    let best: { d: number; s: CentralStation } | null = null;
    for (const s of candidates ?? []) {
      const d = km(lat, lng, s.lat, s.lng);
      if (d <= MAX_MATCH_KM && (!best || d < best.d)) best = { d, s };
    }
    if (best && f.id != null) matches.set(f.id, best.s);
  }
  return matches;
}
