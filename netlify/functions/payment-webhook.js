// netlify/functions/payment-webhook.js
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELEGRAM_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_CHAT  = process.env.TELEGRAM_ADMIN_CHAT_ID;

function parseBody(event) {
  const raw = event.body || '';
  const contentType = (event.headers['content-type'] || '').toLowerCase();

  // JSON
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch (err) {
      console.error('JSON parse error in payment-webhook:', err);
      return {};
    }
  }

  // x-www-form-urlencoded (JazzCash / Easypaisa, etc.)
  try {
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  } catch (err) {
    console.error('Form parse error in payment-webhook:', err);
    return {};
  }
}

function normalizeStatus(s) {
  if (!s) return 'processing';
  const v = s.toString().toLowerCase();

  if (['paid', 'success', 'successful', 'completed'].includes(v)) return 'paid';
  if (['fail', 'failed', 'rejected', 'cancelled', 'canceled', 'error'].includes(v))
    return 'failed';
  if (['awaiting_admin', 'pending', 'processing', 'in_progress'].includes(v))
    return 'awaiting_admin';

  return v; // fallback
}

async function notifyAdmin(orderId, status, amount) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT) return;

  const text = `Payment update:\nOrder ID: ${orderId}\nStatus: ${status}\nAmount: ${amount || 'N/A'}`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_CHAT,
        text
      })
    });
  } catch (err) {
    console.error('Failed to notify admin via Telegram:', err);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, message: 'Method not allowed' })
      };
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase env vars missing');
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, message: 'Supabase not configured' })
      };
    }

    const body = parseBody(event);
    console.log('PAYMENT WEBHOOK BODY:', JSON.stringify(body).slice(0, 1500));

    // yahan par alag-alag providers ke fields handle karo
    const orderId =
      body.OrderID ||
      body.orderId ||
      body.order_id ||
      body.pp_TxnRefNo || // JazzCash-style
      null;

    if (!orderId) {
      console.warn('No orderId found in webhook body');
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, message: 'Missing orderId' })
      };
    }

    // provider se jo status aya
    const rawStatus =
      body.status ||
      body.Status ||
      body.payment_status ||
      body.pp_ResponseMessage || // example
      'processing';

    const normStatus = normalizeStatus(rawStatus);

    const amount =
      body.amount || body.Amount || body.pp_Amount || null;

    const gatewayRef =
      body.transaction_id ||
      body.txn_id ||
      body.pp_RefNo ||
      null;

    // Supabase PATCH payload (column names yahan apne hisaab se adjust karo)
    const updatePayload = {
      Status: normStatus,
      Amount: amount,
      GatewayRef: gatewayRef,
      ProviderRaw: body,
      UpdatedAt: new Date().toISOString()
    };

    const url =
      `${SUPABASE_URL}/rest/v1/payments` +
      `?OrderID=eq.${encodeURIComponent(orderId)}`;

    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(updatePayload)
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    if (!resp.ok) {
      console.error('Supabase PATCH error:', resp.status, json);
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          message: 'Failed to update payment in Supabase',
          detail: json
        })
      };
    }

    // PATCH response array (updated rows)
    const updated = Array.isArray(json) ? json[0] : json;
    console.log('PAYMENT UPDATED:', updated);

    // notify admin if fully paid
    if (normStatus === 'paid') {
      await notifyAdmin(orderId, normStatus, amount);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: 'Payment updated',
        payment: updated
      })
    };
  } catch (err) {
    console.error('payment-webhook handler error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: 'Server error', error: err.message })
    };
  }
};
