import { runFullSync } from '../src/lib/scheduler/sync-engine';

runFullSync()
  .then(() => {
    console.log('Sync completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Sync failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
