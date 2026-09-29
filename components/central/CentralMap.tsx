"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";

import type { UserLocation } from "@/hooks/useGeolocation";
import { CENTRAL_BOUNDS, RIVER_META } from "@/lib/waterway/basin";
import {
  RIVER_BASE_COLOR,
  computeRiverColors,
  damColor,
  stationColor,
} from "@/lib/waterway/central-status";
import { formatLevel } from "@/lib/waterway/status";
import type {
  CentralStation,
  DamStation,
  RiverCollection,
  RiverFeatureProps,
} from "@/lib/waterway/types";

export type CentralSelection = { kind: "station" | "dam"; id: string } | null;

type CentralMapProps = {
  readonly rivers: RiverCollection | undefined;
  readonly stations: CentralStation[];
  readonly colorStations: CentralStation[];
  readonly dams: DamStation[];
  readonly showAll: boolean;
  readonly selection: CentralSelection;
  readonly onSelect: (selection: CentralSelection) => void;
  readonly userLocation: UserLocation | null;
  readonly focusUserToken: number;
};

const HIGH_WATER_ZOOM = 8;
const ALL_STATIONS_ZOOM = 9;
const LABEL_ZOOM = 10;
const DAM_NAME_ZOOM = 8;

function isCoarse(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Progressive disclosure: the overview shows only dams and key main-river stations;
// more detail appears as the viewer zooms into a reach.
function stationVisible(s: CentralStation, zoom: number, showAll: boolean, selected: boolean) {
  if (showAll || selected) return true;
  if (s.isKey && s.riverKey) return true;
  if (zoom >= ALL_STATIONS_ZOOM) return true;
  return zoom >= HIGH_WATER_ZOOM && (s.situation ?? 0) >= 4;
}

function stationIcon(s: CentralStation, zoom: number, selected: boolean): L.DivIcon {
  const color = stationColor(s);
  const coarse = isCoarse();
  const ring = selected ? "box-shadow:0 0 0 3px rgba(17,24,39,.85);" : "";
  if (zoom >= LABEL_ZOOM) {
    const label = `${s.code ? `${escapeHtml(s.code)} · ` : ""}${formatLevel(s.level)}`;
    const pad = coarse ? "padding:4px 9px;font-size:12px;" : "padding:1px 6px;font-size:11px;";
    return L.divIcon({
      className: "",
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      html: `<div style="transform:translate(-50%,-50%);display:inline-flex;white-space:nowrap;${pad}border-radius:999px;background:${color};color:#fff;font-weight:600;line-height:16px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);${ring}">${label}</div>`,
    });
  }
  const key = s.isKey && s.riverKey;
  const size = selected ? 16 : key ? (coarse ? 15 : 12) : coarse ? 11 : 8;
  const hit = coarse ? 36 : size + 8;
  const outline = key ? "0 0 0 1px rgba(15,23,42,.55)," : "";
  return L.divIcon({
    className: "",
    iconSize: [hit, hit],
    iconAnchor: [hit / 2, hit / 2],
    html: `<div style="width:${hit}px;height:${hit}px;display:flex;align-items:center;justify-content:center;"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${key ? 2 : 1.5}px solid #fff;box-shadow:${outline}0 1px 3px rgba(0,0,0,.4);${ring}"></div></div>`,
  });
}

function damIcon(d: DamStation, zoom: number, selected: boolean): L.DivIcon {
  const color = damColor(d);
  const pct = d.storagePercent;
  const fill = pct == null ? 0 : Math.max(0, Math.min(pct, 100));
  const ring = selected ? "outline:3px solid rgba(17,24,39,.85);outline-offset:1px;" : "";
  const text = `${zoom >= DAM_NAME_ZOOM ? `${escapeHtml(d.name)} ` : ""}${pct == null ? "-" : `${Math.round(pct)}%`}`;
  const cctvDot = d.cctvUrl
    ? `<div style="position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:#dc2626;border:1.5px solid #fff;"></div>`
    : "";
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="transform:translate(-9px,-13px);width:max-content;display:flex;align-items:center;gap:3px;cursor:pointer;">
<div style="flex-shrink:0;box-sizing:border-box;position:relative;width:18px;height:26px;border:2px solid #0f172a;border-radius:4px;background:#fff;overflow:visible;box-shadow:0 1px 4px rgba(0,0,0,.45);${ring}"><div style="position:absolute;left:0;right:0;bottom:0;height:${fill}%;background:${color};border-radius:0 0 2px 2px;overflow:hidden;"></div>${cctvDot}</div>
<div style="white-space:nowrap;background:rgba(255,255,255,.95);border-radius:4px;padding:0 4px;font-size:11px;font-weight:700;line-height:17px;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,.3);border-left:3px solid ${color};">${text}</div>
</div>`,
  });
}

function safeFlyTo(map: L.Map, point: L.LatLngExpression, zoom: number, offset: [number, number] = [0, 0]) {
  const target =
    offset[0] || offset[1] ? map.unproject(map.project(point, zoom).add(offset), zoom) : point;
  if (!map.getSize().x || !map.getSize().y) map.invalidateSize({ animate: false });
  try {
    if (map.getSize().x && map.getSize().y) {
      map.flyTo(target, zoom, { duration: 0.8 });
      return;
    }
  } catch {
    // fall through to a plain setView
  }
  map.setView(target, zoom, { animate: false });
}

export default function CentralMap({
  rivers,
  stations,
  colorStations,
  dams,
  showAll,
  selection,
  onSelect,
  userLocation,
  focusUserToken,
}: CentralMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const riverLayerRef = useRef<L.GeoJSON | null>(null);
  const stationGroupRef = useRef<L.LayerGroup | null>(null);
  const damGroupRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const stationMarkers = useRef(new Map<string, { marker: L.Marker; station: CentralStation }>());
  const damMarkers = useRef(new Map<string, { marker: L.Marker; dam: DamStation }>());
  const zoomRef = useRef(7);
  const selectionRef = useRef<CentralSelection>(selection);
  const showAllRef = useRef(showAll);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const riverColors = useMemo(
    () => (rivers ? computeRiverColors(rivers, colorStations) : new Map<string | number, string>()),
    [rivers, colorStations],
  );

  function refreshMarkers() {
    const group = stationGroupRef.current;
    if (!group) return;
    const zoom = zoomRef.current;
    const sel = selectionRef.current;
    stationMarkers.current.forEach(({ marker, station }, id) => {
      const selected = sel?.kind === "station" && sel.id === id;
      const visible = stationVisible(station, zoom, showAllRef.current, selected);
      if (visible) {
        marker.setIcon(stationIcon(station, zoom, selected));
        marker.setZIndexOffset(selected ? 1000 : station.isKey ? 100 : 0);
        if (!group.hasLayer(marker)) marker.addTo(group);
      } else if (group.hasLayer(marker)) {
        group.removeLayer(marker);
      }
    });
    damMarkers.current.forEach(({ marker, dam }, id) => {
      marker.setIcon(damIcon(dam, zoom, sel?.kind === "dam" && sel.id === id));
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      minZoom: 6,
      maxBounds: [
        [12.3, 97.3],
        [20.8, 102.6],
      ],
      maxBoundsViscosity: 0.7,
      preferCanvas: true,
      zoomControl: false,
    });
    map.fitBounds(CENTRAL_BOUNDS, { padding: [16, 16] });
    zoomRef.current = map.getZoom();
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
      className: "wl-tiles-muted",
    }).addTo(map);
    map.createPane("rivers").style.zIndex = "350";
    const userPane = map.createPane("user");
    userPane.style.zIndex = "900";
    userPane.style.pointerEvents = "none";
    stationGroupRef.current = L.layerGroup().addTo(map);
    damGroupRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("zoomend", () => {
      zoomRef.current = map.getZoom();
      refreshMarkers();
    });
    map.on("click", () => onSelectRef.current(null));

    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(containerRef.current);
    const stationMap = stationMarkers.current;
    const damMap = damMarkers.current;
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      stationMap.clear();
      damMap.clear();
    };
     
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rivers) return;
    riverLayerRef.current?.remove();
    riverLayerRef.current = L.geoJSON(rivers, {
      pane: "rivers",
      style: (feature) => {
        const color = feature?.id != null ? riverColors.get(feature.id) : undefined;
        return {
          color: color ?? RIVER_BASE_COLOR,
          weight: RIVER_META[(feature?.properties as RiverFeatureProps | undefined)?.r ?? "chaophraya"]?.weight ?? 2,
          opacity: color ? 0.9 : 0.6,
          lineCap: "round",
          lineJoin: "round",
        };
      },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(escapeHtml(feature.properties.n), { sticky: true });
      },
    }).addTo(map);
  }, [rivers, riverColors]);

  useEffect(() => {
    const group = stationGroupRef.current;
    if (!group) return;
    group.clearLayers();
    stationMarkers.current.clear();
    for (const station of stations) {
      const marker = L.marker([station.lat, station.lng], {
        icon: stationIcon(station, zoomRef.current, false),
        keyboard: false,
      });
      marker.bindTooltip(
        `${escapeHtml(station.name)}${station.code ? ` (${escapeHtml(station.code)})` : ""}<br/>${escapeHtml(station.river ?? station.province)} · ${formatLevel(station.level)} ม.รทก.`,
        { direction: "top", offset: [0, -6] },
      );
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current({ kind: "station", id: station.id });
      });
      stationMarkers.current.set(station.id, { marker, station });
    }
    refreshMarkers();
     
  }, [stations]);

  useEffect(() => {
    const group = damGroupRef.current;
    if (!group) return;
    group.clearLayers();
    damMarkers.current.clear();
    for (const dam of dams) {
      const marker = L.marker([dam.lat, dam.lng], {
        icon: damIcon(dam, zoomRef.current, false),
        keyboard: false,
        zIndexOffset: 2000,
      });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current({ kind: "dam", id: dam.id });
      });
      marker.addTo(group);
      damMarkers.current.set(dam.id, { marker, dam });
    }
    refreshMarkers();
     
  }, [dams]);

  useEffect(() => {
    showAllRef.current = showAll;
    refreshMarkers();
     
  }, [showAll]);

  useEffect(() => {
    selectionRef.current = selection;
    refreshMarkers();
    const map = mapRef.current;
    if (!map || !selection) return;
    const entry =
      selection.kind === "station"
        ? stationMarkers.current.get(selection.id)?.marker
        : damMarkers.current.get(selection.id)?.marker;
    if (!entry) return;
    // Keep the point clear of the detail panel: bottom sheet on phones, right-hand card otherwise.
    const offset: [number, number] =
      window.innerWidth < 640
        ? [0, window.innerHeight * 0.3]
        : [Math.min(200, map.getSize().x / 4), 0];
    const zoom = Math.max(map.getZoom(), selection.kind === "dam" ? 9 : 11);
    safeFlyTo(map, entry.getLatLng(), zoom, offset);
     
  }, [selection]);

  useEffect(() => {
    const group = userLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!userLocation) return;
    const at: L.LatLngTuple = [userLocation.lat, userLocation.lng];
    L.circle(at, {
      pane: "user",
      radius: userLocation.accuracy,
      color: "#2563eb",
      weight: 1,
      fillColor: "#3b82f6",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(group);
    L.marker(at, {
      pane: "user",
      icon: L.divIcon({
        className: "",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `<div class="wl-pulse" style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
      }),
      interactive: false,
      keyboard: false,
    }).addTo(group);
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || focusUserToken === 0) return;
    safeFlyTo(map, [userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUserToken]);

  return <div ref={containerRef} className="h-full w-full" />;
}
