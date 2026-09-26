import { readStationHistory } from "@/lib/waterway/snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) {
    return Response.json({ message: "invalid id" }, { status: 400 });
  }
  const series = await readStationHistory(id);
  return Response.json(
    series.map(([t, v]) => ({ time: new Date(t).toISOString(), value: v })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
