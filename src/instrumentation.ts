export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { seedDefaultNotificationRules } = await import('@/lib/notifications/rules-seed');
  await seedDefaultNotificationRules();

  const { startPeriodicSync } = await import('@/lib/scheduler/interval');
  startPeriodicSync();
}
