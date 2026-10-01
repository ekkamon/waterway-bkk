'use client';

import { CameraOff, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useStationGraph } from '@/hooks/useWaterway';
import { RIVER_META } from '@/lib/waterway/basin';
import {
  damColor,
  damLabel,
  formatNumber,
  stationColor,
  stationLabel,
} from '@/lib/waterway/central-status';
import { formatDateTime, formatLevel } from '@/lib/waterway/status';
import type { CentralStation, DamStation } from '@/lib/waterway/types';

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  color,
  badge,
  onClose,
  href,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly color: string;
  readonly badge: string;
  readonly onClose: () => void;
  readonly href: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex max-h-[62dvh] w-full flex-col overflow-hidden rounded-t-xl border bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:w-96 sm:rounded-xl">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          <span
            className="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ background: color }}
          >
            {badge}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">
        {children}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          ดูข้อมูลต้นทาง <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function StationGraph({ station }: { readonly station: CentralStation }) {
  const graph = useStationGraph(station.graphStationId);
  const points = (graph.data ?? [])
    .filter((p) => p.value != null)
    .map((p) => ({ t: new Date(p.time).getTime(), v: p.value as number }));
  if (graph.isLoading)
    return (
      <p className="my-3 text-xs text-muted-foreground">กำลังโหลดกราฟ...</p>
    );
  if (points.length < 2) return null;
  return (
    <div className="my-3">
      <p className="mb-1 text-xs text-muted-foreground">
        ระดับน้ำย้อนหลัง 3 วัน (ม.รทก.)
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) =>
                new Intl.DateTimeFormat('th-TH', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'Asia/Bangkok',
                }).format(t)
              }
              tick={{ fontSize: 10 }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              width={44}
            />
            <Tooltip
              labelFormatter={(t) =>
                formatDateTime(new Date(Number(t)).toISOString())
              }
              formatter={(v) => [`${Number(v).toFixed(2)} ม.`, 'ระดับน้ำ']}
            />
            {station.bankMin != null && (
              <ReferenceLine
                y={station.bankMin}
                stroke="#dc2626"
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="monotone"
              dataKey="v"
              stroke="#2563eb"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {station.bankMin != null && (
        <p className="text-[11px] text-muted-foreground">
          เส้นประสีแดง = ระดับตลิ่ง {formatLevel(station.bankMin)} ม.รทก.
        </p>
      )}
    </div>
  );
}

const CCTV_REFRESH_MS = 30_000;

function DamCctv({ url }: { readonly url: string }) {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), CCTV_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (failed) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        <CameraOff className="size-4 shrink-0" /> โหลดภาพจากกล้อง CCTV
        ไม่สำเร็จในขณะนี้
      </div>
    );
  }

  return (
    <div className="my-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-red-600" />
        </span>
        ภาพจากกล้อง CCTV หน้าเขื่อน · อัปเดตทุก 30 วินาที
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- external live snapshot, not an optimizable static asset */}
      <img
        key={url}
        src={`${url}${url.includes('?') ? '&' : '?'}t=${tick}`}
        alt="ภาพจากกล้อง CCTV หน้าเขื่อน"
        className="w-full rounded-md border object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        ที่มา: การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย (กฟผ.)
      </p>
    </div>
  );
}

export function CentralDetailPanel({
  station,
  dam,
  onClose,
}: {
  readonly station?: CentralStation;
  readonly dam?: DamStation;
  readonly onClose: () => void;
}) {
  if (station) {
    const color = stationColor(station);
    const toBank =
      station.level != null && station.bankMin != null
        ? station.bankMin - station.level
        : null;
    const change =
      station.level != null && station.previous != null
        ? station.level - station.previous
        : null;
    return (
      <Shell
        title={`${station.name}${station.code ? ` (${station.code})` : ''}`}
        subtitle={[
          station.river,
          station.district && `อ.${station.district}`,
          `จ.${station.province}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        color={color}
        badge={stationLabel(station)}
        onClose={onClose}
        href="https://www.thaiwater.net/water/wl"
      >
        <div className="mb-2 flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ color }}>
            {formatLevel(station.level)}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">ม.รทก.</span>
        </div>
        {toBank != null && (
          <Row
            label="เทียบตลิ่ง"
            value={
              toBank >= 0
                ? `ต่ำกว่าตลิ่ง ${toBank.toFixed(2)} ม.`
                : `ล้นตลิ่ง ${Math.abs(toBank).toFixed(2)} ม.`
            }
          />
        )}
        {station.bankPercent != null && (
          <Row
            label="ความจุลำน้ำ"
            value={`${formatNumber(station.bankPercent, 0)}%`}
          />
        )}
        {station.discharge != null && (
          <Row
            label="ปริมาณน้ำไหลผ่าน"
            value={`${formatNumber(station.discharge, 0)} ลบ.ม./วิ`}
          />
        )}
        {change != null && (
          <Row
            label="เทียบครั้งก่อน"
            value={
              change === 0
                ? 'ทรงตัว'
                : `${change > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(change).toFixed(2)} ม.`
            }
          />
        )}
        {station.bankMin != null && (
          <Row
            label="ระดับตลิ่ง"
            value={`${formatLevel(station.bankMin)} ม.รทก.`}
          />
        )}
        {station.groundLevel != null && (
          <Row
            label="ระดับท้องน้ำ"
            value={`${formatLevel(station.groundLevel)} ม.รทก.`}
          />
        )}
        <Row label="ลุ่มน้ำ" value={station.basin ?? '-'} />
        {station.riverKey && (
          <Row label="เส้นทางหลัก" value={RIVER_META[station.riverKey].label} />
        )}
        <Row label="หน่วยงาน" value={station.agency} />
        <Row label="อัปเดตล่าสุด" value={formatDateTime(station.updatedAt)} />
        <StationGraph station={station} />
      </Shell>
    );
  }

  if (dam) {
    const color = damColor(dam);
    const pct = dam.storagePercent;
    return (
      <Shell
        title={`เขื่อน${dam.name}`}
        subtitle={[dam.basin, `จ.${dam.province}`].filter(Boolean).join(' · ')}
        color={color}
        badge={damLabel(dam)}
        onClose={onClose}
        href="https://www.thaiwater.net/water/dam"
      >
        <div className="mb-1 flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ color }}>
            {pct == null ? '-' : `${formatNumber(pct, 0)}%`}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">
            ของความจุที่ระดับเก็บกักปกติ
          </span>
        </div>
        <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: color }}
          />
        </div>
        <Row
          label="ปริมาณน้ำในอ่าง"
          value={`${formatNumber(dam.storage, 0)} ล้าน ลบ.ม.`}
        />
        <Row
          label="น้ำใช้การได้"
          value={`${formatNumber(dam.usable, 0)} ล้าน ลบ.ม.${dam.usablePercent != null ? ` (${formatNumber(dam.usablePercent, 0)}%)` : ''}`}
        />
        <Row
          label="น้ำไหลเข้า (วันนี้)"
          value={`${formatNumber(dam.inflow)} ล้าน ลบ.ม.`}
        />
        <Row
          label="น้ำระบาย (วันนี้)"
          value={`${formatNumber(dam.released)} ล้าน ลบ.ม.`}
        />
        {(dam.spilled ?? 0) > 0 && (
          <Row
            label="ระบายทางน้ำล้น"
            value={`${formatNumber(dam.spilled)} ล้าน ลบ.ม.`}
          />
        )}
        <Row
          label="ความจุที่ระดับเก็บกักปกติ"
          value={`${formatNumber(dam.normalStorage, 0)} ล้าน ลบ.ม.`}
        />
        <Row
          label="ความจุสูงสุด"
          value={`${formatNumber(dam.maxStorage, 0)} ล้าน ลบ.ม.`}
        />
        <Row label="ข้อมูลวันที่" value={dam.date ?? '-'} />
        {dam.cctvUrl && <DamCctv key={dam.id} url={dam.cctvUrl} />}
        <p className="mt-2 text-[11px] text-muted-foreground">
          ที่มา: กรมชลประทาน ผ่าน ThaiWater (สสน.) · อัปเดตวันละครั้ง
        </p>
      </Shell>
    );
  }

  return null;
}
