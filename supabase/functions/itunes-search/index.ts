const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// iTunes's search endpoint only sends CORS headers on successful (200)
// responses, not on errors or rate limits — so a client hitting it directly
// sees a misleading "blocked by CORS policy" in the console instead of the
// real 429, and every developer/user's own IP accumulates toward Apple's
// rate limit independently. Routing through here means all callers share
// this function's IP instead, and a real failure comes back as a normal
// JSON error the caller can actually branch on.
//
// Caller must be an authenticated Patina user — enforced by Supabase's default
// JWT verification on edge functions, same as the other functions in this project.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { term, limit = 8 } = await req.json();
    if (!term || typeof term !== 'string') {
      return new Response(JSON.stringify({ error: 'term is required', results: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${Math.min(50, Number(limit) || 8)}`);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `iTunes search failed (${res.status})`, results: [] }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json();

    return new Response(JSON.stringify({ results: data.results || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
