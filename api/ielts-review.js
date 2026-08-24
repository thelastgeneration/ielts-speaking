export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });

  const { question, part, answer } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'question and answer are required' });

  const instructions = `You are an IELTS Speaking coach. Review the student's spoken answer against the exact IELTS question and part. Preserve the student's personal content, examples and viewpoint. Do not invent a different story. Make the answer sound natural and spoken, not like an essay.\n\nPart-specific rules:\n- Part 1: answer directly, stay concise, usually 2-4 natural sentences; avoid overdevelopment.\n- Part 2: cover the cue-card requirements, build a clear story/description, improve coherence and natural linking, and keep it realistic for 1.5-2 minutes.\n- Part 3: use a clear chain such as opinion -> reason -> explanation/example -> optional qualification; develop ideas without sounding memorised.\n\nCheck: task relevance, missing content, logic/coherence, grammar, vocabulary/collocations, natural spoken English, unnecessary complexity, repetition, and Chinese-English phrasing. Only make changes that improve IELTS Speaking quality. Return concise diagnostic points in Chinese and a revised English answer. Also give an approximate band range only for this answer, not an official IELTS score.`;

  const input = `IELTS part: ${part || 'Unknown'}\nQuestion: ${question}\nStudent answer: ${answer}\n\nReturn JSON.`;

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        store: false,
        instructions,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'ielts_review',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                band_range: { type: 'string' },
                diagnosis: {
                  type: 'array',
                  items: { type: 'string' }
                },
                revised_answer: { type: 'string' }
              },
              required: ['band_range', 'diagnosis', 'revised_answer'],
              additionalProperties: false
            }
          }
        }
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'OpenAI request failed' });

    const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    if (!text) return res.status(502).json({ error: 'No structured review returned' });
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Review failed' });
  }
}
