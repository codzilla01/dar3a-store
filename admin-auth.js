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

async function sendTelegramOtp(otp, storeName) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        throw new Error('Telegram not configured');
    }
    const name = (storeName || 'Dar3a Store').slice(0, 80);
    const text = `🔐 *رمز تحقق - ${name}*\n\n🔢 الرمز: *${otp}*\n⏰ ${new Date().toLocaleString('ar-EG')}\n\n_صالح 5 دقائق_`;
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

    try {
        if (body.action === 'request') {
            const otp = String(crypto.randomInt(100000, 999999));
            const challengeToken = signPayload({
                h: hashOtp(otp),
                exp: Date.now() + OTP_TTL_MS,
                attempts: 0,
                n: crypto.randomBytes(8).toString('hex')
            });
            await sendTelegramOtp(otp, body.storeName);
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
                role: 'admin',
                exp: expiresAt,
                sid: crypto.randomBytes(16).toString('hex')
            });
            return json(res, 200, { ok: true, sessionToken, expiresAt });
        }

        if (body.action === 'check') {
            const data = verifySignedToken(body.sessionToken);
            if (!data || data.role !== 'admin') {
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
