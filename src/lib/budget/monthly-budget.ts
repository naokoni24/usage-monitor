import 'server-only';
import { eq } from 'drizzle-orm';
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

  const fallback = Number(process.env.MONTHLY_BUDGET_JPY ?? DEFAULT_BUDGET_JPY);
  await db.insert(monthlyBudgets).values({
    yearMonth,
    budgetJpy: Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_BUDGET_JPY,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_BUDGET_JPY;
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
