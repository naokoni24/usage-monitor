import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { providerConnections } from '@/lib/database/schema';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const rows = await db.select().from(providerConnections);
  return NextResponse.json({ data: rows });
}
