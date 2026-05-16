/**
 * CLI: sync the mushaf_pages cache from the Quran Foundation API.
 * Usage: pnpm --filter @workspace/api-server run quran:sync
 */

import { syncAllMushafs } from "../lib/quran/sync";

async function main() {
  console.log("[quran:sync] starting");
  const t0 = Date.now();
  const counts = await syncAllMushafs();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[quran:sync] done in ${elapsed}s:`, counts);
}

main().catch((err) => {
  console.error("[quran:sync] FAILED:", err);
  process.exitCode = 1;
});
