import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchBma } from "./bma";
import { fetchThaiwater } from "./thaiwater";
import type { BmaPayload, ThaiwaterPayload } from "./types";

// DATA_DIR keeps snapshots outside the build folder so a rebuild does not wipe history.
const SNAPSHOT_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data", "snapshots");
const HISTORY_FILE = path.join(SNAPSHOT_DIR, "history.json");
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

type History = Record<string, [number, number][]>;

async function readHistory(): Promise<History> {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, "utf8")) as History;
  } catch {
    return {};
  }
}

export async function readStationHistory(id: string): Promise<[number, number][]> {
  return (await readHistory())[id] ?? [];
}

async function appendHistory(levels: { id: string; level: number | null }[]) {
  const now = Date.now();
  const history = await readHistory();
  for (const { id, level } of levels) {
    if (level == null) continue;
    const series = (history[id] ??= []);
    const last = series[series.length - 1];
    if (last && now - last[0] < 60_000) continue;
    series.push([now, level]);
  }
  for (const id of Object.keys(history)) {
    history[id] = history[id].filter(([t]) => now - t <= HISTORY_WINDOW_MS);
    if (history[id].length === 0) delete history[id];
  }
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const tmp = `${HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(history));
  await rename(tmp, HISTORY_FILE);
}

type SnapshotMap = { bma: BmaPayload; thaiwater: ThaiwaterPayload };
export type SnapshotName = keyof SnapshotMap;

async function writeSnapshot<K extends SnapshotName>(name: K, data: SnapshotMap[K]) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, `${name}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

export async function readSnapshot<K extends SnapshotName>(
  name: K,
): Promise<SnapshotMap[K] | null> {
  try {
    const raw = await readFile(path.join(SNAPSHOT_DIR, `${name}.json`), "utf8");
    return JSON.parse(raw) as SnapshotMap[K];
  } catch {
    return null;
  }
}

let running: Promise<void> | null = null;

// Sources are refreshed independently so one failing upstream keeps the other's
// snapshot fresh; a failed source simply keeps its previous snapshot.
export function refreshSnapshots(): Promise<void> {
  running ??= (async () => {
    const jobs: [SnapshotName, () => Promise<SnapshotMap[SnapshotName]>][] = [
      ["bma", fetchBma],
      ["thaiwater", fetchThaiwater],
    ];
    await Promise.all(
      jobs.map(async ([name, fetcher]) => {
        try {
          const data = (await fetcher()) as SnapshotMap[SnapshotName];
          await writeSnapshot(name, data as never);
          if ("levels" in data) await appendHistory(data.levels);
          console.log(`[waterway-cron] ${name} updated`);
        } catch (error) {
          console.error(`[waterway-cron] ${name} failed:`, error instanceof Error ? error.message : error);
        }
      }),
    );
  })().finally(() => {
    running = null;
  });
  return running;
}
