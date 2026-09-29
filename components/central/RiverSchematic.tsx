"use client";

import { ChevronRight, Video } from "lucide-react";

import { SCHEMATIC } from "@/lib/waterway/basin";
import {
  damColor,
  formatNumber,
  stationColor,
  stationLabel,
} from "@/lib/waterway/central-status";
import { formatLevel } from "@/lib/waterway/status";
import type { CentralStation, DamStation } from "@/lib/waterway/types";
import { cn } from "@/lib/utils";
import type { CentralSelection } from "./CentralMap";

type Props = {
  readonly stationsByCode: Map<string, CentralStation>;
  readonly damsById: Map<string, DamStation>;
  readonly selection: CentralSelection;
  readonly onSelect: (selection: CentralSelection) => void;
};

function DamChip({
  dam,
  selected,
  onClick,
}: {
  readonly dam: DamStation;
  readonly selected: boolean;
  readonly onClick: () => void;
}) {
  const color = damColor(dam);
  const pct = dam.storagePercent;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`เขื่อน${dam.name} · ${pct == null ? "-" : `${formatNumber(pct, 0)}%`} ของความจุ${dam.cctvUrl ? " · มีกล้อง CCTV" : ""}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[11px] hover:bg-muted",
        selected && "ring-2 ring-foreground/70",
      )}
    >
      <span className="relative h-3.5 w-2.5 overflow-hidden rounded-[2px] border border-slate-700 bg-white">
        <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.min(pct ?? 0, 100)}%`, background: color }} />
      </span>
      <span className="font-medium">{dam.name}</span>
      {dam.cctvUrl && <Video className="size-3 text-red-600" aria-label="มีกล้อง CCTV" />}
      <span className="font-semibold tabular-nums" style={{ color }}>
        {pct == null ? "-" : `${Math.round(pct)}%`}
      </span>
    </button>
  );
}

function StationChip({
  station,
  selected,
  onClick,
}: {
  readonly station: CentralStation;
  readonly selected: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${station.name} (${station.province}) · ${stationLabel(station)} · ${formatLevel(station.level)} ม.รทก.`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] hover:bg-muted",
        selected && "bg-muted ring-2 ring-foreground/70",
      )}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: stationColor(station) }} />
      <span className="font-medium">{station.code}</span>
      {station.discharge != null && (
        <span className="tabular-nums text-muted-foreground">{formatNumber(station.discharge, 0)}</span>
      )}
    </button>
  );
}

export function RiverSchematic({ stationsByCode, damsById, selection, onSelect }: Props) {
  return (
    <div className="px-3 py-3">
      <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
        เรียงจากต้นน้ำลงสู่ทะเล · สีจุด = สถานการณ์น้ำ · ตัวเลขถัดจากรหัส = น้ำไหลผ่าน (ลบ.ม./วิ) · ⬛ = เขื่อน (% ความจุ)
      </p>
      <ol>
        {SCHEMATIC.map((reach, i) => (
          <li key={reach.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < SCHEMATIC.length - 1 && (
              <span className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-sky-300" aria-hidden />
            )}
            <span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-6">{reach.label}</div>
              <div className="mb-1.5 text-[11px] text-muted-foreground">{reach.note}</div>
              <div className="space-y-1.5">
                {reach.branches.map((branch) => {
                  const dams = (branch.dams ?? [])
                    .map((id) => damsById.get(id))
                    .filter((d): d is DamStation => d != null);
                  const stations = branch.stations
                    .map((code) => stationsByCode.get(code))
                    .filter((s): s is CentralStation => s != null);
                  return (
                    <div key={`${reach.id}-${branch.label}`} className="rounded-lg border bg-muted/40 p-1.5">
                      <div className="mb-1 text-[11px] font-semibold text-sky-800">{branch.label}</div>
                      {dams.length > 0 && (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {dams.map((d) => (
                            <DamChip
                              key={d.id}
                              dam={d}
                              selected={selection?.kind === "dam" && selection.id === d.id}
                              onClick={() => onSelect({ kind: "dam", id: d.id })}
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center">
                        {stations.length === 0 && (
                          <span className="text-[11px] text-muted-foreground">ไม่มีข้อมูลสถานี</span>
                        )}
                        {stations.map((s, k) => (
                          <span key={s.id} className="inline-flex items-center">
                            {k > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden />}
                            <StationChip
                              station={s}
                              selected={selection?.kind === "station" && selection.id === s.id}
                              onClick={() => onSelect({ kind: "station", id: s.id })}
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
