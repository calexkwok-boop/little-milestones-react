const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google's Geocoding API rejects any key with an HTTP referrer restriction —
// that restriction type only works with client-side JS libraries (Maps
// JavaScript API), not raw REST calls like this one. Keeping the call here,
// server-side, means the key never ships in the client bundle at all, so it
// can go unrestricted (or IP-restricted) without exposing it to the browser.
//
// Caller must be an authenticated Patina user — enforced by Supabase's default
// JWT verification on edge functions, same as the other functions in this project.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { lat, lng } = await req.json();
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(JSON.stringify({ error: 'lat and lng are required numbers' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const key = Deno.env.get('GOOGLE_GEOCODING_KEY')!;
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`);
    const geo = await res.json();

    if (geo.status !== 'OK') {
      return new Response(JSON.stringify({ error: geo.error_message || geo.status || 'Geocode failed', location: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const components = geo.results?.[0]?.address_components || [];
    const get = (type: string) => components.find((c: { types: string[] }) => c.types.includes(type))?.long_name;
    const location = [get('locality') || get('sublocality'), get('administrative_area_level_1')].filter(Boolean).join(', ') || null;

    return new Response(JSON.stringify({ location }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
