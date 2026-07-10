import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Redemption runs with the service role because it needs to read another
// user's invite row and write a friend_requests row on their behalf —
// neither of which the redeeming user's own RLS grants let them do directly.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

    const { code } = await req.json();
    if (!code || typeof code !== 'string') return json({ error: 'Missing code' }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: invite } = await admin
      .from('friend_invites')
      .select('id, inviter_id, accepted_at')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();
    if (!invite) return json({ error: 'Invalid invite code' }, 404);
    if (invite.accepted_at) return json({ error: 'This invite has already been used' }, 400);
    if (invite.inviter_id === user.id) return json({ error: "You can't redeem your own invite" }, 400);

    const { data: existing } = await admin
      .from('friend_requests')
      .select('id, status')
      .or(`and(requester_id.eq.${invite.inviter_id},addressee_id.eq.${user.id}),and(requester_id.eq.${user.id},addressee_id.eq.${invite.inviter_id})`)
      .maybeSingle();

    let friendRequestId: string;
    if (existing) {
      if (existing.status !== 'accepted') {
        await admin.from('friend_requests').update({ status: 'accepted' }).eq('id', existing.id);
      }
      friendRequestId = existing.id;
    } else {
      const { data: created, error: createErr } = await admin
        .from('friend_requests')
        .insert({ requester_id: invite.inviter_id, addressee_id: user.id, status: 'accepted' })
        .select('id')
        .single();
      if (createErr) throw createErr;
      friendRequestId = created.id;
    }

    await admin.from('friend_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', invite.id);

    const { data: inviterProfile } = await admin
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', invite.inviter_id)
      .maybeSingle();

    return json({
      success: true,
      friendRequestId,
      inviterId: invite.inviter_id,
      inviterName: inviterProfile?.display_name || null,
      inviterAvatarUrl: inviterProfile?.avatar_url || null,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
