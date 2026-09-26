import { finalizeLevel } from "./status";
import type { GraphPoint, LevelStation, ThaiwaterPayload } from "./types";

const HII_BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";
const REVALIDATE_SECONDS = 300;

const BANGKOK = "กรุงเทพมหานคร";

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const toIso = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00` : null;
};

const SITUATION_TEXT: Record<number, string> = {
  1: "น้ำน้อยวิกฤต",
  2: "น้ำน้อย",
  3: "น้ำปกติ",
  4: "น้ำมาก",
  5: "ล้นตลิ่ง",
};

function normalize(r: Raw): LevelStation | null {
  const st = r.station ?? {};
  const lat = toNum(st.tele_station_lat);
  const lng = toNum(st.tele_station_long);
  const province: string | undefined = r.geocode?.province_name?.th;
  if (lat == null || lng == null || !province || province !== BANGKOK) {
    return null;
  }

  const level = toNum(r.waterlevel_msl);

  return finalizeLevel({
    offline: level == null,
    agencyStatus: SITUATION_TEXT[Number(r.situation_level)] ?? null,
    id: `hii-${st.id}`,
    source: "thaiwater",
    code: st.tele_station_oldcode ?? null,
    name: st.tele_station_name?.th ?? st.tele_station_name?.en ?? "-",
    nameEn: st.tele_station_name?.en ?? null,
    waterway: null,
    district: r.geocode?.amphoe_name?.th ?? null,
    province,
    lat,
    lng,
    level,
    levelOut: null,
    previous: toNum(r.waterlevel_msl_previous),
    warning: toNum(st.warning_level_m),
    critical: toNum(st.critical_level_m),
    warningOut: null,
    criticalOut: null,
    bankLeft: null,
    bankRight: null,
    bankMin: toNum(st.min_bank),
    bedLevel: toNum(st.ground_level),
    maxToday: null,
    maxYesterday: null,
    updatedAt: toIso(r.waterlevel_datetime),
    agency: r.agency?.agency_shortname?.th
      ? `${r.agency.agency_shortname.th} (ThaiWater/สสน.)`
      : "ThaiWater/สสน.",
    isGate: false,
    url: `https://www.thaiwater.net/water/wl`,
    graphStationId: toNum(st.id),
  });
}

export async function fetchThaiwater(): Promise<ThaiwaterPayload> {
  const res = await fetch(`${HII_BASE}/waterlevel_load`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ThaiWater waterlevel_load -> HTTP ${res.status}`);
  const json = (await res.json()) as { waterlevel_data?: { data?: Raw[] } };
  const rows = json.waterlevel_data?.data ?? [];
  return {
    fetchedAt: new Date().toISOString(),
    levels: rows.map(normalize).filter((v): v is LevelStation => v !== null),
  };
}

export async function fetchThaiwaterGraph(
  stationId: number,
): Promise<GraphPoint[]> {
  const url = `${HII_BASE}/waterlevel_graph?station_type=tele_waterlevel&station_id=${stationId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`ThaiWater graph -> HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: { graph_data?: { datetime: string; value: number | null }[] };
  };
  return (json.data?.graph_data ?? []).map((p) => ({
    time: toIso(p.datetime) ?? p.datetime,
    value: toNum(p.value),
  }));
}
