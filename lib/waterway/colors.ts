import {
  headroomColor,
  levelColor,
  normalizeWaterwayName,
} from "./status";
import type { FlowStation, LevelStation, WaterwayCollection } from "./types";

const PROXIMITY_METERS = 250;
const CELL = 0.004; // ~440 m

// A monitoring point contributes its colour and how close the water is to the bank
// (smaller headroom = worse). The worst point wins where several apply to a canal.
type Point = { lat: number; lng: number; color: string; headroom: number };

export function stationCanalKey(station: LevelStation): string {
  return normalizeWaterwayName(station.waterway ?? station.name.split(/\s+/)[0]);
}

function flowHeadroom(f: FlowStation): number | null {
  if (!f.online || f.level == null || f.critical == null) return null;
  return Math.max(f.critical - f.level + 0.3, 0.05);
}

function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dy = (bLat - aLat) * 111_320;
  const dx = (bLng - aLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// Colour per OSM way id:
//  1. named ways -> worst point among stations whose canal name matches;
//  2. unnamed ways -> worst point within PROXIMITY_METERS of any vertex.
// Ways with neither stay uncoloured (no monitoring station on that canal).
export function computeWayColors(
  geometry: WaterwayCollection[],
  levels: LevelStation[],
  flows: FlowStation[],
): Map<number, string> {
  const byName = new Map<string, Point>();
  const points: Point[] = [];

  const worse = (a: Point | undefined, b: Point) =>
    !a || b.headroom < a.headroom ? b : a;

  for (const s of levels) {
    if (s.status === "offline" || s.headroom == null) continue;
    const p = { lat: s.lat, lng: s.lng, color: levelColor(s), headroom: s.headroom };
    const key = stationCanalKey(s);
    if (key.length >= 2) byName.set(key, worse(byName.get(key), p));
    points.push(p);
  }
  for (const f of flows) {
    const headroom = flowHeadroom(f);
    if (headroom == null) continue;
    const p = { lat: f.lat, lng: f.lng, color: headroomColor(headroom), headroom };
    const key = normalizeWaterwayName(f.waterway);
    if (key.length >= 2) byName.set(key, worse(byName.get(key), p));
    points.push(p);
  }

  const grid = new Map<string, Point[]>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / CELL)}:${Math.floor(p.lng / CELL)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  }

  const nearest = (lat: number, lng: number): Point | undefined => {
    const cy = Math.floor(lat / CELL);
    const cx = Math.floor(lng / CELL);
    let result: Point | undefined;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const p of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (meters(lat, lng, p.lat, p.lng) <= PROXIMITY_METERS) {
            result = worse(result, p);
          }
        }
      }
    }
    return result;
  };

  const out = new Map<number, string>();
  for (const collection of geometry) {
    for (const feature of collection.features) {
      const id = feature.id as number;
      const name = feature.properties.n;
      if (name) {
        const hit = byName.get(normalizeWaterwayName(name));
        if (hit) out.set(id, hit.color);
        continue;
      }
      let best: Point | undefined;
      for (const [lng, lat] of feature.geometry.coordinates) {
        const near = nearest(lat, lng);
        if (near) best = worse(best, near);
      }
      if (best) out.set(id, best.color);
    }
  }
  return out;
}
