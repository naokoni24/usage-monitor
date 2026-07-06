import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { usageDaily, PROVIDERS } from '@/lib/database/schema';
import { tokyoYearMonth } from '@/lib/date/tokyo';

const querySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ yearMonth: searchParams.get('yearMonth') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query parameters' }, { status: 400 });
  }

  const yearMonth = parsed.data.yearMonth ?? tokyoYearMonth();
  const from = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-').map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const totals: Record<string, { costOriginal: string; costJpy: string; currency: string | null }> = {};

  for (const provider of PROVIDERS) {
    const rows = await db
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.provider, provider), gte(usageDaily.usageDate, from), lt(usageDaily.usageDate, nextMonth)));

    if (rows.length === 0) continue;
    const costOriginal = rows.reduce((sum, r) => sum.plus(r.costOriginal), new Decimal(0));
    const costJpy = rows.reduce((sum, r) => sum.plus(r.costJpy), new Decimal(0));
    totals[provider] = {
      costOriginal: costOriginal.toString(),
      costJpy: costJpy.toString(),
      currency: rows[0].currencyOriginal,
    };
  }

  return NextResponse.json({ yearMonth, totals });
}
