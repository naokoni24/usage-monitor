import { sendPushToAllSubscriptions } from '../src/lib/notifications/web-push';

sendPushToAllSubscriptions({
  title: 'AI Usage Monitor',
  body: 'CLIからのテスト通知です。',
})
  .then((summary) => {
    console.log(`Sent: ${summary.sent}, Failed: ${summary.failed}, Removed: ${summary.removed}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Push test failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
