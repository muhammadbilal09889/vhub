// netlify/functions/telegram-webhook.js
// PHASE 1 – /start logic wapas

const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELE_TOKEN}`;

async function sendTelegram(chatId, text) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), text, parse_mode: 'HTML' })
    });
  } catch (e) { console.error('sendTelegram:', e); }
}

async function supaFetch(path) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'nothing' };

  try {
    const body = JSON.parse(event.body || '{}');
    const msg = body.message;

    if (!msg) return { statusCode: 200, body: 'no message' };

    const chatId = msg.chat?.id;
    const text = (msg.text || '').trim();

    // Only START handle karna
    if (text.startsWith('/start')) {
      const orderId = text.split(' ')[1];
      if (!orderId) {
        await sendTelegram(chatId, 'Use: /start <OrderID>');
        return { statusCode: 200, body: 'ok' };
      }

      // Payment check
      const payments = await supaFetch(`/rest/v1/payments?OrderID=eq.${orderId}&select=*`);
      if (Array.isArray(payments) && payments.length > 0) {
        await sendTelegram(chatId, `💡 Order <b>${orderId}</b> found. Payment pending approval 🔄`);
      } else {
        await sendTelegram(chatId, `⚠️ Order <b>${orderId}</b> not found.`);
      }

      return { statusCode: 200, body: 'ok' };
    }

    // Normal message
    await sendTelegram(chatId, 'Bot online hai but commands limited hain. Use /start <OrderID>.');

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'error' };
  }
};