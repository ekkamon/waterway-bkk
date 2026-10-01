import { CENTRAL_BASINS, damRiverKey, riverKeyOf } from "./basin";
import type { CentralPayload, CentralStation, DamStation, Situation } from "./types";

const HII_BASE = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; aegis-portal)" };
// Gauges report hourly. A reading much older than that means the station is down: ThaiWater keeps
// serving the frozen value and its situation_level, so the only tell is the timestamp.
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

// Dam figures are published once a day and ship inside a ~10 MB feed, so refetch rarely.
const DAM_REFRESH_MS = 60 * 60 * 1000;

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

function normalizeStation(r: Raw): CentralStation | null {
  const basin: string | undefined = r.basin?.basin_name?.th;
  if (!basin || !CENTRAL_BASINS.has(basin)) return null;
  const st = r.station ?? {};
  const lat = toNum(st.tele_station_lat);
  const lng = toNum(st.tele_station_long);
  if (lat == null || lng == null || st.id == null) return null;
  const level = toNum(r.waterlevel_msl);
  const situation = toNum(r.situation_level);
  const updatedAt = toIso(r.waterlevel_datetime);
  const stale = updatedAt == null || Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS;
  const river = typeof r.river_name === "string" ? r.river_name.trim() || null : null;

  return {
    id: `tw-${st.id}`,
    code: st.tele_station_oldcode ?? null,
    name: st.tele_station_name?.th ?? st.tele_station_name?.en ?? "-",
    province: r.geocode?.province_name?.th ?? "-",
    district: r.geocode?.amphoe_name?.th ?? null,
    basin,
    river,
    riverKey: riverKeyOf(river),
    lat,
    lng,
    level,
    previous: toNum(r.waterlevel_msl_previous),
    bankMin: toNum(st.min_bank),
    groundLevel: toNum(st.ground_level),
    bankPercent: toNum(r.storage_percent),
    discharge: toNum(r.discharge),
    stale,
    situation:
      !stale && level != null && situation != null && situation >= 1 && situation <= 5
        ? (situation as Situation)
        : null,
    isKey: st.is_key_station === true,
    updatedAt,
    agency: r.agency?.agency_shortname?.th
      ? `${r.agency.agency_shortname.th} (ThaiWater/สสน.)`
      : "ThaiWater/สสน.",
    graphStationId: toNum(st.id),
  };
}

function normalizeDam(r: Raw): DamStation | null {
  const basin: string | undefined = r.basin?.basin_name?.th;
  if (!basin || !CENTRAL_BASINS.has(basin)) return null;
  const d = r.dam ?? {};
  const lat = toNum(d.dam_lat);
  const lng = toNum(d.dam_long);
  if (lat == null || lng == null || d.id == null) return null;
  // Only a handful of EGAT-operated dams publish a snapshot, and a couple of those are
  // plain http:// (mixed content, blocked on our https page) — keep https only.
  const cctvUrl =
    typeof r.cctv?.url === "string" && r.cctv.url.startsWith("https://") ? r.cctv.url : null;
  return {
    id: `dam-${d.id}`,
    cctvUrl,
    name: d.dam_name?.th ?? d.dam_name?.en ?? "-",
    nameEn: d.dam_name?.en ?? null,
    province: r.geocode?.province_name?.th ?? "-",
    basin,
    riverKey: damRiverKey(basin),
    lat,
    lng,
    storage: toNum(r.dam_storage),
    storagePercent: toNum(r.dam_storage_percent),
    usable: toNum(r.dam_uses_water),
    usablePercent: toNum(r.dam_uses_water_percent),
    inflow: toNum(r.dam_inflow),
    released: toNum(r.dam_released),
    spilled: toNum(r.dam_spilled),
    maxStorage: toNum(d.max_storage),
    normalStorage: toNum(d.normal_storage),
    date: typeof r.dam_date === "string" ? r.dam_date : null,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${HII_BASE}/${path}`, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ThaiWater ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchDams(): Promise<DamStation[]> {
  const json = await getJson<{ dam?: { data?: { data?: Raw[] } } }>("thailand_main");
  return (json.dam?.data?.data ?? [])
    .map(normalizeDam)
    .filter((v): v is DamStation => v !== null);
}

export async function fetchCentral(previous: CentralPayload | null): Promise<CentralPayload> {
  const damsFresh =
    previous?.damsFetchedAt != null &&
    previous.dams.length > 0 &&
    Date.now() - new Date(previous.damsFetchedAt).getTime() < DAM_REFRESH_MS;

  const [levels, dams] = await Promise.all([
    getJson<{ waterlevel_data?: { data?: Raw[] } }>("waterlevel_load"),
    damsFresh
      ? Promise.resolve(null)
      : fetchDams().catch((error) => {
          console.error("[waterway-cron] central dams failed:", error instanceof Error ? error.message : error);
          return null;
        }),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    damsFetchedAt: dams ? new Date().toISOString() : (previous?.damsFetchedAt ?? null),
    dams: dams ?? previous?.dams ?? [],
    stations: (levels.waterlevel_data?.data ?? [])
      .map(normalizeStation)
      .filter((v): v is CentralStation => v !== null),
  };
}
