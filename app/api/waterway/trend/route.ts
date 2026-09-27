import { readFullHistory, readSnapshot } from "@/lib/waterway/snapshot";
import type { LevelStation } from "@/lib/waterway/types";

export const dynamic = "force-dynamic";

const WINDOW_MS = 3 * 60 * 60 * 1000;
const BUCKET_MS = 15 * 60 * 1000;
const STABLE_THRESHOLD_M = 0.05;
const TOP_N = 6;

type Direction = "rising" | "falling" | "stable";

type TrendStation = {
  id: string;
  name: string;
  waterway: string | null;
  district: string | null;
  province: string;
  source: string;
  level: number | null;
  delta: number;
  rateHour: number;
  direction: Direction;
};

export async function GET() {
  const [history, bma, thaiwater] = await Promise.all([
    readFullHistory(),
    readSnapshot("bma"),
    readSnapshot("thaiwater"),
  ]);

  const stationInfo = new Map<string, LevelStation>();
  for (const s of bma?.levels ?? []) stationInfo.set(s.id, s);
  for (const s of thaiwater?.levels ?? []) stationInfo.set(s.id, s);

  const results: TrendStation[] = [];
  const counts = { rising: 0, falling: 0, stable: 0, noData: 0 };
  const buckets = new Map<number, { sum: number; n: number }>();

  for (const [id, series] of Object.entries(history)) {
    const station = stationInfo.get(id);
    if (!station || station.status === "offline") continue;
    if (series.length < 2) {
      counts.noData++;
      continue;
    }
    const latest = series[series.length - 1];
    const windowStart = latest[0] - WINDOW_MS;
    const inWindow = series.filter(([t]) => t >= windowStart);
    const reference = inWindow[0] ?? series[0];
    const deltaM = latest[1] - reference[1];
    const hoursSpan = (latest[0] - reference[0]) / 3_600_000;
    const rateHour = hoursSpan > 0 ? deltaM / hoursSpan : 0;

    let direction: Direction = "stable";
    if (deltaM > STABLE_THRESHOLD_M) direction = "rising";
    else if (deltaM < -STABLE_THRESHOLD_M) direction = "falling";
    counts[direction]++;

    results.push({
      id,
      name: station.name,
      waterway: station.waterway,
      district: station.district,
      province: station.province,
      source: station.source,
      level: station.level,
      delta: deltaM,
      rateHour,
      direction,
    });

    const base = reference[1];
    for (const [t, v] of inWindow) {
      const key = Math.round(t / BUCKET_MS) * BUCKET_MS;
      const bucket = buckets.get(key) ?? { sum: 0, n: 0 };
      bucket.sum += v - base;
      bucket.n++;
      buckets.set(key, bucket);
    }
  }

  const overall = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, { sum, n }]) => ({ t: new Date(t).toISOString(), avg: sum / n }));

  const topRising = [...results]
    .filter((r) => r.direction === "rising")
    .sort((a, b) => b.rateHour - a.rateHour)
    .slice(0, TOP_N);
  const topFalling = [...results]
    .filter((r) => r.direction === "falling")
    .sort((a, b) => a.rateHour - b.rateHour)
    .slice(0, TOP_N);

  return Response.json(
    {
      fetchedAt: new Date().toISOString(),
      windowHours: WINDOW_MS / 3_600_000,
      counts,
      topRising,
      topFalling,
      overall,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
