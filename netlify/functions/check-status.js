// netlify/functions/check-status.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, message: 'Method not allowed' })
      };
    }

    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'missing orderId' })
      };
    }

    if (!SUPA_URL || !SUPA_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'supabase not configured' })
      };
    }

    const url =
      `${SUPA_URL}/rest/v1/payments` +
      `?OrderID=eq.${encodeURIComponent(orderId)}` +
      `&select=*`;

    const res = await fetch(url, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`
      }
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Supabase check-status error:', res.status, txt);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'failed to fetch payment' })
      };
    }

    const arr = await res.json();
    const rec = Array.isArray(arr) && arr[0] ? arr[0] : null;

    if (!rec) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, message: 'payment not found' })
      };
    }

    // IMPORTANT: frontend return.html expects .payment
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, payment: rec })
    };
  } catch (err) {
    console.error('check-status error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
