"use client";

import { LEVEL_STATUS_META, formatLevel, levelColor } from "@/lib/waterway/status";
import type { LevelStation } from "@/lib/waterway/types";

const W = 320;
const H = 190;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

type Ref = { label: string; value: number; color: string };

export function BankGauge({ station }: { readonly station: LevelStation }) {
  const current = station.level;

  const refs: Ref[] = [];
  if (station.bankLeft != null) refs.push({ label: "ตลิ่งซ้าย", value: station.bankLeft, color: "#b45309" });
  if (station.bankRight != null) refs.push({ label: "ตลิ่งขวา", value: station.bankRight, color: "#b45309" });
  if (station.bankLeft == null && station.bankRight == null && station.bankMin != null) {
    refs.push({ label: "ตลิ่งต่ำสุด", value: station.bankMin, color: "#b45309" });
  }
  if (station.critical != null) refs.push({ label: "วิกฤต", value: station.critical, color: "#dc2626" });
  if (station.warning != null) refs.push({ label: "เตือนภัย", value: station.warning, color: "#f59e0b" });

  const bankL = station.bankLeft ?? station.bankMin;
  const bankR = station.bankRight ?? station.bankMin;
  const hasBanks = bankL != null && bankR != null;

  const known = [current, ...refs.map((r) => r.value), station.bedLevel].filter(
    (v): v is number => v != null,
  );
  if (current == null || known.length < 2) return null;

  const lo = Math.min(station.bedLevel ?? Math.min(...known) - 1, current - 0.5);
  const hi = Math.max(Math.max(...known) + 0.8, current + 0.5);
  const level = current;
  const y = (v: number) =>
    PAD_TOP + (1 - (v - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);

  const cx = 110;
  const bedHalf = 34;
  const slopeRun = 46;
  const topRef = hasBanks ? Math.max(bankL, bankR) : hi;
  const rise = Math.max(y(lo) - y(topRef), 1);
  const halfAt = (v: number) => bedHalf + (slopeRun * (y(lo) - y(v))) / rise;

  const yBed = y(lo);
  const yLevel = y(level);
  const status = station.status;
  const color = levelColor(station);
  const bankRef = hasBanks ? Math.min(bankL, bankR) : null;
  const margin = bankRef != null ? level - bankRef : null;
  const over = margin != null && margin >= 0;

  return (
    <div className="my-3">
      <p className="mb-1 text-xs text-muted-foreground">หน้าตัดลำน้ำ: ระดับน้ำปัจจุบันเทียบตลิ่ง</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border bg-sky-50">
        {hasBanks ? (
          <>
            <polygon
              points={`0,${y(bankL)} ${cx - halfAt(bankL)},${y(bankL)} ${cx - bedHalf},${yBed} 0,${yBed}`}
              fill="#a8865b"
            />
            <polygon
              points={`${W},${y(bankR)} ${cx + halfAt(bankR)},${y(bankR)} ${cx + bedHalf},${yBed} ${W},${yBed}`}
              fill="#a8865b"
            />
          </>
        ) : (
          <rect x={0} y={yBed} width={W} height={H - yBed} fill="#a8865b" />
        )}
        <polygon
          points={`${cx - bedHalf},${yBed} ${cx + bedHalf},${yBed} ${cx + halfAt(level)},${yLevel} ${cx - halfAt(level)},${yLevel}`}
          fill={color}
          fillOpacity={0.55}
          stroke={color}
          strokeWidth={1.5}
        />
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={0} x2={W} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeDasharray="5 4" strokeWidth={1} />
            <text x={W - 4} y={y(r.value) - 3} textAnchor="end" fontSize={9} fill={r.color}>
              {r.label} {formatLevel(r.value)}
            </text>
          </g>
        ))}
        <line x1={0} x2={W} y1={yLevel} y2={yLevel} stroke={color} strokeWidth={1.5} />
        <text x={4} y={yLevel - 3} fontSize={10} fontWeight={700} fill={color}>
          ระดับน้ำ {formatLevel(level)} ม.
        </text>
        {station.bedLevel != null && (
          <text x={4} y={H - 3} fontSize={9} fill="#ffffff">
            ท้องน้ำ {formatLevel(station.bedLevel)}
          </text>
        )}
        {over && (
          <text x={cx} y={Math.max(yLevel - 8, 10)} textAnchor="middle" fontSize={11} fontWeight={700} fill="#dc2626">
            น้ำล้นตลิ่ง
          </text>
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color }}>
          {LEVEL_STATUS_META[status].label.split(" ")[0]}
          {margin != null &&
            ` · ${margin >= 0 ? "สูงกว่า" : "ต่ำกว่า"}ตลิ่ง ${Math.abs(margin).toFixed(2)} ม.`}
        </span>
      </div>
    </div>
  );
}
