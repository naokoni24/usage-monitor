import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { claudeCodeManualInputSchema, saveClaudeCodeManualInput } from '@/lib/claude-code/manual';

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const body = await request.json().catch(() => null);
  const parsed = claudeCodeManualInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  await saveClaudeCodeManualInput(parsed.data);
  return NextResponse.json({ ok: true });
}
