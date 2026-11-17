import 'dotenv/config';
import { runBosMaintenance } from '../src/bos/jobs';

/**
 * Schedule this with cron (or a platform scheduler) after the BOS migrations
 * are applied. It only runs idempotent maintenance operations and exits
 * non-zero when anything failed so the scheduler can alert.
 */
async function main() {
  const results = await runBosMaintenance();
  console.log(JSON.stringify({ results }, null, 2));
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('BOS maintenance failed:', error);
  process.exitCode = 1;
});
