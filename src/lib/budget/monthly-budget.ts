import 'server-only';
import { desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { monthlyBudgets } from '@/lib/database/schema';
import { tokyoYearMonth } from '@/lib/date/tokyo';

const DEFAULT_BUDGET_JPY = 5000;

export async function getMonthlyBudgetJpy(yearMonth: string = tokyoYearMonth()): Promise<number> {
  const [row] = await db
    .select()
    .from(monthlyBudgets)
    .where(eq(monthlyBudgets.yearMonth, yearMonth))
    .limit(1);
  if (row) return row.budgetJpy;

  // No budget set for this month yet - carry forward the most recent prior
  // month's budget rather than silently reverting to the default, so the
  // user isn't surprised by a changed budget just because the month rolled
  // over and they haven't visited the settings page yet.
  const [previous] = await db
    .select()
    .from(monthlyBudgets)
    .where(lt(monthlyBudgets.yearMonth, yearMonth))
    .orderBy(desc(monthlyBudgets.yearMonth))
    .limit(1);

  const fallback = previous?.budgetJpy ?? Number(process.env.MONTHLY_BUDGET_JPY ?? DEFAULT_BUDGET_JPY);
  const budgetJpy = Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_BUDGET_JPY;
  await db.insert(monthlyBudgets).values({
    yearMonth,
    budgetJpy,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return budgetJpy;
}

export async function setMonthlyBudgetJpy(budgetJpy: number, yearMonth: string = tokyoYearMonth()): Promise<void> {
  await db
    .insert(monthlyBudgets)
    .values({ yearMonth, budgetJpy, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: monthlyBudgets.yearMonth,
      set: { budgetJpy, updatedAt: new Date() },
    });
}
