"use client";

import { ExternalLink, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useStationGraph, useStationHistory } from "@/hooks/useWaterway";
import { BankGauge } from "./BankGauge";
import {
  PUMP_STATE_META,
  formatDateTime,
  formatLevel,
  levelColor,
} from "@/lib/waterway/status";
import type {
  FlowStation,
  LevelStation,
  PumpStation,
} from "@/lib/waterway/types";

type DetailPanelProps = {
  readonly level?: LevelStation;
  readonly pump?: PumpStation;
  readonly flow?: FlowStation;
  readonly onClose: () => void;
};

function Row({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Pill({ color, children }: { readonly color: string; readonly children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

function Shell({
  title,
  subtitle,
  badge,
  onClose,
  children,
  href,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly badge: React.ReactNode;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly href: string | null;
}) {
  return (
    <div className="pointer-events-auto flex max-h-[62dvh] w-full flex-col overflow-hidden rounded-t-xl border bg-card shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:w-96 sm:rounded-xl">
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          <div className="mt-2">{badge}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-md p-1.5 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">
        {children}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            ดูข้อมูลต้นทาง <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function LevelGraph({ station }: { readonly station: LevelStation }) {
  const hii = useStationGraph(station.graphStationId);
  const hiiUsable = (hii.data?.filter((p) => p.value != null).length ?? 0) >= 2;
  const useHistory =
    station.graphStationId == null || (!hii.isLoading && !hiiUsable);
  const history = useStationHistory(station.id, useHistory);

  const data = useHistory ? history.data : hii.data;
  const loading = useHistory ? history.isLoading : hii.isLoading;
  const points = (data ?? [])
    .filter((p) => p.value != null)
    .map((p) => ({ t: new Date(p.time).getTime(), v: p.value as number }));

  if (loading) return <p className="my-3 text-xs text-muted-foreground">กำลังโหลดกราฟ...</p>;
  if (points.length < 2) {
    return (
      <p className="my-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
        ต้นทางไม่มีกราฟย้อนหลังของสถานีนี้ — ระบบกำลังสะสมระดับน้ำทุก 5 นาที (ตอนนี้ {points.length} จุด) กราฟจะแสดงเมื่อมีตั้งแต่ 2 จุด
      </p>
    );
  }
  return (
    <div className="my-3">
      <p className="mb-1 text-xs text-muted-foreground">
        {useHistory ? "ระดับน้ำที่ระบบสะสมไว้ (สูงสุด 24 ชม.)" : "ระดับน้ำย้อนหลัง 3 วัน"} (ม.)
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) =>
                new Intl.DateTimeFormat(
                  "th-TH",
                  useHistory
                    ? { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }
                    : { day: "numeric", month: "short", timeZone: "Asia/Bangkok" },
                ).format(t)
              }
              tick={{ fontSize: 10 }}
            />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={44} />
            <Tooltip
              labelFormatter={(t) => formatDateTime(new Date(Number(t)).toISOString())}
              formatter={(v) => [`${Number(v).toFixed(2)} ม.`, "ระดับน้ำ"]}
            />
            {station.bankMin != null && (
              <ReferenceLine y={station.bankMin} stroke="#dc2626" strokeDasharray="4 4" />
            )}
            <Line type="monotone" dataKey="v" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {station.bankMin != null && (
        <p className="text-[11px] text-muted-foreground">เส้นประสีแดง = ระดับตลิ่งต่ำสุด {formatLevel(station.bankMin)} ม.</p>
      )}
    </div>
  );
}

export function StationDetailPanel({ level, pump, flow, onClose }: DetailPanelProps) {
  if (level) {
    const color = levelColor(level);
    const overBank =
      level.level != null && level.bankMin != null
        ? level.level - level.bankMin
        : null;
    return (
      <Shell
        title={level.name}
        subtitle={[level.waterway, level.district, level.province].filter(Boolean).join(" · ")}
        badge={<Pill color={color}>{level.statusText}</Pill>}
        onClose={onClose}
        href={level.url}
      >
        <div className="mb-2 flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums" style={{ color }}>
            {formatLevel(level.level)}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">
            ม.รทก.{level.levelOut != null ? ` (ด้านใน) · ด้านนอก ${formatLevel(level.levelOut)}` : ""}
          </span>
        </div>
        <Row label="หน่วยงาน" value={level.agency} />
        {level.agencyStatus && (
          <Row label="สถานะตามหน่วยงาน" value={level.agencyStatus} />
        )}
        {level.code && <Row label="รหัสสถานี" value={level.code} />}
        {level.previous != null && <Row label="ระดับครั้งก่อน" value={`${formatLevel(level.previous)} ม.`} />}
        {level.warning != null && <Row label="ระดับเตือนภัย" value={`${formatLevel(level.warning)} ม.`} />}
        {level.critical != null && <Row label="ระดับวิกฤต" value={`${formatLevel(level.critical)} ม.`} />}
        {level.warningOut != null && <Row label="เตือนภัย (ด้านนอก)" value={`${formatLevel(level.warningOut)} ม.`} />}
        {level.criticalOut != null && <Row label="วิกฤต (ด้านนอก)" value={`${formatLevel(level.criticalOut)} ม.`} />}
        {level.bankMin != null && <Row label="ระดับตลิ่งต่ำสุด" value={`${formatLevel(level.bankMin)} ม.`} />}
        {level.bankLeft != null && <Row label="ตลิ่งซ้าย" value={`${formatLevel(level.bankLeft)} ม.`} />}
        {level.bankRight != null && <Row label="ตลิ่งขวา" value={`${formatLevel(level.bankRight)} ม.`} />}
        {overBank != null && (
          <Row
            label="เทียบตลิ่งต่ำสุด"
            value={`${overBank >= 0 ? "สูงกว่า" : "ต่ำกว่า"} ${Math.abs(overBank).toFixed(2)} ม.`}
          />
        )}
        {level.maxToday != null && <Row label="สูงสุดวันนี้" value={`${formatLevel(level.maxToday)} ม.`} />}
        {level.maxYesterday != null && <Row label="สูงสุดเมื่อวาน" value={`${formatLevel(level.maxYesterday)} ม.`} />}
        <Row label="อัปเดตล่าสุด" value={formatDateTime(level.updatedAt)} />
        <BankGauge key={level.id} station={level} />
        <LevelGraph station={level} />
      </Shell>
    );
  }

  if (pump) {
    const meta = PUMP_STATE_META[pump.state];
    const runningCount = pump.units.filter((u) => u.running && !u.tripped).length;
    return (
      <Shell
        title={pump.name}
        subtitle={`${pump.code} · เขต${pump.district}${pump.side ? ` · ${pump.side}` : ""}`}
        badge={<Pill color={meta.color}>{meta.label}</Pill>}
        onClose={onClose}
        href={pump.url}
      >
        <Row label="เครื่องสูบที่ทำงาน" value={`${runningCount} / ${pump.pumpCount} เครื่อง`} />
        {pump.capacityCms != null && <Row label="กำลังสูบรวม" value={`${pump.capacityCms} ลบ.ม./วินาที`} />}
        {pump.waterLevel != null && <Row label="ระดับน้ำหน้าสถานี" value={`${formatLevel(pump.waterLevel)} ม.`} />}
        <div className="my-3 flex flex-wrap gap-2">
          {pump.units.map((u) => (
            <span
              key={u.no}
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{
                background: u.tripped ? "#fee2e2" : u.running ? "#dbeafe" : "transparent",
                borderColor: u.tripped ? "#dc2626" : u.running ? "#2563eb" : undefined,
              }}
            >
              เครื่อง {u.no}: {u.tripped ? "ขัดข้อง (Trip)" : u.running ? "กำลังสูบ" : "หยุด"}
            </span>
          ))}
        </div>
        <Row label="สัญญาณ RTU" value={pump.rtuOnline ? "ออนไลน์" : "ออฟไลน์"} />
        {pump.doorOpen && <Row label="ประตูตู้ควบคุม" value="เปิดอยู่" />}
        {(pump.lampAlarm || pump.paAlarm) && (
          <Row label="สัญญาณเตือน" value={[pump.lampAlarm && "ไฟเตือน", pump.paAlarm && "เสียงเตือน"].filter(Boolean).join(", ")} />
        )}
        <Row label="อัปเดตล่าสุด" value={formatDateTime(pump.updatedAt)} />
        <p className="mt-2 text-[11px] text-muted-foreground">ที่มา: สำนักการระบายน้ำ กรุงเทพมหานคร</p>
      </Shell>
    );
  }

  if (flow) {
    return (
      <Shell
        title={flow.name}
        subtitle={[flow.waterway, `เขต${flow.district}`].filter(Boolean).join(" · ")}
        badge={<Pill color={flow.online ? "#0d9488" : "#6b7280"}>{flow.online ? flow.statusText : "ขัดข้อง"}</Pill>}
        onClose={onClose}
        href={flow.url}
      >
        <div className="mb-2 flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums text-teal-600">
            {flow.discharge != null ? flow.discharge.toFixed(2) : "-"}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">ลบ.ม./วินาที</span>
        </div>
        <Row label="ระดับน้ำ" value={`${formatLevel(flow.level)} ม.`} />
        <Row label="ความเร็วเฉลี่ย" value={flow.velocity != null ? `${flow.velocity} ม./วินาที` : "-"} />
        <Row label="พื้นที่หน้าตัด" value={flow.area != null ? `${flow.area} ตร.ม.` : "-"} />
        {flow.warning != null && <Row label="ระดับเตือนภัย" value={`${formatLevel(flow.warning)} ม.`} />}
        {flow.critical != null && <Row label="ระดับวิกฤต" value={`${formatLevel(flow.critical)} ม.`} />}
        <Row label="อัปเดตล่าสุด" value={formatDateTime(flow.updatedAt)} />
        <p className="mt-2 text-[11px] text-muted-foreground">ที่มา: สำนักการระบายน้ำ กรุงเทพมหานคร</p>
      </Shell>
    );
  }

  return null;
}
