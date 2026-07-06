import 'server-only';
import { CodexAppServerSession, CodexAppServerError } from './app-server-client';
import type { LimitProviderOutcome, NormalizedLimit } from '@/lib/providers/types';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { generateMockCodexLimits } from '@/lib/mock/limit-providers';

interface GetAccountResponse {
  account: { type: string; email?: string | null; planType?: string } | null;
  requiresOpenaiAuth: boolean;
}

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

interface GetAccountRateLimitsResponse {
  rateLimits: {
    primary: RateLimitWindow | null;
    secondary: RateLimitWindow | null;
  };
}

const FIVE_HOUR_MAX_MINS = 360; // windows at/under 6h are treated as the five-hour window

export function classifyWindow(window: RateLimitWindow): NormalizedLimit {
  const limitType = window.windowDurationMins !== null && window.windowDurationMins > FIVE_HOUR_MAX_MINS
    ? 'weekly'
    : 'five_hour';
  return {
    limitType,
    usedPercent: window.usedPercent,
    remainingPercent: Math.max(0, 100 - window.usedPercent),
    resetAt: window.resetsAt ? new Date(window.resetsAt * 1000) : null,
  };
}

export async function fetchCodexLimits(): Promise<LimitProviderOutcome> {
  if (isMockMode()) {
    return generateMockCodexLimits(await getMockScenario());
  }

  if (process.env.CODEX_ENABLED !== 'true') {
    return { ok: false, errorMessage: 'Codex連携は設定で無効化されています', status: 'not_configured' };
  }

  const session = new CodexAppServerSession();
  try {
    const account = await session.request<GetAccountResponse>('account/read', { refreshToken: false });
    if (account.requiresOpenaiAuth && !account.account) {
      return { ok: false, errorMessage: '未ログイン: Codexにログインしてください', status: 'not_configured' };
    }

    const rateLimits = await session.request<GetAccountRateLimitsResponse>('account/rateLimits/read');
    const limits: NormalizedLimit[] = [];
    if (rateLimits.rateLimits.primary) limits.push(classifyWindow(rateLimits.rateLimits.primary));
    if (rateLimits.rateLimits.secondary) limits.push(classifyWindow(rateLimits.rateLimits.secondary));

    if (limits.length === 0) {
      return { ok: false, errorMessage: 'Codexの利用枠情報が返却されませんでした', status: 'error' };
    }

    const planInfo =
      account.account?.type === 'chatgpt' && account.account.planType ? `ChatGPT ${account.account.planType}` : null;

    return { ok: true, source: 'api', confidence: 'confirmed', limits, planInfo };
  } catch (err) {
    if (err instanceof CodexAppServerError) {
      if (err.kind === 'spawn_failed') {
        return { ok: false, errorMessage: 'App Server未起動: codex app-serverを起動できませんでした', status: 'error' };
      }
      if (err.kind === 'method_not_supported') {
        return { ok: false, errorMessage: 'メソッド未対応: このCodexバージョンはrateLimits/readに対応していません', status: 'error' };
      }
      if (err.kind === 'timeout') {
        return { ok: false, errorMessage: '取得失敗: Codex app-serverの応答がタイムアウトしました', status: 'error' };
      }
      return { ok: false, errorMessage: `取得失敗: ${err.message}`, status: 'error' };
    }
    return { ok: false, errorMessage: `取得失敗: ${err instanceof Error ? err.message : String(err)}`, status: 'error' };
  } finally {
    session.close();
  }
}
