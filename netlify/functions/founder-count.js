// P9T Marketing — Founding Member count endpoint (S47)
// Single source of truth for FM count across both marketing site counters
// + future surfaces. Reads via public.get_founder_count() RPC (SECURITY DEFINER,
// returns int only — anon key never sees user list).
//
// Both "X of 100 spots signed" (hero/wall) and "X of 100 founding spots claimed"
// (pricing panel) call this endpoint via the same client helper, so they
// can never disagree.

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    // Short cache so counter feels live but doesn't hammer Supabase
    'Cache-Control': 'public, max-age=30, s-maxage=30',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Server not configured' }),
    };
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_founder_count`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('founder-count rpc failed', resp.status, text);
      // Fail safe: return 0 so the counter never shows a misleading number.
      // Client should treat this as "couldn't load" rather than "really 0".
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ count: 0, max: 100, full: false, stale: true }),
      };
    }

    // RPC returns the integer directly
    const count = await resp.json();
    const n = typeof count === 'number' ? count : parseInt(count, 10) || 0;

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        count: n,
        max: 100,
        remaining: Math.max(0, 100 - n),
        full: n >= 100,
        stale: false,
      }),
    };
  } catch (err) {
    console.error('founder-count error', err);
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ count: 0, max: 100, full: false, stale: true }),
    };
  }
};
