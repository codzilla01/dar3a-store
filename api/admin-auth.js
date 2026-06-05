/**
 * Vercel Serverless — OTP admin auth (secrets stay server-side only).
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_JWT_SECRET
 */
const crypto = require('crypto');

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function getSecret() {
    const s = process.env.ADMIN_JWT_SECRET;
    if (!s || s.length < 16) {
        throw new Error('ADMIN_JWT_SECRET must be set (min 16 chars)');
    }
    return s;
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function signPayload(obj) {
    const secret = getSecret();
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

function verifySignedToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const secret = getSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (data.exp && Date.now() > data.exp) return null;
        return data;
    } catch {
        return null;
    }
}

function json(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).end(JSON.stringify(body));
}

async function sendTelegramOtp(otp, storeName, role) {
    let botToken = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (role === 'assistant') {
        botToken = process.env.ASSISTANT_BOT_TOKEN || botToken;
        chatId = process.env.ASSISTANT_CHAT_ID || chatId;
    }
    
    if (!botToken || !chatId) {
        throw new Error('Telegram not configured');
    }
    const name = (storeName || 'Dar3a Store').slice(0, 80);
    const roleLabel = role === 'assistant' ? 'مساعد' : 'مدير';
    const text = `🔐 *رمز تحقق (${roleLabel}) - ${name}*\n\n🔢 الرمز: *${otp}*\n⏰ ${new Date().toLocaleString('ar-EG')}\n\n_صالح 5 دقائق_`;
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.description || 'Telegram send failed');
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }
    }
    body = body || {};

    // Detect the action from the URL path if not explicitly provided in the request body
    const urlPath = req.url || '';
    let action = body.action;
    if (!action) {
        if (urlPath.match(/request/i)) action = 'request';
        else if (urlPath.match(/verify/i)) action = 'verify';
        else if (urlPath.match(/check/i)) action = 'check';
    }
    body.action = action;

    try {
        if (body.action === 'request') {
            const otp = String(crypto.randomInt(100000, 999999));
            const challengeToken = signPayload({
                h: hashOtp(otp),
                exp: Date.now() + OTP_TTL_MS,
                attempts: 0,
                role: body.role || 'admin',
                n: crypto.randomBytes(8).toString('hex')
            });
            await sendTelegramOtp(otp, body.storeName, body.role);
            return json(res, 200, { ok: true, challengeToken, expiresIn: OTP_TTL_MS / 1000 });
        }

        if (body.action === 'verify') {
            const otp = String(body.otp || '').replace(/\D/g, '');
            const challengeToken = body.challengeToken;
            if (otp.length !== 6) return json(res, 400, { ok: false, error: 'Invalid OTP' });

            const data = verifySignedToken(challengeToken);
            if (!data || !data.h) return json(res, 401, { ok: false, error: 'Challenge expired' });

            const attempts = (data.attempts || 0) + 1;
            if (attempts > MAX_VERIFY_ATTEMPTS) {
                return json(res, 429, { ok: false, error: 'Too many attempts' });
            }

            if (hashOtp(otp) !== data.h) {
                const retryToken = signPayload({
                    h: data.h,
                    exp: data.exp,
                    attempts,
                    role: data.role || 'admin',
                    n: data.n
                });
                return json(res, 401, {
                    ok: false,
                    error: 'Wrong code',
                    attemptsLeft: MAX_VERIFY_ATTEMPTS - attempts,
                    challengeToken: retryToken
                });
            }

            const expiresAt = Date.now() + SESSION_TTL_MS;
            const sessionToken = signPayload({
                role: data.role || 'admin',
                exp: expiresAt,
                sid: crypto.randomBytes(16).toString('hex')
            });
            return json(res, 200, { ok: true, sessionToken, expiresAt });
        }

        if (body.action === 'check') {
            const data = verifySignedToken(body.sessionToken);
            if (!data || (data.role !== 'admin' && data.role !== 'assistant')) {
                return json(res, 401, { ok: false, valid: false });
            }
            return json(res, 200, { ok: true, valid: true, expiresAt: data.exp });
        }

        return json(res, 400, { ok: false, error: 'Unknown action' });
    } catch (e) {
        console.error('admin-auth error:', e.message);
        return json(res, 500, { ok: false, error: 'Server error' });
    }
};
