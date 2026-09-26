export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_CRON === "off") return;

  const globalState = globalThis as { __waterwayCron?: boolean };
  if (globalState.__waterwayCron) return;
  globalState.__waterwayCron = true;

  const cron = await import("node-cron");
  const { refreshSnapshots } = await import("./lib/waterway/snapshot");

  void refreshSnapshots();
  cron.schedule("*/5 * * * *", () => void refreshSnapshots(), {
    timezone: "Asia/Bangkok",
  });
  console.log("[waterway-cron] scheduled every 5 minutes");
}
