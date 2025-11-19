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

    // members table se simple list
    const url = `${SUPA_URL}/rest/v1/members?select=id,username,name,phone,created_at,status&order=created_at.desc`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`
      }
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('list-members HTTP error', res.status, txt);
      return {
        statusCode: res.status,
        body: JSON.stringify({ ok: false, message: 'Error fetching members' })
      };
    }

    const rows = await res.json();

    const members = rows.map(m => ({
      ID: m.id,
      Username: m.username || '',
      Name: m.name || '',
      Phone: m.phone || '',
      Date: m.created_at
        ? new Date(m.created_at).toISOString().slice(0,10)
        : '',
      Status: m.status || ''
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, members })
    };
  } catch (err) {
    console.error('list-members exception', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
