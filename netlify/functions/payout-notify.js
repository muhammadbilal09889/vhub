// netlify/functions/payout-notify.js
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;

exports.handler = async function (event) {
  try {
    // Allow POST only
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

    if (!TELE_TOKEN || !ADMIN_CHAT) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'telegram not configured' })
      };
    }

    const { memberId, amount, method, details } = JSON.parse(event.body || '{}');

    if (!memberId || !amount) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'missing fields' })
      };
    }

    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'invalid amount' })
      };
    }

    // 1) Get member from Supabase (public.members)
    const memberUrl =
      `${SUPA_URL}/rest/v1/members` +
      `?id=eq.${encodeURIComponent(memberId)}` +
      `&select=id,username,name,phone`;

    const rMember = await fetch(memberUrl, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`
      }
    });

    if (!rMember.ok) {
      const txt = await rMember.text();
      console.error('Supabase member fetch error:', rMember.status, txt);
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'failed to fetch member' })
      };
    }

    const memberRows = await rMember.json();
    const member = memberRows[0];

    if (!member) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, message: 'member not found' })
      };
    }

    // 2) Create payout row in Supabase (public.payouts)
    // Adjust table name / columns if different in your DB
    const payoutPayload = {
      member_id: member.id,
      amount: amt,
      method: method || '',
      details: details || '',
      status: 'requested',
      requested_at: new Date().toISOString()
    };

    const payoutUrl = `${SUPA_URL}/rest/v1/payouts`;

    const rCreate = await fetch(payoutUrl, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payoutPayload)
    });

    const createdRows = await rCreate.json();

    if (!rCreate.ok) {
      console.error('Supabase payout create error:', rCreate.status, createdRows);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'failed to create payout' })
      };
    }

    const payout = Array.isArray(createdRows) ? createdRows[0] : createdRows;
    const payoutId = payout.id;

    // 3) Telegram notification to admin
    const text =
      `🔔 Withdrawal request` +
      `\nMember: ${member.name || member.username || 'N/A'}` +
      `\nMemberID: ${member.id}` +
      `\nAmount: PKR ${amt}` +
      `\nMethod: ${method || '-'}` +
      `\nDetails: ${details || '-'}`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Approve ✅', callback_data: `approve_payout:${payoutId}` },
          { text: 'Reject ❌',  callback_data: `reject_payout:${payoutId}` }
        ]
      ]
    };

    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT,
        text,
        reply_markup: keyboard
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, payoutId })
    };
  } catch (err) {
    console.error('payout-notify error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
