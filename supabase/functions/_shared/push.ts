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

export type NotificationCategory = 'friend_activity' | 'partner_activity' | 'birthday_reminders' | 'prompt_nudges';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  kind: string;
  category: NotificationCategory;
};

// A burst of activity on the same thing (an entry getting liked 5 times in an
// hour) shares one `tag` (e.g. `like-<entryId>`) — only the first OS-level
// push per tag within this window actually fires. Everything still gets its
// own notification_log row, so nothing is lost from history, just from the
// buzz-your-phone experience.
const PUSH_COOLDOWN_MINUTES = 15;

// Sends `payload` to every device a user has subscribed from. Dead subscriptions
// (410 Gone / 404 Not Found — the browser unsubscribed or the endpoint expired)
// are deleted so they stop being retried on every future notification.
//
// Always writes to notification_log first, regardless of mute state, cooldown,
// or whether any subscription exists — that table is the durable "everything
// ever sent to you" history, independent of whether an OS-level push fired.
export async function sendPushToUser(admin: any, userId: string, payload: PushPayload) {
  let onCooldown = false;
  if (payload.tag) {
    const cutoff = new Date(Date.now() - PUSH_COOLDOWN_MINUTES * 60000).toISOString();
    const { data: recent } = await admin
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('tag', payload.tag)
      .gte('created_at', cutoff)
      .limit(1);
    onCooldown = !!(recent && recent.length > 0);
  }

  await admin.from('notification_log').insert({
    user_id: userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
    tag: payload.tag ?? null,
  });

  if (onCooldown) return { sent: 0, throttled: true };

  const { data: prefRow } = await admin
    .from('notification_preferences')
    .select(payload.category)
    .eq('user_id', userId)
    .maybeSingle();
  if (prefRow && prefRow[payload.category] === false) return { sent: 0, muted: true };

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
