"use client";

import { TrendingDown, TrendingUp, Waves, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useWaterwayTrend } from "@/hooks/useWaterway";
import { formatDateTime } from "@/lib/waterway/status";
import type { TrendStation } from "@/lib/waterway/types";
import { cn } from "@/lib/utils";

type TrendPanelProps = {
  readonly onClose: () => void;
  readonly onSelectStation: (id: string) => void;
};

function StationRow({
  station,
  onSelect,
}: {
  readonly station: TrendStation;
  readonly onSelect: (id: string) => void;
}) {
  const rising = station.direction === "rising";
  return (
    <button
      type="button"
      onClick={() => onSelect(station.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{station.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[station.waterway, station.district ?? station.province].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-right text-xs font-semibold tabular-nums",
          rising ? "text-orange-600" : "text-sky-600",
        )}
      >
        {rising ? "+" : ""}
        {station.delta.toFixed(2)} ม.
        <span className="block font-normal text-muted-foreground">
          {rising ? "+" : ""}
          {station.rateHour.toFixed(2)} ม./ชม.
        </span>
      </span>
    </button>
  );
}

export function TrendPanel({ onClose, onSelectStation }: TrendPanelProps) {
  const { data, isLoading, isError } = useWaterwayTrend(true);

  const overallPoints = (data?.overall ?? []).map((p) => ({
    t: new Date(p.t).getTime(),
    v: p.avg,
  }));
  const latestAvg = overallPoints[overallPoints.length - 1]?.v ?? 0;

  return (
    <div className="pointer-events-auto flex max-h-[70dvh] w-full flex-col overflow-hidden rounded-t-xl border bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:w-96 sm:rounded-xl">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold leading-snug">
            <Waves className="size-4 text-primary" /> แนวโน้มสถานการณ์น้ำ
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            เปรียบเทียบระดับน้ำย้อนหลัง {data?.windowHours ?? 3} ชั่วโมง
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-md p-1.5 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>

      <div className="overflow-y-auto p-4">
        {isLoading && <p className="text-xs text-muted-foreground">กำลังโหลดแนวโน้ม...</p>}
        {isError && <p className="text-xs text-destructive">โหลดข้อมูลแนวโน้มไม่สำเร็จ</p>}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold tabular-nums text-orange-600">{data.counts.rising}</div>
                <div className="text-[10px] text-muted-foreground">น้ำขึ้น</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold tabular-nums text-emerald-600">{data.counts.stable}</div>
                <div className="text-[10px] text-muted-foreground">ทรงตัว</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold tabular-nums text-sky-600">{data.counts.falling}</div>
                <div className="text-[10px] text-muted-foreground">น้ำลง</div>
              </div>
            </div>

            {overallPoints.length >= 2 && (
              <div className="mt-3">
                <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  {latestAvg >= 0 ? (
                    <TrendingUp className="size-3.5 text-orange-600" />
                  ) : (
                    <TrendingDown className="size-3.5 text-sky-600" />
                  )}
                  ระดับน้ำเฉลี่ยเทียบจุดเริ่มต้นช่วงเวลา (ม.)
                </p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overallPoints} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t: number) =>
                          new Intl.DateTimeFormat("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Bangkok",
                          }).format(t)
                        }
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={40} />
                      <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
                      <Tooltip
                        labelFormatter={(t) => formatDateTime(new Date(Number(t)).toISOString())}
                        formatter={(v) => [`${Number(v).toFixed(2)} ม.`, "เปลี่ยนแปลงเฉลี่ย"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#2563eb"
                        fill="#2563eb"
                        fillOpacity={0.15}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.topRising.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-orange-600">
                  <TrendingUp className="size-3.5" /> ระดับน้ำเพิ่มขึ้นเร็วที่สุด
                </p>
                <div className="divide-y">
                  {data.topRising.map((s) => (
                    <StationRow key={s.id} station={s} onSelect={onSelectStation} />
                  ))}
                </div>
              </div>
            )}

            {data.topFalling.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-sky-600">
                  <TrendingDown className="size-3.5" /> ระดับน้ำลดลงเร็วที่สุด
                </p>
                <div className="divide-y">
                  {data.topFalling.map((s) => (
                    <StationRow key={s.id} station={s} onSelect={onSelectStation} />
                  ))}
                </div>
              </div>
            )}

            {data.topRising.length === 0 && data.topFalling.length === 0 && (
              <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                ยังไม่พบสถานีที่มีการเปลี่ยนแปลงระดับน้ำอย่างมีนัยสำคัญในช่วงเวลานี้
              </p>
            )}

            <p className="mt-3 text-[10px] leading-tight text-muted-foreground">
              คำนวณจากข้อมูลที่ระบบสะสมไว้ (สูงสุด 24 ชม.) · อัปเดตล่าสุด {formatDateTime(data.fetchedAt)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
