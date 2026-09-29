import { readSnapshot, refreshSnapshots } from "@/lib/waterway/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  let data = await readSnapshot("central");
  if (!data) {
    await refreshSnapshots();
    data = await readSnapshot("central");
  }
  if (!data) {
    return Response.json({ message: "ยังไม่มีข้อมูลภาคกลาง (cron ยังไม่ดึงสำเร็จ)" }, { status: 503 });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
