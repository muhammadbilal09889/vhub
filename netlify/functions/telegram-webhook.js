// netlify/functions/telegram-webhook.js
// SUPER SIMPLE TEST WEBHOOK

const fetch = require('node-fetch');

const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELE_TOKEN}`;

async function sendTelegram(chatId, text) {
  if (!TELE_TOKEN) {
    console.error('⚠️ TELEGRAM_BOT_TOKEN missing in env');
    return;
  }
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('sendTelegram error:', err);
  }
}

exports.handler = async (event) => {
  // Telegram webhook hamesha POST bhejta hai
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'no action' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('TEST WEBHOOK UPDATE:', JSON.stringify(body).slice(0, 1000));

    const msg = body.message;
    if (!msg || !msg.chat) {
      // koi normal message nahi mila
      return { statusCode: 200, body: 'ok' };
    }

    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    let reply = 'Test webhook: message received ✅';

    if (text.toLowerCase().startsWith('/start')) {
      reply = 'Salaam! ✅ Test webhook chal raha hai. Aapka /start mil gaya.';
    } else if (text.toLowerCase().startsWith('/help')) {
      reply = 'Ye sirf test version hai. /start bhejoge to sirf test reply aayega 🙂';
    } else if (text) {
      reply = `Test reply: "${text}" mil gaya ✅`;
    }

    await sendTelegram(chatId, reply);

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('TEST telegram-webhook error:', err);
    return { statusCode: 500, body: 'error' };
  }
};