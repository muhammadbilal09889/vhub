// netlify/functions/list-members.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  try {
    if (!SUPA_URL || !SUPA_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'Supabase not configured' })
      };
    }

    // Use exact members table
    const url = `${SUPA_URL}/rest/v1/members?Verified=eq.true&select=OrderID,Amount,Name,Phone,created_at,Verified`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ ok: false, message: 'Error fetching members' })
      };
    }

    const rows = await res.json();

    // Format data before returning (optional clean format)
    const formatted = rows.map(m => ({
      OrderID: m.OrderID,
      Amount: m.Amount,
      Name: m.Name,
      Phone: m.Phone,
      Date: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
      Verified: m.Verified ? 'Yes' : 'No'
    }));

    return { statusCode: 200, body: JSON.stringify({ ok: true, members: formatted }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
