// netlify/functions/distribute-commission.js
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Commission per level (change as you like)
const LEVEL_AMOUNTS = [100, 50, 25, 10, 5]; // PKR

async function getMemberById(memberId) {
  const url =
    `${SUPA_URL}/rest/v1/members` +
    `?id=eq.${encodeURIComponent(memberId)}` +
    `&select=id,sponsor_id`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('getMemberById error:', res.status, txt);
    return null;
  }

  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function createEarning(row) {
  const url = `${SUPA_URL}/rest/v1/earnings`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('createEarning error:', res.status, data);
    return null;
  }

  return Array.isArray(data) ? data[0] : data;
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, message: 'Method not allowed' })
      };
    }

    if (!SUPA_URL || !SUPA_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'supabase not configured' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { memberId } = body;

    if (!memberId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'missing memberId' })
      };
    }

    // Current member (jis ke through commissions distribute hongi)
    const current = await getMemberById(memberId);
    if (!current) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, message: 'member not found' })
      };
    }

    // Upline traversal via sponsor_id
    let parentId = current.sponsor_id || null;

    for (let level = 1; level <= LEVEL_AMOUNTS.length; level++) {
      if (!parentId) break;

      const parent = await getMemberById(parentId);
      if (!parent) break;

      const earningRow = {
        member_id: parent.id,      // jisko earning mil rahi hai (upline)
        from_member_id: current.id, // jiski joining se earning bani
        level: level,
        amount: LEVEL_AMOUNTS[level - 1],
        status: 'pending',
        created_at: new Date().toISOString()
      };

      await createEarning(earningRow);

      // move to next upline
      parentId = parent.sponsor_id || null;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('distribute-commission error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
