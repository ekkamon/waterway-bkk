import { refreshSnapshots } from "@/lib/waterway/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  return bearer === `Bearer ${secret}`;
}

// Called by an external scheduler (Plesk Scheduled Task / system cron) every 5 minutes.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ message: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ message: "unauthorized" }, { status: 401 });
  }
  await refreshSnapshots();
  return Response.json({ ok: true, at: new Date().toISOString() });
}
