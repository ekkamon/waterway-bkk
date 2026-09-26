import type { LevelStatus, LevelStation, PumpState } from "./types";

export const LEVEL_STATUS_META: Record<
  LevelStatus,
  { label: string; color: string; rank: number }
> = {
  critical: { label: "ล้นตลิ่ง", color: "#dc2626", rank: 4 },
  warning: { label: "ใกล้ตลิ่ง (ห่าง < 0.6 ม.)", color: "#f97316", rank: 3 },
  normal: { label: "ปกติ", color: "#22c55e", rank: 2 },
  low: { label: "น้ำน้อย (ห่างตลิ่ง > 4 ม.)", color: "#38bdf8", rank: 1 },
  offline: { label: "ขัดข้อง / ไม่มีข้อมูล", color: "#6b7280", rank: 0 },
};

export const PUMP_STATE_META: Record<
  PumpState,
  { label: string; color: string }
> = {
  running: { label: "กำลังสูบน้ำ", color: "#2563eb" },
  standby: { label: "พร้อมทำงาน", color: "#16a34a" },
  offline: { label: "ขัดข้อง / ออฟไลน์", color: "#6b7280" },
};

export const WATERWAY_LINE_COLOR = "#9ca3af";
export const NO_THRESHOLD_COLOR = "#94a3b8";
export const OVERBANK_COLOR = "#dc2626";

// Colour ramp by headroom = metres between the water surface and the lowest bank.
// Red is reserved for overbank (headroom < 0); everything else grades from
// orange (touching the bank) through yellow/green to blue (very low water).
const HEADROOM_STOPS: [number, string][] = [
  [0, "#f97316"],
  [0.6, "#facc15"],
  [1.2, "#a3e635"],
  [2.5, "#22c55e"],
  [4, "#38bdf8"],
];

export const HEADROOM_GRADIENT = `linear-gradient(to right, ${OVERBANK_COLOR} 0%, ${OVERBANK_COLOR} 12%, ${HEADROOM_STOPS.map(
  ([h, c]) => `${c} ${12 + (h / 4) * 88}%`,
).join(", ")})`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function headroomColor(headroom: number): string {
  if (headroom < 0) return OVERBANK_COLOR;
  if (headroom >= HEADROOM_STOPS[HEADROOM_STOPS.length - 1][0]) {
    return HEADROOM_STOPS[HEADROOM_STOPS.length - 1][1];
  }
  for (let i = 0; i < HEADROOM_STOPS.length - 1; i++) {
    const [h0, c0] = HEADROOM_STOPS[i];
    const [h1, c1] = HEADROOM_STOPS[i + 1];
    if (headroom >= h0 && headroom <= h1) {
      const t = (headroom - h0) / (h1 - h0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      const mix = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
    }
  }
  return HEADROOM_STOPS[0][1];
}

// Metres of clearance below the lowest bank. When bank data is missing the
// agency's critical threshold stands in for the bank (never counted as overbank).
export function computeHeadroom(s: {
  level: number | null;
  bankMin: number | null;
  critical: number | null;
}): { value: number; hasBank: boolean } | null {
  if (s.level == null) return null;
  if (s.bankMin != null) return { value: s.bankMin - s.level, hasBank: true };
  if (s.critical != null) {
    return { value: Math.max(s.critical - s.level + 0.3, 0.05), hasBank: false };
  }
  return null;
}

export function levelColor(s: LevelStation): string {
  if (s.status === "offline") return LEVEL_STATUS_META.offline.color;
  return s.headroom == null ? NO_THRESHOLD_COLOR : headroomColor(s.headroom);
}

type LevelDraft = Omit<LevelStation, "status" | "statusText" | "headroom"> & {
  offline: boolean;
};

export function finalizeLevel(draft: LevelDraft): LevelStation {
  const { offline, ...rest } = draft;
  const h = computeHeadroom(rest);
  let status: LevelStatus;
  let statusText: string;
  let headroom: number | null = null;

  if (offline || h == null) {
    status = "offline";
    statusText = offline ? "ขัดข้อง / ไม่มีข้อมูล" : "ไม่มีเกณฑ์อ้างอิง";
  } else {
    headroom = h.value;
    if (h.hasBank && h.value < 0) {
      status = "critical";
      statusText = `ล้นตลิ่ง ${Math.abs(h.value).toFixed(2)} ม.`;
    } else if (h.value < 0.6) {
      status = "warning";
      statusText = h.hasBank ? `ใกล้ตลิ่ง (ห่าง ${h.value.toFixed(2)} ม.)` : "ถึงเกณฑ์วิกฤต (ไม่มีข้อมูลตลิ่ง)";
    } else if (h.value >= 4) {
      status = "low";
      statusText = `น้ำน้อย (ห่างตลิ่ง ${h.value.toFixed(2)} ม.)`;
    } else {
      status = "normal";
      statusText = h.hasBank ? `ห่างตลิ่ง ${h.value.toFixed(2)} ม.` : "ต่ำกว่าเกณฑ์เตือน";
    }
  }
  return { ...rest, status, statusText, headroom };
}

export function formatLevel(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "-" : value.toFixed(2);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export function normalizeWaterwayName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\s.\-–()]/g, "")
    .replace(/^(คลอง|แม่น้ำ|ลำคลอง|ลำราง|คลองสาย)/, "")
    .toLowerCase();
}
