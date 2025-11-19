// netlify/functions/add-member.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ------------ Helpers -------------- */
async function supaInsert(table, payload) {
  const url = `${SUPA_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Supabase insert error:', res.status, data);
    throw new Error('failed_to_insert_member');
  }

  return Array.isArray(data) ? data[0] : data;
}

/* ------------ Main Handler -------------- */
exports.handler = async (event) => {
  try {
    // 1) Method check
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, message: 'Method not allowed' })
      };
    }

    // 2) Env check
    if (!SUPA_URL || !SUPA_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'supabase not configured' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { sponsorId, position, name, username, phone } = body;

    // 3) Basic validation
    if (!sponsorId || !position || !['left', 'right'].includes(position)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          message: 'Missing or invalid sponsor / position'
        })
      };
    }

    // 4) Check sponsor exists
    const sponsorRes = await fetch(
      `${SUPA_URL}/rest/v1/members?id=eq.${encodeURIComponent(
        sponsorId
      )}&select=*`,
      {
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`
        }
      }
    );

    if (!sponsorRes.ok) {
      const txt = await sponsorRes.text();
      console.error('Supabase sponsor fetch error:', sponsorRes.status, txt);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'failed to load sponsor' })
      };
    }

    const sponsorArr = await sponsorRes.json();
    const sponsor = sponsorArr[0];

    if (!sponsor) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, message: 'Sponsor not found' })
      };
    }

    // 5) Check left/right slot empty
    if (position === 'left' && sponsor.left_child_id) {
      return {
        statusCode: 409,
        body: JSON.stringify({ ok: false, message: 'Left slot already filled' })
      };
    }

    if (position === 'right' && sponsor.right_child_id) {
      return {
        statusCode: 409,
        body: JSON.stringify({ ok: false, message: 'Right slot already filled' })
      };
    }

    // 6) Create pending member under this sponsor
    const newMemberRecord = {
      sponsor_id: sponsor.id,          // ensure we use DB id, not raw string blindly
      position,
      name: name || null,
      username: username || null,
      phone: phone || null,
      status: 'pending',
      level: (sponsor.level || 0) + 1
    };

    const newMember = await supaInsert('members', newMemberRecord);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: 'Member created as pending, awaiting admin approval.',
        member: newMember
      })
    };
  } catch (err) {
    console.error('add-member error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
