import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUser } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Same "days until next birthday" math as daysUntilBirthday() in src/App.jsx, ported
// here since this runs with no browser/client open to compute it for us.
function daysUntilBirthday(birthdate: string, today: Date): number {
  const [, bm, bd] = birthdate.split('-').map(Number);
  const y = today.getFullYear();
  let next = new Date(y, bm - 1, bd);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < todayMidnight) next = new Date(y + 1, bm - 1, bd);
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
}

function turningAge(birthdate: string, today: Date): number {
  const [by] = birthdate.split('-').map(Number);
  const daysUntil = daysUntilBirthday(birthdate, today);
  const bdayYear = new Date(today.getTime() + daysUntil * 86400000).getFullYear();
  return bdayYear - by;
}

// A notification is sent at most once per `id`. Birthday ids encode the year, so
// they naturally re-fire next year. Prompt-nudge ids don't encode a date, so they're
// re-checked against `cooldownDays` instead — a rolling "don't nag more than once a week."
async function alreadySent(admin: any, id: string, cooldownDays?: number): Promise<boolean> {
  const { data } = await admin.from('sent_scheduled_notifications').select('created_at').eq('id', id).maybeSingle();
  if (!data) return false;
  if (!cooldownDays) return true;
  const ageDays = (Date.now() - new Date(data.created_at).getTime()) / 86400000;
  return ageDays < cooldownDays;
}

async function markSent(admin: any, id: string, userId: string) {
  await admin.from('sent_scheduled_notifications').upsert({ id, user_id: userId, created_at: new Date().toISOString() });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date();
    let sentCount = 0;

    // ── Birthdays (friend kids: today + 7-day-out; own kids: 7-day-out wishlist nudge) ──
    const { data: kids } = await admin.from('kids').select('id, name, family_id, birthdate').not('birthdate', 'is', null);
    const { data: allFamilyMembers } = await admin.from('family_members').select('user_id, family_id');
    const { data: friendRows } = await admin.from('friend_requests').select('requester_id, addressee_id').eq('status', 'accepted');

    const membersByFamily = new Map<string, string[]>();
    for (const m of allFamilyMembers || []) {
      if (!membersByFamily.has(m.family_id)) membersByFamily.set(m.family_id, []);
      membersByFamily.get(m.family_id)!.push(m.user_id);
    }
    const friendsOf = new Map<string, Set<string>>();
    for (const f of friendRows || []) {
      if (!friendsOf.has(f.requester_id)) friendsOf.set(f.requester_id, new Set());
      if (!friendsOf.has(f.addressee_id)) friendsOf.set(f.addressee_id, new Set());
      friendsOf.get(f.requester_id)!.add(f.addressee_id);
      friendsOf.get(f.addressee_id)!.add(f.requester_id);
    }

    for (const kid of kids || []) {
      const days = daysUntilBirthday(kid.birthdate, today);
      if (days !== 0 && days !== 7) continue;
      const age = turningAge(kid.birthdate, today);
      const owners = membersByFamily.get(kid.family_id) || [];

      // Own-kid reminder (wishlist nudge), 7 days out only — the day-of slideshow already covers "today."
      if (days === 7) {
        for (const ownerId of owners) {
          const id = `own-bday-${kid.id}-${today.getFullYear()}`;
          if (await alreadySent(admin, id, undefined)) continue;
          await sendPushToUser(admin, ownerId, {
            title: 'Birthday coming up',
            body: `${kid.name}'s ${age}${age % 10 === 1 && age !== 11 ? 'st' : age % 10 === 2 && age !== 12 ? 'nd' : age % 10 === 3 && age !== 13 ? 'rd' : 'th'} birthday is in a week — add a wishlist so friends can shop for gift ideas.`,
            url: '/',
            tag: `own-bday-${kid.id}`,
          });
          await markSent(admin, id, ownerId);
          sentCount++;
        }
      }

      // Friend-kid birthday: notify every friend of every owner of this kid's family.
      const notifyIds = new Set<string>();
      for (const ownerId of owners) for (const friendId of friendsOf.get(ownerId) || []) notifyIds.add(friendId);
      for (const friendId of notifyIds) {
        const id = `friend-bday-${kid.id}-${today.getFullYear()}-${days === 0 ? 'today' : '7day'}`;
        if (await alreadySent(admin, id, undefined)) continue;
        await sendPushToUser(admin, friendId, {
          title: days === 0 ? "It's a birthday!" : 'Birthday coming up',
          body: days === 0 ? `It's ${kid.name}'s birthday today!` : `${kid.name}'s birthday is in a week.`,
          url: `/?openBirthday=${kid.id}`,
          tag: `friend-bday-${kid.id}`,
        });
        await markSent(admin, id, friendId);
        sentCount++;
      }
    }

    // ── Prompt of day: whichever kid in a family has gone longest without an entry ──
    const { data: entries } = await admin.from('entries').select('family_id, kid_ids, created_at, date');
    const lastActivityByKid = new Map<string, number>();
    for (const e of entries || []) {
      const ts = e.created_at ? new Date(e.created_at).getTime() : new Date(e.date + 'T12:00:00').getTime();
      for (const kidId of e.kid_ids || []) {
        if (!lastActivityByKid.has(kidId) || lastActivityByKid.get(kidId)! < ts) lastActivityByKid.set(kidId, ts);
      }
    }

    const kidsByFamily = new Map<string, { id: string; name: string }[]>();
    for (const kid of kids || []) {
      if (!kidsByFamily.has(kid.family_id)) kidsByFamily.set(kid.family_id, []);
      kidsByFamily.get(kid.family_id)!.push({ id: kid.id, name: kid.name });
    }

    for (const [familyId, familyKids] of kidsByFamily) {
      if (familyKids.length === 0) continue;
      let mostOverdue: { id: string; name: string; days: number } | null = null;
      for (const kid of familyKids) {
        const last = lastActivityByKid.get(kid.id);
        const days = last ? (Date.now() - last) / 86400000 : Infinity;
        if (!mostOverdue || days > mostOverdue.days) mostOverdue = { ...kid, days };
      }
      if (!mostOverdue || mostOverdue.days < 5) continue;

      const owners = membersByFamily.get(familyId) || [];
      for (const ownerId of owners) {
        const id = `prompt-nudge-${mostOverdue.id}`;
        if (await alreadySent(admin, id, 7)) continue; // don't nag more than once a week
        await sendPushToUser(admin, ownerId, {
          title: 'A little nudge',
          body: `Haven't heard about ${mostOverdue.name} in a few days — got a story to share?`,
          url: '/',
          tag: `prompt-nudge-${mostOverdue.id}`,
        });
        await markSent(admin, id, ownerId);
        sentCount++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
