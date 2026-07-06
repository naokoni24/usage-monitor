import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { usageDaily, PROVIDERS } from '@/lib/database/schema';
import { formatTokyoDate, tokyoMonthStart, tokyoNextMonthStart } from '@/lib/date/tokyo';

const querySchema = z.object({
  provider: z.enum(PROVIDERS).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    provider: searchParams.get('provider') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query parameters' }, { status: 400 });
  }

  const now = new Date();
  const from = parsed.data.from ?? formatTokyoDate(tokyoMonthStart(now));
  const to = parsed.data.to ?? formatTokyoDate(tokyoNextMonthStart(now));

  const conditions = [gte(usageDaily.usageDate, from), lt(usageDaily.usageDate, to)];
  if (parsed.data.provider) conditions.push(eq(usageDaily.provider, parsed.data.provider));

  const rows = await db
    .select()
    .from(usageDaily)
    .where(and(...conditions))
    .orderBy(usageDaily.usageDate);

  return NextResponse.json({ data: rows });
}
