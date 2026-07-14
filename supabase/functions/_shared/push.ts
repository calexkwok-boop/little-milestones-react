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

// Sends `payload` to every device a user has subscribed from. Dead subscriptions
// (410 Gone / 404 Not Found — the browser unsubscribed or the endpoint expired)
// are deleted so they stop being retried on every future notification.
//
// Always writes to notification_log first, regardless of mute state or whether
// any subscription exists — that table is the durable "everything ever sent to
// you" history, independent of whether an OS-level push actually fired.
export async function sendPushToUser(admin: any, userId: string, payload: PushPayload) {
  await admin.from('notification_log').insert({
    user_id: userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
  });

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

// Mirrors the client-side exclusion already in App.jsx's realtime listener
// (`familyUserIdsRef.current.includes(user_id)`) — a family member (partner)
// never toasts in-app for their own reactions, so push shouldn't reach them
// for those either.
export async function isSameFamily(admin: any, userIdA: string, userIdB: string): Promise<boolean> {
  const [{ data: famA }, { data: famB }] = await Promise.all([
    admin.from('family_members').select('family_id').eq('user_id', userIdA),
    admin.from('family_members').select('family_id').eq('user_id', userIdB),
  ]);
  const idsA = new Set((famA || []).map((f: { family_id: string }) => f.family_id));
  return (famB || []).some((f: { family_id: string }) => idsA.has(f.family_id));
}
