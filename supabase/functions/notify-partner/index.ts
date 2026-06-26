const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { authorName, partnerUserId, kidNames, entryDate, entryText } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')!;

    // Get partner's email from auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${partnerUserId}`, {
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    });
    if (!userRes.ok) throw new Error('Could not fetch partner');
    const { email: partnerEmail } = await userRes.json();
    if (!partnerEmail) throw new Error('Partner has no email');

    const date = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const preview = entryText?.length > 250 ? entryText.slice(0, 250) + '…' : entryText;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FBF8F2;">
  <div style="max-width:480px;margin:0 auto;padding:48px 32px;font-family:Georgia,serif;color:#2C3828;">
    <p style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#4A5E50;margin:0 0 4px;">Patina</p>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#9AA89C;margin:0 0 36px;letter-spacing:0.5px;">${date}</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;color:#3A3020;">
      ${authorName} wrote a new letter to ${kidNames}.
    </p>
    <div style="border-left:3px solid #C4D8C0;padding:14px 20px;margin:0 0 32px;background:#F6FAF4;border-radius:0 8px 8px 0;">
      <p style="font-style:italic;font-size:15px;line-height:1.75;color:#5C6B5E;margin:0;">${preview}</p>
    </div>
    <p style="font-family:Arial,sans-serif;font-size:12px;color:#B8CCB4;margin:0;">Open Patina to read the full letter.</p>
  </div>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Patina <onboarding@resend.dev>',
        to: [partnerEmail],
        subject: `${authorName} wrote a new letter`,
        html,
      }),
    });

    if (!emailRes.ok) throw new Error(await emailRes.text());

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
