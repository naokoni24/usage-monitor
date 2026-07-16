import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildDashboard } from '@/lib/dashboard/build-dashboard';
import { logger } from '@/lib/logging/logger';

const DEFAULT_OUTPUT = '/Users/nao/.runcat/ai-usage.json';

/**
 * Publish the same totals shown by the dashboard for RunCat Neo's custom
 * metric. This is deliberately called by the sync process, rather than a
 * separate polling job, so the menu-bar value changes as soon as the database
 * transaction has completed.
 */
export async function writeRunCatMetric(): Promise<void> {
  const output = process.env.RUNCAT_METRIC_FILE || DEFAULT_OUTPUT;
  const dashboard = await buildDashboard();
  const todayLabel = dashboard.latestDayDate
    ? dashboard.latestDayDate.slice(5).replace('-', '/')
    : '未反映';
  const budgetPart =
    dashboard.monthlyBudgetJpy > 0
      ? ` / ¥${dashboard.monthlyBudgetJpy.toLocaleString('ja-JP')} (${Math.round(dashboard.budgetUsedPercent)}%)`
      : '';
  const metric = {
    title: 'AI Usage Monitor',
    symbol: 'yensign',
    metricsBarValue:
      dashboard.monthlyBudgetJpy > 0
        ? `${Math.round(dashboard.budgetUsedPercent)}%`
        : `¥${Number(dashboard.latestDayTotalJpy).toLocaleString('ja-JP')}`,
    metrics: [
      {
        title: '今月',
        formattedValue: `¥${Number(dashboard.monthTotalJpy).toLocaleString('ja-JP')}${budgetPart}`,
        ...(dashboard.monthlyBudgetJpy > 0
          ? { normalizedValue: Math.min(dashboard.budgetUsedPercent / 100, 1) }
          : {}),
      },
      {
        title: '最新反映日',
        formattedValue: `¥${Number(dashboard.latestDayTotalJpy).toLocaleString('ja-JP')} (${todayLabel})`,
      },
    ],
    lastUpdatedDate: new Date().toISOString(),
  };

  // A successful upstream check does not necessarily contain new billing
  // data. In that case keep RunCat's prior snapshot (including its timestamp)
  // so it truthfully represents the last reflected DB information.
  try {
    const existing = JSON.parse(
      await readFile(/* turbopackIgnore: true */ output, 'utf8'),
    ) as Record<string, unknown>;
    const previousSnapshot = { ...existing };
    const nextSnapshot: Record<string, unknown> = { ...metric };
    delete previousSnapshot.lastUpdatedDate;
    delete nextSnapshot.lastUpdatedDate;
    if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
      logger.info('RunCat metric unchanged; retained prior snapshot', { output });
      return;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logger.warn('Could not read existing RunCat metric; replacing it', {
        output,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const outputDirectory = dirname(/* turbopackIgnore: true */ output);
  await mkdir(outputDirectory, { recursive: true });
  const temporary = join(outputDirectory, `.runcat-${process.pid}-${Date.now()}.json`);
  await writeFile(temporary, JSON.stringify(metric), 'utf8');
  await rename(temporary, output);
  logger.info('RunCat metric written', { output });
}
