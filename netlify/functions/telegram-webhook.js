// netlify/functions/telegram-webhook.js
const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Payments';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function telegramSend(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode:'Markdown' }) });
}

async function airtableGetAllPayments() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?maxRecords=50&view=Grid%20view`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const data = await res.json();
  return data.records || [];
}

async function airtableCreateOrUpdate(provider, details) {
  // simplified create/update helper
  const table = process.env.AIRTABLE_TABLE || 'Payments';
  // try to find existing by Provider
  const filter = `({Provider}='${provider.replace("'", "\\'")}')`;
  const urlFind = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?filterByFormula=${encodeURIComponent(filter)}`;
  const findRes = await fetch(urlFind, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const findJson = await findRes.json();
  if (findJson.records && findJson.records.length) {
    const id = findJson.records[0].id;
    const urlPatch = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${id}`;
    const r = await fetch(urlPatch, { method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify({ fields: { Provider: provider, Details: details } }) });
    return r.json();
  } else {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
    const r = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify({ fields: { Provider: provider, Details: details } }) });
    return r.json();
  }
}

exports.handler = async function(event) {
  // Telegram posts updates as JSON
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

  let update;
  try { update = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: 'invalid json' }; }
  const message = update.message || update.edited_message;
  if (!message) return { statusCode: 200, body: 'no message' };

  const chatId = message.chat.id;
  const from = message.from;
  const text = (message.text || '').trim();

  const isAdmin = TELEGRAM_ADMIN_IDS.includes(String(from.id));

  if (!text) {
    await telegramSend(chatId, 'No text received.');
    return { statusCode: 200, body: 'no text' };
  }

  const parts = text.split(' ').filter(Boolean);
  const cmd = (parts[0] || '').toLowerCase();

  try {
    if (cmd === '/setpayment' || cmd === '/setpayments') {
      if (!isAdmin) return { statusCode: 200, body: 'not admin' };
      if (parts.length < 3) {
        await telegramSend(chatId, 'Usage: /setpayment <provider> <details>');
        return { statusCode: 200, body: 'bad usage' };
      }
      const provider = parts[1].toLowerCase();
      const details = parts.slice(2).join(' ');
      // allowed providers
      const allowed = ['jazzcash','easypaisa'];
      if (!allowed.includes(provider)) {
        await telegramSend(chatId, 'Allowed providers: jazzcash, easypaisa');
        return { statusCode: 200, body: 'invalid provider' };
      }
      const result = await airtableCreateOrUpdate(provider, details);
      await telegramSend(chatId, `Updated ${provider} details successfully.\n${JSON.stringify(result)}`);
      return { statusCode: 200, body: 'ok' };
    } else if (cmd === '/getpayments' || cmd === '/payments') {
      const records = await airtableGetAllPayments();
      if (!records.length) { await telegramSend(chatId, 'No payments configured yet.'); return { statusCode: 200, body: 'no payments' }; }
      let msg = 'Current Payment Details:\n';
      records.forEach(r => {
        const p = r.fields || {};
        msg += `\n- ${p.Provider || 'unknown'}: ${p.Details || ''}\n`;
      });
      await telegramSend(chatId, msg);
      return { statusCode: 200, body: 'ok' };
    } else {
      // fallback help
      if (text.startsWith('/')) {
        await telegramSend(chatId, 'Unknown command. Use:\n/setpayment <provider> <details>\n/getpayments');
        return { statusCode: 200, body: 'unknown cmd' };
      }
    }
  } catch (err) {
    console.error('ERROR', err);
    await telegramSend(chatId, '⚠️ An error occurred while processing. Check server logs.');
    return { statusCode: 500, body: 'error' };
  }

  return { statusCode: 200, body: 'ok' };
};