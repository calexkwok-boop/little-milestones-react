import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { images, kidNames, ageMonths, mode, draftText } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    let text: string;

    if (mode === 'polish') {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `Fix the grammar, spelling, punctuation, and capitalization in this parent's journal entry. This includes: capitalizing the word "I" wherever it appears, capitalizing the first letter of every sentence, and fixing any other clear errors. Preserve the author's voice, word choices, and meaning exactly — do not add sentences, change the tone, or rewrite anything that isn't broken. Return only the corrected text, nothing else.\n\n${draftText}`,
        }],
      });
      text = (message.content[0] as Anthropic.TextBlock).text;
    } else {
      const ageLabel = !ageMonths ? '' : ageMonths < 12
        ? `, who is ${ageMonths} months old`
        : ageMonths % 12 === 0
          ? `, who is ${ageMonths / 12} year${ageMonths / 12 !== 1 ? 's' : ''} old`
          : `, who is ${Math.floor(ageMonths / 12)} year${Math.floor(ageMonths / 12) !== 1 ? 's' : ''} and ${ageMonths % 12} months old`;

      const content: Anthropic.MessageParam['content'] = [];

      for (const img of (images || [])) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        });
      }

      content.push({
        type: 'text',
        text: `Write a short, warm journal entry from a parent to their child named ${kidNames}${ageLabel}.
Write in first person as the parent, addressed directly to the child — do NOT include a salutation like "Dear ${kidNames}", just begin the body.
${images?.length > 0 ? 'Use what you see in the photo(s) as the heart of the entry.' : ''}
Keep it to 2–3 paragraphs. Make it feel personal and specific, not generic. Use simple, loving language.`,
      });

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content }],
      });

      text = (message.content[0] as Anthropic.TextBlock).text;
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
