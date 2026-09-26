import { finalizeLevel } from "./status";
import type {
  BmaPayload,
  FlowStation,
  LevelStation,
  PumpStation,
  PumpUnit,
} from "./types";

const BMA_BASE = "https://weather.bangkok.go.th";
const STALE_MINUTES = 60;

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

// "26/09/2569 17:30" (Buddhist year) or "2026/09/26 17:30" -> ISO with +07:00
function parseBmaTime(th: unknown, en: unknown): string | null {
  const enStr = str(en);
  if (enStr) {
    const m = enStr.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`;
  }
  const thStr = str(th);
  if (thStr) {
    const m = thStr.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
    if (m) {
      const year = Number(m[3]) - 543;
      return `${year}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+07:00`;
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(
  path: string,
  init?: { method?: "POST"; body?: string },
): Promise<T> {
  let lastError = "unknown";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${BMA_BASE}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)",
          Accept: "application/json, text/plain, */*",
          ...(init?.body
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        body: init?.body,
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) return (await res.json()) as T;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`BMA ${path} -> ${lastError}`);
}

function minOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function normalizeLevel(r: Raw): LevelStation | null {
  const lat = num(r.latitude);
  const lng = num(r.longitude);
  if (lat == null || lng == null) return null;

  const level = num(r.wl_in);
  const gateCount = num(r.water_gate_count) ?? 0;
  const offline = level == null || (num(r.datediffnow) ?? 0) > STALE_MINUTES;
  const waterway = str(r.river_name);

  return finalizeLevel({
    offline,
    agencyStatus: str(r.txtStatus),
    id: `bma-wl-${r.water_id}`,
    source: "bma",
    code: str(r.water_code),
    name: str(r.water_name) ?? str(r.water_shortname) ?? "-",
    nameEn: str(r.water_name_en),
    waterway,
    district: str(r.district_name),
    province: "กรุงเทพมหานคร",
    lat,
    lng,
    level,
    levelOut: num(r.wl_out01),
    previous: null,
    warning: num(r.warning),
    critical: num(r.critical),
    warningOut: num(r.warning_out01),
    criticalOut: num(r.critical_out01),
    bankLeft: num(r.left_bank),
    bankRight: num(r.right_bank),
    bankMin: minOf(num(r.left_bank), num(r.right_bank)),
    bedLevel: null,
    maxToday: num(r.max_in_day),
    maxYesterday: num(r.max_in_yesterday),
    updatedAt: parseBmaTime(r.site_timestampTH, r.site_timestampEN),
    agency: "สำนักการระบายน้ำ กทม.",
    isGate: gateCount > 0,
    url: str(r.water_url) ?? `${BMA_BASE}/water/StationDetail?id=${r.water_id}`,
    graphStationId: null,
  });
}

function normalizePump(r: Raw): PumpStation | null {
  const lat = num(r.latitude);
  const lng = num(r.longitude);
  if (lat == null || lng == null) return null;

  const pumpCount = num(r.pump_count) ?? 0;
  const units: PumpUnit[] = [];
  for (let i = 1; i <= Math.max(1, Math.min(pumpCount, 5)); i++) {
    if (r[`pump_status${i}`] == null && i > pumpCount) break;
    units.push({
      no: i,
      running: r[`pump_status${i}`] === 1,
      tripped: r[`pump_trip_status${i}`] === true,
    });
  }

  const rtuOnline = r.rtu_status === true || r.rtu_status === 1;
  const stale = (num(r.datediff) ?? 0) > STALE_MINUTES;
  const anyRunning = units.some((u) => u.running && !u.tripped);
  const state = !rtuOnline || stale ? "offline" : anyRunning ? "running" : "standby";

  return {
    id: `bma-pump-${r.pumpStation_id}`,
    code: str(r.pumpStation_code) ?? "-",
    name: str(r.pumpStation_name) ?? str(r.pump_shortname) ?? "-",
    nameEn: str(r.pumpStation_name_en),
    district: str(r.district_name) ?? "-",
    side: null,
    lat,
    lng,
    pumpCount,
    capacityCms: num(r.pump_capacity),
    units,
    state,
    waterLevel: num(r.water_level),
    rtuOnline,
    plcOnline: r.plc_status === true,
    doorOpen: r.door_status === false,
    lampAlarm: r.lamp_alarm === true,
    paAlarm: r.pa_alarm === true,
    updatedAt: parseBmaTime(r.site_timestampTH, null),
    url: str(r.pump_url) ?? `${BMA_BASE}/Pump/StationDetail?id=${r.pumpStation_id}`,
  };
}

function normalizeFlow(r: Raw): FlowStation | null {
  const lat = num(r.latitude);
  const lng = num(r.longitude);
  if (lat == null || lng == null) return null;
  return {
    id: `bma-flow-${r.flow_id}`,
    code: str(r.flow_code) ?? "-",
    name: str(r.flow_name) ?? str(r.flow_shortname) ?? "-",
    nameEn: str(r.flow_name_en),
    waterway: str(r.river_name),
    district: str(r.district_name) ?? "-",
    lat,
    lng,
    discharge: num(r.flow),
    level: num(r.wl),
    velocity: num(r.mean_velocity),
    area: num(r.area),
    warning: num(r.warning),
    critical: num(r.critical),
    statusText: str(r.chkStatustxt) ?? "-",
    online: r.conn_status === 1,
    updatedAt: parseBmaTime(r.site_timestampTH, null),
    url: str(r.flow_url) ?? `${BMA_BASE}/flow/StationDetail?id=${r.flow_id}`,
  };
}

export async function fetchBma(): Promise<BmaPayload> {
  const water = await getJson<Raw[]>("/water/PageMap/GoogleMap", {
    method: "POST",
    body: "payload=aegis",
  });
  const pump = await getJson<{ LastPump?: Raw[]; waterTbl?: Raw[] }>(
    "/Pump/Map/GetData?id=0",
  );
  const flow = await getJson<{ dtTableWl?: Raw[] }>("/flow/PageMap/GetData?id=0");

  const pumpRows = pump.LastPump?.length ? pump.LastPump : (pump.waterTbl ?? []);
  const sideById = new Map<string, string>();
  for (const row of pump.waterTbl ?? []) {
    const side = str(row.area_name);
    if (side) sideById.set(String(row.pumpStation_id), side);
  }

  return {
    fetchedAt: new Date().toISOString(),
    levels: water.map(normalizeLevel).filter((v): v is LevelStation => v !== null),
    pumps: pumpRows
      .map(normalizePump)
      .filter((v): v is PumpStation => v !== null)
      .map((p) => ({
        ...p,
        side: sideById.get(p.id.replace("bma-pump-", "")) ?? null,
      })),
    flows: (flow.dtTableWl ?? [])
      .map(normalizeFlow)
      .filter((v): v is FlowStation => v !== null),
  };
}
