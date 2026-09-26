"use client";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  return (
    <html lang="th">
      <body style={{ fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
        <h1>เกิดข้อผิดพลาด</h1>
        <p>{error.message}</p>
        <button type="button" onClick={reset}>ลองใหม่</button>
      </body>
    </html>
  );
}
