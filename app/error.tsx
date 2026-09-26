"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">เกิดข้อผิดพลาดในการแสดงแผนที่</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{error.message}</p>
      <button type="button" onClick={reset} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        ลองใหม่
      </button>
    </div>
  );
}
