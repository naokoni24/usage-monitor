import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { buildDashboard } from '@/lib/dashboard/build-dashboard';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const dashboard = await buildDashboard();
  return NextResponse.json(dashboard);
}
