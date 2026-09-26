"use client";

import {
  Layers,
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import {
  useBmaData,
  useThaiwaterData,
  useWaterwayGeometry,
} from "@/hooks/useWaterway";
import {
  HEADROOM_GRADIENT,
  LEVEL_STATUS_META,
  PUMP_STATE_META,
  WATERWAY_LINE_COLOR,
  formatDateTime,
  formatLevel,
  levelColor,
} from "@/lib/waterway/status";
import type { LevelStatus } from "@/lib/waterway/types";
import { cn } from "@/lib/utils";
import { StationDetailPanel } from "./StationDetailPanel";
import type {
  BaseLayerId,
  MapLayers,
  MapSelection,
  UserLocation,
} from "./WaterwayMap";

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const WaterwayMap = dynamic(() => import("./WaterwayMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      กำลังโหลดแผนที่...
    </div>
  ),
});

type ListTab = "levels" | "pumps" | "flows";
const LIST_LIMIT = 120;
const STATUS_ORDER: LevelStatus[] = ["critical", "warning", "normal", "low", "offline"];

function Toggle({
  checked,
  onChange,
  label,
  swatch,
  count,
}: {
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly label: string;
  readonly swatch: React.ReactNode;
  readonly count?: number;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {swatch}
      <span className="flex-1">{label}</span>
      {count != null && (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      )}
    </label>
  );
}

export function WaterwayPage() {
  const bma = useBmaData();
  const thaiwater = useThaiwaterData();
  const bkkGeometry = useWaterwayGeometry();

  const [layers, setLayers] = useState<MapLayers>({
    bkkWaterways: true,
    levels: true,
    pumps: false,
    flows: false,
  });
  const [showThaiwater, setShowThaiwater] = useState(true);
  const [showBma, setShowBma] = useState(true);
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("streets");
  const [statusFilter, setStatusFilter] = useState<Set<LevelStatus>>(new Set(STATUS_ORDER));
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ListTab>("levels");
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setDesktopCollapsed((v) => !v);
    } else {
      setMobileOpen((v) => !v);
    }
  };

  const pick = (next: MapSelection) => {
    setSelection(next);
    setMobileOpen(false);
  };
  const [selection, setSelection] = useState<MapSelection>(null);
  const [tracking, setTracking] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [focusUserToken, setFocusUserToken] = useState(0);

  useEffect(() => {
    if (!tracking) return;
    let first = true;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationError(null);
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        if (first) {
          first = false;
          setFocusUserToken((t) => t + 1);
        }
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์"
            : "ระบุตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง",
        );
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  const toggleLocate = () => {
    if (tracking && userLocation) {
      setFocusUserToken((t) => t + 1);
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocationError("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setLocationError(null);
    setTracking(true);
  };

  const q = query.trim().toLowerCase();

  const allLevels = useMemo(
    () => [
      ...(showBma ? (bma.data?.levels ?? []) : []),
      ...(showThaiwater ? (thaiwater.data?.levels ?? []) : []),
    ],
    [bma.data, thaiwater.data, showBma, showThaiwater],
  );

  const levels = useMemo(
    () =>
      allLevels.filter(
        (s) =>
          statusFilter.has(s.status) &&
          (!q ||
            `${s.name} ${s.nameEn ?? ""} ${s.waterway ?? ""} ${s.district ?? ""} ${s.province} ${s.code ?? ""}`
              .toLowerCase()
              .includes(q)),
      ),
    [allLevels, statusFilter, q],
  );
  const pumps = useMemo(
    () =>
      (showBma ? (bma.data?.pumps ?? []) : []).filter(
        (p) =>
          !q ||
          `${p.name} ${p.nameEn ?? ""} ${p.district} ${p.code}`.toLowerCase().includes(q),
      ),
    [bma.data, showBma, q],
  );
  const flows = useMemo(
    () =>
      (showBma ? (bma.data?.flows ?? []) : []).filter(
        (f) =>
          !q ||
          `${f.name} ${f.nameEn ?? ""} ${f.waterway ?? ""} ${f.district} ${f.code}`
            .toLowerCase()
            .includes(q),
      ),
    [bma.data, showBma, q],
  );

  const statusFlows = useMemo(
    () => (showBma ? (bma.data?.flows ?? []) : []),
    [bma.data, showBma],
  );

  const counts = useMemo(() => {
    const c: Record<LevelStatus, number> = { critical: 0, warning: 0, normal: 0, low: 0, offline: 0 };
    for (const s of allLevels) c[s.status]++;
    return c;
  }, [allLevels]);

  const sortedLevels = useMemo(
    () =>
      [...levels].sort(
        (a, b) =>
          (a.headroom ?? Infinity) - (b.headroom ?? Infinity) ||
          (b.level ?? -999) - (a.level ?? -999),
      ),
    [levels],
  );

  const nearest = useMemo(() => {
    if (!userLocation) return null;
    let best: { station: (typeof allLevels)[number]; km: number } | null = null;
    for (const s of allLevels) {
      if (s.level == null) continue;
      const km = distanceKm(userLocation.lat, userLocation.lng, s.lat, s.lng);
      if (!best || km < best.km) best = { station: s, km };
    }
    return best;
  }, [userLocation, allLevels]);

  const pumpsRunning = (bma.data?.pumps ?? []).filter((p) => p.state === "running").length;
  const selectedLevel =
    selection?.kind === "level" ? allLevels.find((s) => s.id === selection.id) : undefined;
  const selectedPump =
    selection?.kind === "pump" ? bma.data?.pumps.find((s) => s.id === selection.id) : undefined;
  const selectedFlow =
    selection?.kind === "flow" ? bma.data?.flows.find((s) => s.id === selection.id) : undefined;

  const toggleLayer = (key: keyof MapLayers) => (value: boolean) =>
    setLayers((prev) => ({ ...prev, [key]: value }));

  const toggleStatus = (status: LevelStatus) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const refreshing = bma.isFetching || thaiwater.isFetching;
  const lastUpdate = bma.data?.fetchedAt ?? thaiwater.data?.fetchedAt ?? null;
  const errors = [bma.isError && "กทม. (สำนักการระบายน้ำ)", thaiwater.isError && "ThaiWater (สสน.)"].filter(Boolean);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1050] bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      {(
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-[1100] w-[88vw] max-w-sm shrink-0 flex-col border-r bg-card shadow-lg",
            "md:static md:z-[1000] md:w-96 md:max-w-none",
            mobileOpen ? "flex" : "hidden",
            desktopCollapsed ? "md:hidden" : "md:flex",
          )}
        >
          <div className="border-b p-4">
            <h1 className="text-lg font-semibold">เส้นทางน้ำกรุงเทพมหานคร</h1>
            <p className="text-xs text-muted-foreground">
              ระดับน้ำ คลอง และสถานีสูบน้ำ · กทม. (สนน.) + ThaiWater (สสน.)
            </p>
            <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
              {(["critical", "warning", "normal", "offline"] as LevelStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "rounded-md border px-1 py-1.5 transition-opacity",
                    !statusFilter.has(s) && "opacity-40",
                  )}
                  title={LEVEL_STATUS_META[s].label}
                >
                  <div className="text-lg font-bold tabular-nums" style={{ color: LEVEL_STATUS_META[s].color }}>
                    {counts[s]}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {LEVEL_STATUS_META[s].label.split(" ")[0]}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>สถานีสูบน้ำกำลังทำงาน {pumpsRunning}/{bma.data?.pumps.length ?? 0}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => {
                  void bma.refetch();
                  void thaiwater.refetch();
                }}
              >
                <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                {lastUpdate ? formatDateTime(lastUpdate) : "รีเฟรช"}
              </button>
            </div>
            {errors.length > 0 && (
              <p className="mt-1 text-xs text-destructive">โหลดข้อมูลไม่สำเร็จ: {errors.join(", ")}</p>
            )}
          </div>

          <div className="border-b p-3">
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Layers className="size-3.5" /> ชั้นข้อมูล
            </div>
            <Toggle checked={layers.bkkWaterways} onChange={toggleLayer("bkkWaterways")} label="คลองทั้งหมดใน กทม."
              swatch={<span className="h-1 w-4 rounded" style={{ background: "#9ca3af" }} />} count={bkkGeometry.data?.features.length} />
            <Toggle checked={layers.levels} onChange={toggleLayer("levels")} label="สถานีวัดระดับน้ำ"
              swatch={<span className="size-3 rounded-full" style={{ background: "#16a34a" }} />} count={allLevels.length} />
            <Toggle checked={layers.pumps} onChange={toggleLayer("pumps")} label="สถานีสูบน้ำ กทม."
              swatch={<span className="size-3 rounded-sm" style={{ background: PUMP_STATE_META.running.color }} />} count={bma.data?.pumps.length} />
            <Toggle checked={layers.flows} onChange={toggleLayer("flows")} label="จุดวัดการไหล / ปตร."
              swatch={<span className="size-2.5 rotate-45" style={{ background: "#0d9488" }} />} count={bma.data?.flows.length} />
            <div className="mt-1 flex gap-3 border-t pt-2">
              <Toggle checked={showBma} onChange={setShowBma} label="กทม." swatch={null} />
              <Toggle checked={showThaiwater} onChange={setShowThaiwater} label="ThaiWater" swatch={null} />
            </div>
            <div className="mt-1 flex gap-1.5 text-xs">
              {(["streets", "satellite"] as BaseLayerId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBaseLayer(id)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1",
                    baseLayer === id ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
                  )}
                >
                  {id === "streets" ? "แผนที่ถนน" : "ภาพดาวเทียม"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาคลอง / สถานี / เขต / จังหวัด"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex border-b text-sm">
            {(
              [
                ["levels", `ระดับน้ำ (${levels.length})`],
                ["pumps", `สูบน้ำ (${pumps.length})`],
                ["flows", `การไหล (${flows.length})`],
              ] as [ListTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex-1 px-2 py-2",
                  tab === id ? "border-b-2 border-primary font-medium" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {tab === "levels" &&
              sortedLevels.slice(0, LIST_LIMIT).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick({ kind: "level", id: s.id })}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                      selection?.id === s.id && "bg-muted")}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: levelColor(s) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.district ?? s.province} · {s.source === "bma" ? "กทม." : "สสน."}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatLevel(s.level)}</span>
                  </button>
                </li>
              ))}
            {tab === "pumps" &&
              pumps.slice(0, LIST_LIMIT).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick({ kind: "pump", id: p.id })}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                      selection?.id === p.id && "bg-muted")}
                  >
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PUMP_STATE_META[p.state].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        เขต{p.district} · {PUMP_STATE_META[p.state].label}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.units.filter((u) => u.running && !u.tripped).length}/{p.pumpCount}
                    </span>
                  </button>
                </li>
              ))}
            {tab === "flows" &&
              flows.slice(0, LIST_LIMIT).map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => pick({ kind: "flow", id: f.id })}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted",
                      selection?.id === f.id && "bg-muted")}
                  >
                    <span className="size-2.5 shrink-0 rotate-45" style={{ background: f.online ? "#0d9488" : "#6b7280" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">เขต{f.district}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {f.discharge != null ? f.discharge.toFixed(1) : "-"}
                    </span>
                  </button>
                </li>
              ))}
            {((tab === "levels" && levels.length > LIST_LIMIT) ||
              (tab === "pumps" && pumps.length > LIST_LIMIT) ||
              (tab === "flows" && flows.length > LIST_LIMIT)) && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                แสดง {LIST_LIMIT} รายการแรก — ใช้ช่องค้นหาเพื่อกรอง
              </li>
            )}
          </ul>
          <p className="border-t px-3 py-2 text-[10px] leading-tight text-muted-foreground">
            ข้อมูลระดับน้ำ/สถานีสูบน้ำ: สำนักการระบายน้ำ กทม. และ ThaiWater (สสน.) · เส้นทางน้ำ: OpenStreetMap
            · ระดับน้ำ ม.รทก. ตัวเลขบนแผนที่ = ระดับน้ำ (ม.) แสดงเมื่อซูมเข้า
          </p>
        </aside>
      )}

      <main className="relative min-w-0 flex-1">
        <WaterwayMap
          bkkGeometry={bkkGeometry.data}
          levels={levels}
          pumps={layers.pumps ? pumps : []}
          flows={flows}
          statusLevels={allLevels}
          statusFlows={statusFlows}
          layers={layers}
          baseLayer={baseLayer}
          selection={selection}
          onSelect={setSelection}
          userLocation={userLocation}
          focusUserToken={focusUserToken}
        />
        <button
          type="button"
          onClick={toggleLocate}
          className={cn(
            "absolute left-3 top-14 z-[1000] rounded-md border bg-card p-2 shadow hover:bg-muted",
            tracking && userLocation && "border-blue-600 text-blue-600",
          )}
          aria-label="ตำแหน่งของฉัน"
          title="ตำแหน่งของฉัน"
        >
          <LocateFixed className={cn("size-4", tracking && !userLocation && "animate-pulse")} />
        </button>
        {(locationError || nearest) && (
          <div
            className={cn(
              "absolute bottom-6 left-3 right-16 z-[1000] max-w-xs rounded-lg border bg-card/95 p-3 text-xs shadow",
              (selectedLevel || selectedPump || selectedFlow) && "hidden sm:block",
            )}
          >
            {locationError ? (
              <p className="text-destructive">{locationError}</p>
            ) : (
              nearest && (
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setSelection({ kind: "level", id: nearest.station.id })}
                >
                  <span className="block text-muted-foreground">
                    สถานีวัดระดับน้ำใกล้คุณที่สุด · {nearest.km.toFixed(1)} กม.
                  </span>
                  <span className="block font-medium">{nearest.station.name}</span>
                  <span
                    className="block font-semibold"
                    style={{ color: levelColor(nearest.station) }}
                  >
                    {formatLevel(nearest.station.level)} ม. · {nearest.station.statusText}
                  </span>
                </button>
              )
            )}
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute left-3 top-3 z-[1000] rounded-md border bg-card p-2 shadow hover:bg-muted"
          aria-label="สลับแถบด้านข้าง"
        >
          {(mobileOpen || !desktopCollapsed) ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        {(selectedLevel || selectedPump || selectedFlow) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-end sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3">
            <StationDetailPanel
              level={selectedLevel}
              pump={selectedPump}
              flow={selectedFlow}
              onClose={() => setSelection(null)}
            />
          </div>
        )}
        <div
          className={cn(
            "pointer-events-none absolute bottom-6 right-16 z-[1000] hidden rounded-lg border bg-card/95 p-2 text-[11px] shadow sm:block",
            (selectedLevel || selectedPump || selectedFlow) && "sm:hidden",
          )}
        >
          <div className="mb-1 font-medium">ระดับน้ำเทียบตลิ่ง</div>
          <div className="h-2 w-44 rounded" style={{ background: HEADROOM_GRADIENT }} />
          <div className="mt-0.5 flex w-44 justify-between text-[10px] text-muted-foreground">
            <span>ล้นตลิ่ง</span>
            <span>0</span>
            <span>2 ม.</span>
            <span>4+ ม.</span>
          </div>
          <div className="text-[10px] text-muted-foreground">แดง = ล้นตลิ่ง · ไล่สีตามระยะห่างจากตลิ่ง</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: LEVEL_STATUS_META.offline.color }} />
            ขัดข้อง / ไม่มีข้อมูล
          </div>
          <div className="mt-1 flex items-center gap-1.5 border-t pt-1">
            <span className="h-1 w-3 rounded" style={{ background: WATERWAY_LINE_COLOR }} />
            เส้นสีเทา = ไม่มีสถานีวัด
          </div>
          <div className="text-[10px] text-muted-foreground">สีเส้น = สถานีที่ใกล้ตลิ่งที่สุดบนคลองนั้น</div>
        </div>
      </main>
    </div>
  );
}
