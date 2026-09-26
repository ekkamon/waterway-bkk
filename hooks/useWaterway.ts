"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  BmaPayload,
  GraphPoint,
  ThaiwaterPayload,
  WaterwayCollection,
} from "@/lib/waterway/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

const REFRESH_MS = 120_000;

export const waterwayQueryKeys = {
  bma: ["waterway", "bma"] as const,
  thaiwater: ["waterway", "thaiwater"] as const,
  geometry: (name: string) => ["waterway", "geometry", name] as const,
  history: (id: string) => ["waterway", "history", id] as const,
  graph: (stationId: number) => ["waterway", "graph", stationId] as const,
};

export function useBmaData() {
  return useQuery({
    queryKey: waterwayQueryKeys.bma,
    queryFn: () => getJson<BmaPayload>("/api/waterway/bma"),
    refetchInterval: REFRESH_MS,
    staleTime: 60_000,
  });
}

export function useThaiwaterData() {
  return useQuery({
    queryKey: waterwayQueryKeys.thaiwater,
    queryFn: () => getJson<ThaiwaterPayload>("/api/waterway/thaiwater"),
    refetchInterval: REFRESH_MS * 2,
    staleTime: 120_000,
  });
}

export function useWaterwayGeometry() {
  return useQuery({
    queryKey: waterwayQueryKeys.geometry("bkk"),
    queryFn: () => getJson<WaterwayCollection>("/data/waterways-bkk.json"),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useStationGraph(stationId: number | null) {
  return useQuery({
    queryKey: waterwayQueryKeys.graph(stationId ?? 0),
    queryFn: () =>
      getJson<GraphPoint[]>(
        `/api/waterway/thaiwater/graph?stationId=${stationId}`,
      ),
    enabled: stationId != null,
    staleTime: 120_000,
  });
}

export function useStationHistory(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: waterwayQueryKeys.history(id ?? ""),
    queryFn: () =>
      getJson<GraphPoint[]>(`/api/waterway/history?id=${encodeURIComponent(id ?? "")}`),
    enabled: enabled && id != null,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
