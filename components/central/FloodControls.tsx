'use client';

import { Loader2, TriangleAlert, Waves, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { useFloodSimulation } from '@/hooks/useFloodSimulation';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/waterway/central-status';
import { DEPTH_SCALE, depthHex } from '@/lib/waterway/flood';

type FloodControlsProps = {
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly extraRise: number;
  readonly onExtraRiseChange: (value: number) => void;
  readonly flood: ReturnType<typeof useFloodSimulation>;
};

export function FloodDepthLegend({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex gap-0.5">
        {[...DEPTH_SCALE].reverse().map((s, i) => (
          <span
            key={s.label}
            className="h-2 flex-1 rounded-sm"
            style={{ background: depthHex(DEPTH_SCALE.length - 1 - i) }}
            title={s.label}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
        <span>2</span>
        <span>3+ ม.</span>
      </div>
    </div>
  );
}

export function FloodSettingsModal({
  open,
  onClose,
  enabled,
  onEnabledChange,
  extraRise,
  onExtraRiseChange,
  flood,
}: FloodControlsProps & {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loading = flood.status === 'loading';

  // showModal() puts the dialog in the top layer, above Leaflet's panes, with Esc and focus
  // trapping handled by the browser.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="flood-settings-title"
      className="m-auto w-[min(92vw,24rem)] rounded-lg border bg-card p-0 text-xs text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Waves className="size-4 text-blue-600" />
        <h2 id="flood-settings-title" className="text-sm font-semibold">
          จำลองน้ำท่วม
        </h2>
        {loading && <Loader2 className="size-3.5 animate-spin text-blue-600" />}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="ปิด"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">
              แสดงพื้นที่น้ำท่วมบนแผนที่
            </span>
            <span className="text-muted-foreground">
              ช่วงแม่น้ำที่ระดับน้ำเกินตลิ่ง
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="เปิด/ปิดการจำลองน้ำท่วม"
            onClick={() => onEnabledChange(!enabled)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
              enabled ? 'bg-blue-600' : 'bg-muted-foreground/40',
            )}
          >
            <span
              className={cn(
                'inline-block size-5 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-5.5' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        <fieldset disabled={!enabled} className="space-y-2 disabled:opacity-50">
          <label className="block">
            <span className="flex justify-between">
              <span>ระดับน้ำเพิ่มจากปัจจุบัน (สมมติ)</span>
              <span className="font-semibold tabular-nums">
                +{extraRise.toFixed(1)} ม.
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={extraRise}
              onChange={(e) => onExtraRiseChange(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </label>
        </fieldset>

        {enabled &&
          (flood.reachCount === 0 ? (
            <p className="text-muted-foreground">
              ไม่มีช่วงแม่น้ำที่ระดับน้ำ (รวมระดับที่เพิ่ม) เกินตลิ่ง —
              ลองเพิ่มระดับน้ำสมมติ
            </p>
          ) : loading ? (
            <p className="text-muted-foreground">
              {flood.progress && flood.progress.loaded < flood.progress.total
                ? `กำลังโหลดข้อมูลความสูง DEM ${flood.progress.loaded}/${flood.progress.total} แผ่น...`
                : 'กำลังคำนวณพื้นที่น้ำท่วม...'}
            </p>
          ) : flood.status === 'error' ? (
            <p className="text-destructive">คำนวณไม่สำเร็จ: {flood.error}</p>
          ) : flood.result ? (
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded border bg-card px-1 py-1">
                <div className="font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatNumber(flood.result.areaKm2, 0)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ตร.กม. ท่วม
                </div>
              </div>
              <div className="rounded border bg-card px-1 py-1">
                <div className="font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatNumber(flood.result.meanDepth, 1)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ม. ลึกเฉลี่ย
                </div>
              </div>
              <div
                className="rounded border bg-card px-1 py-1"
                title="95% ของพื้นที่ท่วมลึกไม่เกินค่านี้"
              >
                <div className="font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatNumber(flood.result.p95Depth, 1)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ม. ลึก (P95)
                </div>
              </div>
              <div className="col-span-3 text-left text-[10px] text-muted-foreground">
                จาก {flood.reachCount} ช่วงแม่น้ำ · {flood.stationCount}{' '}
                สถานีที่น้ำเกินตลิ่ง
              </div>
            </div>
          ) : null)}

        <FloodDepthLegend />
        <p className="text-[10px] leading-tight text-muted-foreground">
          แตะบนพื้นที่สีฟ้าเพื่อดูความลึกโดยประมาณ
        </p>
        <div className="flex gap-1.5 rounded-md border border-amber-600/40 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-tight text-amber-800 dark:text-amber-500">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>
            <span className="font-semibold">ข้อจำกัด:</span> เป็นแบบจำลองคร่าว ๆ
            เพื่ออ้างอิงเบื้องต้นเท่านั้น
            ไม่ใช่การพยากรณ์หรือประกาศเตือนภัยอย่างเป็นทางการ
            คำนวณจากระดับน้ำที่สถานีวัดและข้อมูลความสูงพื้นดิน (DEM) เท่านั้น
            ไม่ได้คิดคันกั้นน้ำ ปริมาณน้ำจริง ระยะเวลา หรือการระบายน้ำ
            อาจคลาดเคลื่อนจากสถานการณ์จริงมาก
            โดยเฉพาะพื้นที่ภูเขาหรือจุดที่ข้อมูลแผนที่ยังไม่ครบ
            ห้ามใช้ประกอบการตัดสินใจด้านความปลอดภัยหรืออพยพ —
            โปรดติดตามประกาศจากหน่วยงานราชการเป็นหลัก
          </p>
        </div>
      </div>
    </dialog>
  );
}
