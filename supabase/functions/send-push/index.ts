import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser, isSameFamily } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// Builds the notification content server-side per `kind`, rather than trusting
// client-supplied title/body text. All of these are friend-to-friend events —
// same-family (partner) senders are filtered out before this is called.
function buildPayload(kind: string, ctx: Record<string, unknown>) {
  const fromName = (ctx.fromName as string) || 'Someone';
  const category = 'friend_activity' as const;
  switch (kind) {
    case 'like':
      return { title: 'New reaction', body: `${fromName} liked your ${ctx.kidNames ? `letter to ${ctx.kidNames}` : 'entry'}`, url: `/?open=${ctx.entryId}`, tag: `like-${ctx.entryId}`, kind, category };
    case 'comment':
      return { title: 'New comment', body: `${fromName}: "${truncate(String(ctx.commentPreview || ''), 120)}"`, url: `/?open=${ctx.entryId}`, tag: `comment-${ctx.entryId}`, kind, category };
    case 'reply':
      return { title: 'New reply', body: `${fromName} replied to your comment`, url: `/?open=${ctx.entryId}`, tag: `reply-${ctx.entryId}`, kind, category };
    case 'friend_request':
      return { title: 'New friend request', body: `${fromName} wants to connect on Patina`, url: '/', tag: 'friend-request', kind, category };
    default:
      return null;
  }
}

// Runs with the service role because it needs to read another user's
// push_subscriptions rows — the caller's own RLS only lets them see their own.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

    const { targetUserId, kind, ...ctx } = await req.json();
    if (!targetUserId || !kind) return json({ error: 'Missing targetUserId or kind' }, 400);
    if (targetUserId === user.id) return json({ ok: true, skipped: 'self' }); // never push yourself

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // A partner's reactions never toast in-app (App.jsx's realtime listener
    // excludes same-family senders) — push shouldn't reach them either, and
    // it shouldn't show up in notification history for the same reason.
    if (await isSameFamily(admin, user.id, targetUserId)) {
      return json({ ok: true, skipped: 'partner' });
    }

    const payload = buildPayload(kind, ctx);
    if (!payload) return json({ error: `Unknown kind: ${kind}` }, 400);

    const result = await sendPushToUser(admin, targetUserId, payload);

    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
