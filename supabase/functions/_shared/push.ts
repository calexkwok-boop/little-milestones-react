import webpush from 'npm:web-push';

// Configured once per function invocation (isolate) — cheap, and keeps this
// module free of top-level side effects that would run before secrets exist.
function configureVapid() {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Sends `payload` to every device a user has subscribed from. Dead subscriptions
// (410 Gone / 404 Not Found — the browser unsubscribed or the endpoint expired)
// are deleted so they stop being retried on every future notification.
export async function sendPushToUser(admin: any, userId: string, payload: PushPayload) {
  configureVapid();

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return { sent: 0 };

  let sent = 0;
  await Promise.all(subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }));

  return { sent };
}
