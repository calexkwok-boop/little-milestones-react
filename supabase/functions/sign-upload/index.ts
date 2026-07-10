const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Caller must be an authenticated Patina user — enforced by Supabase's default
// JWT verification on edge functions (no anon-key-only access), same as the
// other functions in this project.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME')!;
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY')!;
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')!;
    const preset = Deno.env.get('CLOUDINARY_UPLOAD_PRESET')!;

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `timestamp=${timestamp}&upload_preset=${preset}`;
    const signature = await sha1Hex(paramsToSign + apiSecret);

    return new Response(
      JSON.stringify({ signature, timestamp, apiKey, cloudName, preset }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
