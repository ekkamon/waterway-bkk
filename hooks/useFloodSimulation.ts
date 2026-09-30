"use client";

import { useEffect, useMemo, useState } from "react";

import { bankReaches } from "@/lib/waterway/central-status";
import { simulateFlood, type FloodResult } from "@/lib/waterway/flood";
import type { CentralStation, RiverCollection } from "@/lib/waterway/types";

type FloodState = {
  status: "idle" | "loading" | "ready" | "error";
  progress: { loaded: number; total: number } | null;
  result: FloodResult | null;
  error: string | null;
};

const IDLE: FloodState = { status: "idle", progress: null, result: null, error: null };

export function useFloodSimulation({
  enabled,
  rivers,
  stations,
  extraRise,
}: {
  readonly enabled: boolean;
  readonly rivers: RiverCollection | undefined;
  readonly stations: CentralStation[];
  readonly extraRise: number;
}) {
  // Any segment floods once its current level plus the scenario rise tops the bank, so raising
  // the slider brings in orange and green reaches too, not only the ones already overbank.
  const reaches = useMemo(
    () =>
      enabled && rivers
        ? bankReaches(rivers, stations).filter((r) => r.overflow + extraRise > 0)
        : [],
    [enabled, rivers, stations, extraRise],
  );
  // Station data refetches every few minutes; only rerun when the flooding reaches actually change.
  const reachKey = reaches.map((r) => `${r.station.id}:${r.overflow.toFixed(2)}:${r.coords.length}`).join("|");
  const stationCount = new Set(reaches.map((r) => r.station.id)).size;

  const [state, setState] = useState<FloodState>(IDLE);

  useEffect(() => {
    if (!enabled || !reaches.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, status: "loading", progress: null, error: null }));
      simulateFlood({
        reaches,
        extraRise,
        distanceMultiplier: 1,
        signal: controller.signal,
        onProgress: (loaded, total) =>
          setState((prev) => ({ ...prev, progress: { loaded, total } })),
      })
        .then((result) => setState({ status: "ready", progress: null, result, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            status: "error",
            progress: null,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // reachKey stands in for `reaches`, which is a new array on every station refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reachKey, extraRise]);

  const active = enabled && reaches.length > 0;
  return { ...(active ? state : IDLE), reachCount: reaches.length, stationCount };
}
