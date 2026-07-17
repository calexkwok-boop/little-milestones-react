const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Caller must be an authenticated Patina user — enforced by Supabase's default
// JWT verification on edge functions, same trust model as sign-upload. Ownership
// of the specific assets isn't re-checked here; the client only ever passes
// public IDs belonging to an entry it already successfully deleted/edited via
// Supabase (which is itself RLS-gated), so there's no path to delete someone
// else's media through this endpoint from the app's own UI.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { resources } = await req.json();
    if (!Array.isArray(resources) || resources.length === 0) {
      return new Response(JSON.stringify({ ok: true, deleted: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')!;
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY')!;
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')!;
    const auth = 'Basic ' + btoa(`${apiKey}:${apiSecret}`);

    // Cloudinary's bulk-delete endpoint is scoped per resource_type, so group first.
    const byType = new Map();
    for (const r of resources) {
      if (!r?.publicId) continue;
      const type = r.resourceType === 'video' ? 'video' : 'image';
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(r.publicId);
    }

    let deleted = 0;
    for (const [resourceType, publicIds] of byType) {
      const params = new URLSearchParams();
      publicIds.forEach((id) => params.append('public_ids[]', id));
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload?${params.toString()}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      if (res.ok) deleted += publicIds.length;
      else console.error(`Cloudinary bulk delete (${resourceType}) failed:`, res.status, await res.text().catch(() => ''));
    }

    return new Response(JSON.stringify({ ok: true, deleted }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
