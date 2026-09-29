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
  const byRiver = new Map<RiverKey, CentralStation[]>();
  for (const s of stations) {
    if (!s.riverKey || !s.situation) continue;
    const list = byRiver.get(s.riverKey) ?? [];
    list.push(s);
    byRiver.set(s.riverKey, list);
  }
  const colors = new Map<string | number, string>();
  for (const f of rivers.features) {
    const candidates = byRiver.get(f.properties.r);
    const coords = f.geometry.coordinates;
    const [lng, lat] = coords[Math.floor(coords.length / 2)];
    let best: { d: number; s: CentralStation } | null = null;
    for (const s of candidates ?? []) {
      const d = km(lat, lng, s.lat, s.lng);
      if (d <= MAX_MATCH_KM && (!best || d < best.d)) best = { d, s };
    }
    if (best && f.id != null) colors.set(f.id, stationColor(best.s));
  }
  return colors;
}
