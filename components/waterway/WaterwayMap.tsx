"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";

import { computeWayColors } from "@/lib/waterway/colors";
import {
  PUMP_STATE_META,
  WATERWAY_LINE_COLOR,
  formatLevel,
  levelColor,
} from "@/lib/waterway/status";
import type {
  FlowStation,
  LevelStation,
  PumpStation,
  WaterwayCollection,
} from "@/lib/waterway/types";

export type MapSelection = {
  kind: "level" | "pump" | "flow";
  id: string;
} | null;

export type MapLayers = {
  bkkWaterways: boolean;
  levels: boolean;
  pumps: boolean;
  flows: boolean;
};

export type UserLocation = { lat: number; lng: number; accuracy: number };

export type BaseLayerId = "streets" | "satellite";

type WaterwayMapProps = {
  readonly bkkGeometry: WaterwayCollection | undefined;
  readonly levels: LevelStation[];
  readonly pumps: PumpStation[];
  readonly flows: FlowStation[];
  readonly statusLevels: LevelStation[];
  readonly statusFlows: FlowStation[];
  readonly layers: MapLayers;
  readonly baseLayer: BaseLayerId;
  readonly selection: MapSelection;
  readonly onSelect: (selection: MapSelection) => void;
  readonly userLocation: UserLocation | null;
  readonly focusUserToken: number;
};

const BANGKOK_CENTER: L.LatLngTuple = [13.78, 100.53];
const INITIAL_ZOOM = 11;
const LABEL_ZOOM = 12;
const SATELLITE_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL;

const TILE_LAYERS: Record<BaseLayerId, { url: string; attribution: string }> = {
  streets: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url:
      SATELLITE_TILE_URL ??
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri",
  },
};

const LINE_WEIGHT: Record<string, number> = {
  river: 3.5,
  canal: 2.2,
  stream: 1.6,
  drain: 1.1,
  ditch: 0.9,
};

function levelIcon(
  station: LevelStation,
  detailed: boolean,
  selected: boolean,
): L.DivIcon {
  const color = levelColor(station);
  const ring = selected ? "box-shadow:0 0 0 3px rgba(17,24,39,.85);" : "";
  if (!detailed) {
    const size = selected ? 16 : 10;
    return L.divIcon({
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);${ring}"></div>`,
    });
  }
  const label = station.level == null ? "N/A" : formatLevel(station.level);
  const out =
    station.levelOut != null ? ` / ${formatLevel(station.levelOut)}` : "";
  const shape = station.isGate ? "border-radius:4px;" : "border-radius:999px;";
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;padding:1px 6px;${shape}background:${color};color:#fff;font-size:11px;font-weight:600;line-height:16px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);${ring}">${label}${out}</div>`,
  });
}

function pumpIcon(
  pump: PumpStation,
  detailed: boolean,
  selected: boolean,
): L.DivIcon {
  const color = PUMP_STATE_META[pump.state].color;
  const pulse = pump.state === "running" ? "wl-pulse" : "";
  const ring = selected ? "box-shadow:0 0 0 3px rgba(17,24,39,.85);" : "";
  if (!detailed) {
    return L.divIcon({
      className: "",
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      html: `<div class="${pulse}" style="width:12px;height:12px;border-radius:3px;background:${color};border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);${ring}"></div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="${pulse}" style="width:22px;height:22px;border-radius:6px;background:${color};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.5);${ring}">P</div>`,
  });
}

function flowIcon(flow: FlowStation, selected: boolean): L.DivIcon {
  const color = flow.online ? "#0d9488" : "#6b7280";
  const ring = selected ? "box-shadow:0 0 0 3px rgba(17,24,39,.85);" : "";
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="width:14px;height:14px;margin:2px;transform:rotate(45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);${ring}"></div>`,
  });
}

function safeFlyTo(
  map: L.Map,
  point: L.LatLngExpression,
  zoom: number,
  offsetY = 0,
) {
  const target = offsetY
    ? map.unproject(map.project(point, zoom).add([0, offsetY]), zoom)
    : point;
  const size = map.getSize();
  if (!size.x || !size.y) map.invalidateSize({ animate: false });
  try {
    if (map.getSize().x && map.getSize().y) {
      map.flyTo(target, zoom, { duration: 0.7 });
      return;
    }
  } catch {
    // fall through to a plain setView
  }
  map.setView(target, zoom, { animate: false });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function WaterwayMap({
  bkkGeometry,
  levels,
  pumps,
  flows,
  statusLevels,
  statusFlows,
  layers,
  baseLayer,
  selection,
  onSelect,
  userLocation,
  focusUserToken,
}: WaterwayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const bkkLayerRef = useRef<L.GeoJSON | null>(null);
  const levelGroupRef = useRef<L.LayerGroup | null>(null);
  const pumpGroupRef = useRef<L.LayerGroup | null>(null);
  const flowGroupRef = useRef<L.LayerGroup | null>(null);
  const levelMarkers = useRef(new Map<string, { marker: L.Marker; station: LevelStation }>());
  const pumpMarkers = useRef(new Map<string, { marker: L.Marker; station: PumpStation }>());
  const flowMarkers = useRef(new Map<string, { marker: L.Marker; station: FlowStation }>());
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const zoomRef = useRef(INITIAL_ZOOM);
  const selectionRef = useRef<MapSelection>(selection);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const wayColors = useMemo(() => {
    if (!bkkGeometry) return new Map();
    return computeWayColors([bkkGeometry], statusLevels, statusFlows);
  }, [bkkGeometry, statusLevels, statusFlows]);

  // Map bootstrap
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: BANGKOK_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 9,
      maxBounds: [
        [13.3, 100.1],
        [14.2, 101.0],
      ],
      maxBoundsViscosity: 0.7,
      preferCanvas: true,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
    map.createPane("waterways").style.zIndex = "350";
    mapRef.current = map;
    levelGroupRef.current = L.layerGroup().addTo(map);
    pumpGroupRef.current = L.layerGroup().addTo(map);
    flowGroupRef.current = L.layerGroup().addTo(map);
    const userPane = map.createPane("user");
    userPane.style.zIndex = "900";
    userPane.style.pointerEvents = "none";
    userLayerRef.current = L.layerGroup().addTo(map);

    map.on("zoomend", () => {
      const nextZoom = map.getZoom();
      const wasDetailed = zoomRef.current >= LABEL_ZOOM;
      zoomRef.current = nextZoom;
      if (wasDetailed !== nextZoom >= LABEL_ZOOM) {
        refreshLevelIcons();
      }
    });
    map.on("click", () => onSelectRef.current(null));

    const resize = () => map.invalidateSize({ animate: false });
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      levelMarkers.current.clear();
      pumpMarkers.current.clear();
      flowMarkers.current.clear();
    };
     
  }, []);

  function refreshLevelIcons() {
    const detailed = zoomRef.current >= LABEL_ZOOM;
    const sel = selectionRef.current;
    levelMarkers.current.forEach(({ marker, station }, id) => {
      marker.setIcon(
        levelIcon(station, detailed, sel?.kind === "level" && sel.id === id),
      );
    });
    pumpMarkers.current.forEach(({ marker, station }, id) => {
      marker.setIcon(
        pumpIcon(station, detailed, sel?.kind === "pump" && sel.id === id),
      );
    });
  }

  // Base tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const cfg = TILE_LAYERS[baseLayer];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19,
      className: baseLayer === "streets" ? "wl-tiles-muted" : "",
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [baseLayer]);

  // Waterway geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const build = (
      data: WaterwayCollection,
      previous: L.GeoJSON | null,
      visible: boolean,
    ) => {
      previous?.remove();
      const layer = L.geoJSON(data, {
        pane: "waterways",
        style: (feature) => {
          const props = feature?.properties;
          const wayColor = wayColors.get(feature?.id as number);
          return {
            color: wayColor ?? WATERWAY_LINE_COLOR,
            weight: LINE_WEIGHT[props?.t ?? "canal"] ?? 1.5,
            opacity: wayColor ? 0.95 : 0.7,
            interactive: !!props?.n,
          };
        },
        onEachFeature: (feature, l) => {
          const name = feature.properties.n;
          if (name) l.bindTooltip(escapeHtml(name), { sticky: true });
        },
      });
      if (visible) layer.addTo(map);
      return layer;
    };

    if (bkkGeometry) {
      bkkLayerRef.current = build(bkkGeometry, bkkLayerRef.current, layers.bkkWaterways);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bkkGeometry, wayColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const toggle = (layer: L.GeoJSON | null, on: boolean) => {
      if (!layer) return;
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) layer.remove();
    };
    toggle(bkkLayerRef.current, layers.bkkWaterways);
  }, [layers.bkkWaterways, bkkGeometry, wayColors]);

  // Level markers
  useEffect(() => {
    const group = levelGroupRef.current;
    if (!group) return;
    group.clearLayers();
    levelMarkers.current.clear();
    if (!layers.levels) return;
    const detailed = zoomRef.current >= LABEL_ZOOM;
    for (const station of levels) {
      if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) continue;
      const marker = L.marker([station.lat, station.lng], {
        icon: levelIcon(station, detailed, false),
        riseOnHover: true,
        keyboard: false,
      });
      marker.bindTooltip(
        `${escapeHtml(station.name)}<br/>${formatLevel(station.level)} ม.`,
        { direction: "top", offset: [0, -6] },
      );
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current({ kind: "level", id: station.id });
      });
      marker.addTo(group);
      levelMarkers.current.set(station.id, { marker, station });
    }
    refreshLevelIcons();
     
  }, [levels, layers.levels]);

  // Pump markers
  useEffect(() => {
    const group = pumpGroupRef.current;
    if (!group) return;
    group.clearLayers();
    pumpMarkers.current.clear();
    if (!layers.pumps) return;
    for (const station of pumps) {
      if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) continue;
      const marker = L.marker([station.lat, station.lng], {
        icon: pumpIcon(
          station,
          zoomRef.current >= LABEL_ZOOM,
          selectionRef.current?.id === station.id,
        ),
        keyboard: false,
        zIndexOffset: 200,
      });
      marker.bindTooltip(
        `${escapeHtml(station.name)}<br/>${PUMP_STATE_META[station.state].label}`,
        { direction: "top", offset: [0, -8] },
      );
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current({ kind: "pump", id: station.id });
      });
      marker.addTo(group);
      pumpMarkers.current.set(station.id, { marker, station });
    }
  }, [pumps, layers.pumps]);

  // Flow / discharge markers
  useEffect(() => {
    const group = flowGroupRef.current;
    if (!group) return;
    group.clearLayers();
    flowMarkers.current.clear();
    if (!layers.flows) return;
    for (const station of flows) {
      if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) continue;
      const marker = L.marker([station.lat, station.lng], {
        icon: flowIcon(station, selectionRef.current?.id === station.id),
        keyboard: false,
        zIndexOffset: 100,
      });
      marker.bindTooltip(
        `${escapeHtml(station.name)}<br/>${station.discharge ?? "-"} ลบ.ม./วิ`,
        { direction: "top", offset: [0, -8] },
      );
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRef.current({ kind: "flow", id: station.id });
      });
      marker.addTo(group);
      flowMarkers.current.set(station.id, { marker, station });
    }
  }, [flows, layers.flows]);

  // Viewer location
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
    safeFlyTo(map, [userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 13));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUserToken]);

  // Selection highlight + fly to
  useEffect(() => {
    selectionRef.current = selection;
    refreshLevelIcons();
    pumpMarkers.current.forEach(({ marker, station }, id) => {
      marker.setIcon(
        pumpIcon(
          station,
          zoomRef.current >= LABEL_ZOOM,
          selection?.kind === "pump" && selection.id === id,
        ),
      );
    });
    flowMarkers.current.forEach(({ marker, station }, id) => {
      marker.setIcon(flowIcon(station, selection?.kind === "flow" && selection.id === id));
    });
    const map = mapRef.current;
    if (!map || !selection) return;
    const entry =
      selection.kind === "level"
        ? levelMarkers.current.get(selection.id)
        : selection.kind === "pump"
          ? pumpMarkers.current.get(selection.id)
          : flowMarkers.current.get(selection.id);
    if (entry) {
      const latlng = entry.marker.getLatLng();
      const sheetOffset = window.innerWidth < 640 ? window.innerHeight * 0.31 : 0;
      safeFlyTo(map, latlng, Math.max(map.getZoom(), 14), sheetOffset);
      entry.marker.setZIndexOffset(1000);
    }
     
  }, [selection]);

  return <div ref={containerRef} className="h-full w-full" />;
}
