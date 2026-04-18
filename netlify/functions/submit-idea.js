// P9I Marketing — Share Your Idea form handler
// Writes to public.idea_submissions via Supabase anon key + RLS insert policy.
// Read side is service-role only via the 955 admin dashboard.

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parse body — support JSON or urlencoded so we can evolve the client later.
  let idea = '';
  try {
    const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      idea = (JSON.parse(event.body || '{}').idea || '').toString();
    } else {
      const params = new URLSearchParams(event.body || '');
      idea = (params.get('idea') || '').toString();
    }
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  idea = idea.trim();
  if (!idea) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Idea is required' }) };
  }
  if (idea.length > 280) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Idea too long (max 280)' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  // Capture context for 955 triage
  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    null;
  const userAgent = event.headers['user-agent'] || null;
  const referer = event.headers['referer'] || event.headers['referrer'] || null;

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/idea_submissions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        idea_text: idea,
        submitter_ip: ip,
        user_agent: userAgent,
        page_referrer: referer,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Supabase insert failed', resp.status, text);
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({ error: 'Unable to save idea' }),
      };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('submit-idea error', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
