import 'server-only';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { pushSubscriptions } from '@/lib/database/schema';
import { logger } from '@/lib/logging/logger';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSendSummary {
  sent: number;
  failed: number;
  removed: number;
}

/** Sends `payload` to every stored subscription, pruning ones the push service reports as gone. */
export async function sendPushToAllSubscriptions(payload: PushPayload): Promise<PushSendSummary> {
  const summary: PushSendSummary = { sent: 0, failed: 0, removed: 0 };
  if (!ensureConfigured()) {
    logger.warn('web push not configured, skipping send');
    return summary;
  }

  const subscriptions = await db.select().from(pushSubscriptions);
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        summary.sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err) {
        summary.failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Endpoint is gone - remove it rather than retrying forever.
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          summary.removed++;
        } else {
          await db
            .update(pushSubscriptions)
            .set({ lastErrorAt: new Date(), updatedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id));
          logger.warn('push send failed', { subscriptionId: sub.id, statusCode: statusCode ?? null });
        }
      }
    }),
  );

  return summary;
}
