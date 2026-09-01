const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Proxies Google's Custom Search JSON API (image search) so the API key
// stays server-side instead of in the client bundle — same reasoning as
// sign-upload keeping the Cloudinary secret out of the browser.
//
// Requires GOOGLE_SEARCH_API_KEY (a Custom Search API key from a Google Cloud
// project) and GOOGLE_SEARCH_CX (a Programmable Search Engine ID configured
// to search the whole web with Image search turned on) as function secrets.
// The API caps at 10 results per request and 100 free queries/day.
//
// Caller must be an authenticated Patina user — enforced by Supabase's default
// JWT verification on edge functions, same as the other functions in this project.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { query, limit = 10 } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'query is required', results: [] }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_SEARCH_API_KEY');
    const cx = Deno.env.get('GOOGLE_SEARCH_CX');
    if (!apiKey || !cx) {
      return new Response(JSON.stringify({ error: 'Image search is not configured yet', results: [] }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const num = Math.min(10, Number(limit) || 10);
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&safe=active&num=${num}`;
    const res = await fetch(searchUrl);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Image search failed (${res.status})`, results: [] }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await res.json();
    const results = (data.items || []).map((item) => ({
      imageUrl: item.link,
      thumbnailUrl: item.image?.thumbnailLink || item.link,
      title: item.title || '',
      sourceDomain: item.displayLink || '',
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
