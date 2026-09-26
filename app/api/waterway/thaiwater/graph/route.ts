import { fetchThaiwaterGraph } from "@/lib/waterway/thaiwater";

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("stationId"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ message: "invalid stationId" }, { status: 400 });
  }
  try {
    const points = await fetchThaiwaterGraph(id);
    return Response.json(points, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "ThaiWater upstream error" },
      { status: 502 },
    );
  }
}
