'use client';

import {
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Video,
  Waves,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

import { ViewSwitcher } from '@/components/ViewSwitcher';
import { useFloodSimulation } from '@/hooks/useFloodSimulation';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useCentralRivers, useCentralWaterData } from '@/hooks/useWaterway';
import { cn } from '@/lib/utils';
import { CENTRAL_BOUNDS, SCHEMATIC } from '@/lib/waterway/basin';
import {
  DAM_SCALE,
  NO_DATA,
  RIVER_BASE_COLOR,
  SITUATION_META,
  SITUATION_ORDER,
  damColor,
  formatNumber,
  stationColor,
  stationLabel,
} from '@/lib/waterway/central-status';
import { formatDateTime, formatLevel } from '@/lib/waterway/status';
import type {
  CentralStation,
  DamStation,
  Situation,
} from '@/lib/waterway/types';
import { CentralDetailPanel } from './CentralDetailPanel';
import type { CentralSelection } from './CentralMap';
import { FloodDepthLegend, FloodSettingsModal } from './FloodControls';
import { RiverSchematic } from './RiverSchematic';

const CentralMap = dynamic(() => import('./CentralMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      กำลังโหลดแผนที่...
    </div>
  ),
});

type Tab = 'route' | 'dams' | 'stations';
type StatusKey = Situation | 0;
const STATUS_KEYS: StatusKey[] = [...SITUATION_ORDER, 0];
const LIST_LIMIT = 150;

// Every dam in the route order used by the schematic, so the dam tab reads north to south.
const DAM_ORDER = SCHEMATIC.flatMap((r) =>
  r.branches.flatMap((b) => b.dams ?? []),
);

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * rad) / 2) ** 2 +
    Math.cos(aLat * rad) *
      Math.cos(bLat * rad) *
      Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function FlowCard({
  title,
  station,
  onClick,
}: {
  readonly title: string;
  readonly station: CentralStation | undefined;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!station}
      className="rounded-md border p-2 text-left hover:bg-muted disabled:opacity-60"
    >
      <div className="truncate text-[10px] text-muted-foreground">{title}</div>
      <div
        className="text-lg font-bold leading-tight tabular-nums"
        style={{ color: station ? stationColor(station) : undefined }}
      >
        {station?.discharge != null ? formatNumber(station.discharge, 0) : '-'}
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
          ลบ.ม./วิ
        </span>
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        {station ? `${station.code} · ${stationLabel(station)}` : 'ไม่มีข้อมูล'}
      </div>
    </button>
  );
}

export function CentralPage() {
  const central = useCentralWaterData();
  const rivers = useCentralRivers();

  const [selection, setSelection] = useState<CentralSelection>(null);
  const [tab, setTab] = useState<Tab>('route');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(
    new Set(STATUS_KEYS),
  );
  const [showAll, setShowAll] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [floodEnabled, setFloodEnabled] = useState(false);
  const [floodModalOpen, setFloodModalOpen] = useState(false);
  const [floodRise, setFloodRise] = useState(0);
  const geo = useGeolocation(CENTRAL_BOUNDS);

  const allStations = useMemo(
    () => central.data?.stations ?? [],
    [central.data],
  );
  const dams = useMemo(() => central.data?.dams ?? [], [central.data]);
  const flood = useFloodSimulation({
    enabled: floodEnabled,
    rivers: rivers.data,
    stations: allStations,
    extraRise: floodRise,
  });

  const stationsByCode = useMemo(() => {
    const map = new Map<string, CentralStation>();
    for (const s of allStations) {
      if (!s.code) continue;
      const existing = map.get(s.code);
      if (!existing || (s.isKey && !existing.isKey)) map.set(s.code, s);
    }
    return map;
  }, [allStations]);
  const damsById = useMemo(() => new Map(dams.map((d) => [d.id, d])), [dams]);
  const orderedDams = useMemo(
    () =>
      [...dams].sort((a, b) => {
        const ia = DAM_ORDER.indexOf(a.id);
        const ib = DAM_ORDER.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }),
    [dams],
  );

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
    for (const s of allStations) c[s.situation ?? 0]++;
    return c;
  }, [allStations]);

  const mapStations = useMemo(
    () => allStations.filter((s) => statusFilter.has(s.situation ?? 0)),
    [allStations, statusFilter],
  );

  const q = query.trim().toLowerCase();
  const listStations = useMemo(
    () =>
      mapStations
        .filter(
          (s) =>
            !q ||
            `${s.name} ${s.code ?? ''} ${s.river ?? ''} ${s.province} ${s.district ?? ''}`
              .toLowerCase()
              .includes(q),
        )
        .sort(
          (a, b) =>
            (b.situation ?? 0) - (a.situation ?? 0) ||
            (b.bankPercent ?? -1) - (a.bankPercent ?? -1),
        ),
    [mapStations, q],
  );

  const nearest = useMemo(() => {
    if (!geo.location) return null;
    let best: { station: CentralStation; km: number } | null = null;
    for (const s of allStations) {
      if (s.level == null) continue;
      const km = distanceKm(geo.location.lat, geo.location.lng, s.lat, s.lng);
      if (!best || km < best.km) best = { station: s, km };
    }
    return best && best.km <= 30 ? best : null;
  }, [geo.location, allStations]);

  const pick = (next: CentralSelection) => {
    setSelection(next);
    setMobileOpen(false);
  };

  const toggleStatus = (key: StatusKey) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 768px)').matches)
      setDesktopCollapsed((v) => !v);
    else setMobileOpen((v) => !v);
  };

  const selectedStation =
    selection?.kind === 'station'
      ? allStations.find((s) => s.id === selection.id)
      : undefined;
  const selectedDam: DamStation | undefined =
    selection?.kind === 'dam' ? damsById.get(selection.id) : undefined;
  const hasDetail = !!(selectedStation || selectedDam);
  const c2 = stationsByCode.get('C.2');
  const c13 = stationsByCode.get('C.13');

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1050] bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[1100] w-[88vw] max-w-sm shrink-0 flex-col border-r bg-card shadow-lg',
          'md:static md:z-[1000] md:w-96 md:max-w-none',
          mobileOpen ? 'flex' : 'hidden',
          desktopCollapsed ? 'md:hidden' : 'md:flex',
        )}
      >
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">
            ภาพรวมน้ำลุ่มเจ้าพระยา · ภาคกลาง
          </h1>
          <p className="text-xs text-muted-foreground">
            จากเขื่อนภาคเหนือ สู่กรุงเทพฯ นนทบุรี ปทุมธานี และปากแม่น้ำ ·
            ThaiWater (สสน.) + กรมชลประทาน
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <FlowCard
              title="น้ำผ่านนครสวรรค์"
              station={c2}
              onClick={() => c2 && pick({ kind: 'station', id: c2.id })}
            />
            <FlowCard
              title="ระบายท้ายเขื่อนเจ้าพระยา"
              station={c13}
              onClick={() => c13 && pick({ kind: 'station', id: c13.id })}
            />
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1 text-center">
            {STATUS_KEYS.map((key) => {
              const meta = key === 0 ? NO_DATA : SITUATION_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStatus(key)}
                  title={meta.label}
                  className={cn(
                    'rounded-md border px-0.5 py-1 transition-opacity',
                    !statusFilter.has(key) && 'opacity-40',
                  )}
                >
                  <div
                    className="text-base font-bold tabular-nums"
                    style={{ color: meta.color }}
                  >
                    {counts[key]}
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground">
                    {meta.label}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              แสดงทุกสถานีบนแผนที่
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground"
              onClick={() => void central.refetch()}
            >
              <RefreshCw
                className={cn('size-3', central.isFetching && 'animate-spin')}
              />
              {central.data ? formatDateTime(central.data.fetchedAt) : 'รีเฟรช'}
            </button>
          </div>
          {!showAll && (
            <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
              ภาพรวมแสดงเขื่อนและสถานีหลัก ·
              ซูมเข้าเพื่อดูสถานีน้ำมากและสถานีย่อยเพิ่ม
            </p>
          )}
          {central.isError && (
            <p className="mt-1 text-xs text-destructive">โหลดข้อมูลไม่สำเร็จ</p>
          )}
        </div>

        <div className="flex border-b text-sm">
          {(
            [
              ['route', 'เส้นทางน้ำ'],
              ['dams', `เขื่อน (${dams.length})`],
              ['stations', `สถานี (${mapStations.length})`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 px-2 py-2',
                tab === id
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {central.isLoading && (
            <p className="p-4 text-sm text-muted-foreground">
              กำลังโหลดข้อมูล...
            </p>
          )}
          {tab === 'route' && central.data && (
            <RiverSchematic
              stationsByCode={stationsByCode}
              damsById={damsById}
              selection={selection}
              onSelect={pick}
            />
          )}
          {tab === 'dams' && (
            <ul className="divide-y">
              {orderedDams.map((d) => {
                const color = damColor(d);
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pick({ kind: 'dam', id: d.id })}
                      className={cn(
                        'w-full px-3 py-2 text-left hover:bg-muted',
                        selection?.id === d.id && 'bg-muted',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1 truncate text-sm">
                          เขื่อน{d.name}
                          {d.cctvUrl && (
                            <Video
                              className="size-3 shrink-0 text-red-600"
                              aria-label="มีกล้อง CCTV"
                            />
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {d.province}
                          </span>
                        </span>
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{ color }}
                        >
                          {d.storagePercent == null
                            ? '-'
                            : `${formatNumber(d.storagePercent, 0)}%`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(d.storagePercent ?? 0, 100)}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        เข้า {formatNumber(d.inflow)} · ระบาย{' '}
                        {formatNumber(d.released)} ล้าน ลบ.ม./วัน
                      </div>
                    </button>
                  </li>
                );
              })}
              {central.data && dams.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">
                  ยังไม่มีข้อมูลเขื่อน
                </li>
              )}
            </ul>
          )}
          {tab === 'stations' && (
            <>
              <div className="sticky top-0 flex items-center gap-2 border-b bg-card px-3 py-2">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาสถานี / รหัส / แม่น้ำ / จังหวัด"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ul className="divide-y">
                {listStations.slice(0, LIST_LIMIT).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pick({ kind: 'station', id: s.id })}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted',
                        selection?.id === s.id && 'bg-muted',
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: stationColor(s) }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {s.name}{' '}
                          {s.code && (
                            <span className="text-xs text-muted-foreground">
                              ({s.code})
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[s.river, s.province].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="text-right text-xs tabular-nums">
                        <span className="block font-semibold">
                          {formatLevel(s.level)}
                        </span>
                        {s.bankPercent != null && (
                          <span className="block text-muted-foreground">
                            {formatNumber(s.bankPercent, 0)}%
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
                {listStations.length > LIST_LIMIT && (
                  <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                    แสดง {LIST_LIMIT} รายการแรก — ใช้ช่องค้นหาเพื่อกรอง
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
        <p className="border-t px-3 py-2 text-[10px] leading-tight text-muted-foreground">
          ระดับน้ำ: ThaiWater (สสน.) · เขื่อน: กรมชลประทาน (อัปเดตวันละครั้ง) ·
          เส้นแม่น้ำ: OpenStreetMap
        </p>
      </aside>

      <main className="relative min-w-0 flex-1">
        <CentralMap
          rivers={rivers.data}
          stations={mapStations}
          colorStations={allStations}
          dams={dams}
          showAll={showAll}
          selection={selection}
          onSelect={setSelection}
          userLocation={geo.location}
          focusUserToken={geo.focusToken}
          flood={floodEnabled ? flood.result : null}
        />
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute left-3 top-3 z-[1000] rounded-md border bg-card p-2 shadow hover:bg-muted"
          aria-label="สลับแถบด้านข้าง"
        >
          {mobileOpen || !desktopCollapsed ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </button>
        <ViewSwitcher
          current="central"
          className="absolute left-14 top-3 z-[1000]"
        />
        <button
          type="button"
          onClick={geo.locate}
          className={cn(
            'absolute left-3 top-14 z-[1000] rounded-md border bg-card p-2 shadow hover:bg-muted',
            geo.tracking && geo.location && 'border-blue-600 text-blue-600',
          )}
          aria-label="ตำแหน่งของฉัน"
          title="ตำแหน่งของฉัน"
        >
          <LocateFixed
            className={cn(
              'size-4',
              geo.tracking && !geo.location && 'animate-pulse',
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => setFloodModalOpen(true)}
          className={cn(
            'absolute left-3 top-25 z-[1000] rounded-md border bg-card p-2 shadow hover:bg-muted',
            floodEnabled && 'border-blue-600 text-blue-600',
          )}
          aria-label="จำลองน้ำท่วม"
          aria-haspopup="dialog"
          title="จำลองน้ำท่วม"
        >
          <Waves
            className={cn(
              'size-4',
              floodEnabled && flood.status === 'loading' && 'animate-pulse',
            )}
          />
        </button>
        <FloodSettingsModal
          open={floodModalOpen}
          onClose={() => setFloodModalOpen(false)}
          enabled={floodEnabled}
          onEnabledChange={setFloodEnabled}
          extraRise={floodRise}
          onExtraRiseChange={setFloodRise}
          flood={flood}
        />

        {(geo.error || nearest) && (
          <div
            className={cn(
              'absolute bottom-6 left-3 right-16 z-[1000] max-w-xs rounded-lg border bg-card/95 p-3 text-xs shadow',
              hasDetail && 'hidden sm:block',
            )}
          >
            {geo.error ? (
              <p className="text-destructive">{geo.error}</p>
            ) : (
              nearest && (
                <button
                  type="button"
                  className="text-left"
                  onClick={() =>
                    setSelection({ kind: 'station', id: nearest.station.id })
                  }
                >
                  <span className="block text-muted-foreground">
                    สถานีใกล้คุณที่สุด · {nearest.km.toFixed(1)} กม.
                  </span>
                  <span className="block font-medium">
                    {nearest.station.name}{' '}
                    {nearest.station.code && `(${nearest.station.code})`}
                  </span>
                  <span
                    className="block font-semibold"
                    style={{ color: stationColor(nearest.station) }}
                  >
                    {formatLevel(nearest.station.level)} ม.รทก. ·{' '}
                    {stationLabel(nearest.station)}
                  </span>
                </button>
              )
            )}
          </div>
        )}

        {hasDetail && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-end sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3">
            <CentralDetailPanel
              station={selectedStation}
              dam={selectedDam}
              onClose={() => setSelection(null)}
            />
          </div>
        )}

        <details
          open
          className={cn(
            'absolute right-3 top-3 z-[1000] hidden w-52 rounded-lg border bg-card/95 text-[11px] shadow sm:block',
            hasDetail && 'sm:hidden',
          )}
        >
          <summary className="cursor-pointer select-none px-2 py-1.5 font-medium">
            คำอธิบายสัญลักษณ์
          </summary>
          <div className="border-t px-2 pb-2 pt-1.5">
            <div className="mb-1 font-medium">สถานการณ์น้ำ (สถานีวัดระดับ)</div>
            <div className="grid grid-cols-2 gap-x-2">
              {SITUATION_ORDER.map((k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: SITUATION_META[k].color }}
                  />
                  {SITUATION_META[k].label}
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: NO_DATA.color }}
                />
                {NO_DATA.label}
              </div>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              จุดใหญ่ขอบเข้ม = สถานีหลักบนแม่น้ำสายหลัก
            </div>
            <div className="mt-1.5 border-t pt-1.5 font-medium">
              เขื่อน (% ความจุ)
            </div>
            <div className="flex gap-0.5">
              {DAM_SCALE.map((s) => (
                <span
                  key={s.label}
                  className="h-2 flex-1 rounded-sm"
                  style={{ background: s.color }}
                  title={s.label}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>&gt;100%</span>
              <span>80</span>
              <span>50</span>
              <span>30</span>
              <span>น้อย</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5">
              <span
                className="h-1 w-4 rounded"
                style={{ background: RIVER_BASE_COLOR }}
              />
              สีแม่น้ำ = สถานีที่ใกล้ที่สุดบนสายนั้น
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative inline-block size-2.5 shrink-0 rounded-full border border-white bg-red-600" />
              จุดแดง = เขื่อนมีกล้อง CCTV ให้ดู
            </div>
            {floodEnabled && (
              <>
                <div className="mt-1.5 border-t pt-1.5 font-medium">
                  ความลึกน้ำท่วม (จำลองจาก DEM)
                </div>
                <FloodDepthLegend />
              </>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}
