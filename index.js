// index.js — Dar3a Store production API
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const production = process.env.NODE_ENV === 'production';
const allowDemoMode = !production && process.env.ALLOW_DEMO_MODE === 'true';
let db = require('./database');
if (!db.configured && allowDemoMode) db = require('./fallback-db');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
// Customer deployments can require an active annual license before the storefront API serves data.
// Keep this true in a customer production deployment; developer/admin routes remain available to renew it.
const licenseRequired = production ? process.env.REQUIRE_STORE_LICENSE !== 'false' : process.env.REQUIRE_STORE_LICENSE === 'true';
const storeActivationKey = process.env.STORE_ACTIVATION_KEY?.trim();
const storeLicenseDomain = process.env.STORE_LICENSE_DOMAIN?.trim();
const licenseCache = { checkedAt: 0, valid: false, status: 'not_checked' };
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const csp = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: production ? [] : null
};
// Helmet treats a null directive as an explicit opt-out from its default value.
app.use(helmet({ contentSecurityPolicy: { directives: csp }, crossOriginEmbedderPolicy: false, frameguard: { action: 'deny' }, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(express.json({ limit: '100kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'تم تجاوز الحد المسموح من الطلبات، حاول لاحقاً.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'محاولات دخول كثيرة. حاول بعد 15 دقيقة.' } });
const publicWriteLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'طلبات كثيرة. حاول لاحقاً.' } });
app.use('/api', apiLimiter);

function publicError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    error.public = true;
    return error;
}

function ensureConfigured(req, res, next) {
    if (!db.configured && !allowDemoMode) return next(publicError('الخدمة غير مهيأة بعد.', 503));
    if (!JWT_SECRET || JWT_SECRET.length < 32) return next(publicError('إعدادات الحماية غير مكتملة.', 503));
    next();
}

async function requireStoreLicense(req, res, next) {
    if (!licenseRequired) return next();
    if (!storeActivationKey || !storeLicenseDomain) return next(publicError('هذا المتجر يحتاج إلى مفتاح تفعيل صالح.', 402));
    try {
        const cacheIsFresh = Date.now() - licenseCache.checkedAt < 12 * 60 * 60 * 1000;
        if (!cacheIsFresh) {
            const result = await db.verifyActivation(storeActivationKey, cleanDomain(storeLicenseDomain));
            licenseCache.checkedAt = Date.now();
            licenseCache.valid = result.valid;
            licenseCache.status = result.status;
        }
        if (!licenseCache.valid) return next(publicError('اشتراك المتجر غير نشط. يرجى التواصل مع الدعم.', 402));
        next();
    } catch (error) {
        next(error);
    }
}

function parseCookies(header = '') {
    return header.split(';').reduce((cookies, piece) => {
        const index = piece.indexOf('=');
        if (index > -1) cookies[piece.slice(0, index).trim()] = decodeURIComponent(piece.slice(index + 1).trim());
        return cookies;
    }, {});
}

function sessionCookieOptions() {
    return {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: '/',
        maxAge: 8 * 60 * 60 * 1000
    };
}

function webAuthnCookieOptions() {
    return {
        httpOnly: true,
        secure: production,
        sameSite: 'strict',
        path: '/api/auth/webauthn',
        maxAge: 5 * 60 * 1000
    };
}

function getWebAuthnConfig(req) {
    const rpID = (process.env.WEBAUTHN_RP_ID?.trim() || req.hostname).toLowerCase();
    const expectedOrigin = process.env.WEBAUTHN_ORIGIN?.trim() || `${req.protocol}://${req.get('host')}`;
    if (production && (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN)) {
        throw publicError('إعداد البصمة غير مكتمل في بيئة الإنتاج.', 503);
    }
    try {
        const origin = new URL(expectedOrigin);
        const originHost = origin.hostname.toLowerCase();
        const originIsExact = origin.origin === expectedOrigin;
        const rpMatchesOrigin = originHost === rpID || originHost.endsWith(`.${rpID}`);
        if (!rpID || !originIsExact || !rpMatchesOrigin || !['http:', 'https:'].includes(origin.protocol) || (production && origin.protocol !== 'https:')) {
            throw new Error('invalid WebAuthn configuration');
        }
    } catch (error) {
        throw publicError('إعداد البصمة غير صحيح. راجع نطاق RP والأصل HTTPS.', 503);
    }
    return { rpID, expectedOrigin, rpName: process.env.WEBAUTHN_RP_NAME?.trim() || 'Dar3a Store' };
}

function createWebAuthnChallenge(res, action, userId, challenge) {
    const token = jwt.sign({ action, userId, challenge }, JWT_SECRET, {
        algorithm: 'HS256', issuer: 'dar3a-store', audience: 'dar3a-webauthn', expiresIn: '5m'
    });
    res.cookie('dar3a_webauthn', token, webAuthnCookieOptions());
}

function readWebAuthnChallenge(req, action) {
    try {
        const token = parseCookies(req.headers.cookie).dar3a_webauthn;
        if (!token) throw publicError('انتهت جلسة البصمة. حاول مرة أخرى.', 401);
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'dar3a-store', audience: 'dar3a-webauthn' });
        if (payload.action !== action || !payload.userId || !payload.challenge) throw publicError('جلسة البصمة غير صالحة.', 401);
        return payload;
    } catch (error) {
        if (error.public) throw error;
        throw publicError('جلسة البصمة غير صالحة.', 401);
    }
}

function clearWebAuthnChallenge(res) {
    res.clearCookie('dar3a_webauthn', { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/auth/webauthn' });
}

function canonicalUsername(value) {
    const username = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw publicError('اسم المستخدم يجب أن يتكون من 3 إلى 64 حرفاً أو رقماً إنجليزياً.');
    return username;
}

function validPassword(value) {
    const password = String(value || '');
    if (password.length < 12 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        throw publicError('كلمة المرور يجب أن تكون 12 حرفاً على الأقل وتحتوي حروفاً وأرقاماً.');
    }
    return password;
}

function cleanText(value, field, { required = false, max = 500 } = {}) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw publicError(`${field} مطلوب.`);
    if (text.length > max) throw publicError(`${field} أطول من الحد المسموح.`);
    return text;
}

function cleanEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email) || email.length > 254) throw publicError('البريد الإلكتروني غير صحيح.');
    return email;
}

function cleanPhone(value) {
    const phone = String(value || '').trim();
    if (!/^[+0-9][0-9\s-]{6,24}$/u.test(phone)) throw publicError('رقم الهاتف غير صحيح.');
    return phone;
}

function cleanDomain(value) {
    let domain = String(value || '').trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
    if (!/^(localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/u.test(domain) || domain.length > 253) {
        throw publicError('النطاق غير صحيح. أدخل النطاق فقط مثل store.example.com.');
    }
    return domain;
}

function positiveNumber(value, field, { min = 0, max = 1000000000 } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw publicError(`${field} غير صحيح.`);
    return number;
}

function cleanProduct(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw publicError('بيانات المنتج غير صحيحة.');
    const id = cleanText(product.id, 'معرف المنتج', { required: true, max: 100 });
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw publicError('معرف المنتج غير صحيح.');
    const type = cleanText(product.type || 'movies', 'نوع المنتج', { required: true, max: 40 });
    const allowedTypes = ['movies', 'series', 'programs', 'pcgames', 'playstation', 'component'];
    if (!allowedTypes.includes(type)) throw publicError('نوع المنتج غير مدعوم.');
    const stock = positiveNumber(product.stock ?? 0, 'المخزون', { min: 0, max: 1000000 });
    if (!Number.isInteger(stock)) throw publicError('المخزون يجب أن يكون رقماً صحيحاً.');
    const componentType = product.component_type || product.componentType || null;
    if (componentType && !['cpu', 'motherboard', 'gpu', 'ram', 'storage', 'psu', 'case'].includes(componentType)) throw publicError('نوع قطعة الكمبيوتر غير صحيح.');
    let specs = product.specs || {};
    if (typeof specs !== 'object' || Array.isArray(specs) || JSON.stringify(specs).length > 10000) throw publicError('مواصفات المنتج غير صحيحة.');
    return {
        id,
        type,
        name: cleanText(product.name, 'اسم المنتج', { required: true, max: 160 }),
        price: positiveNumber(product.price, 'السعر'),
        brand: cleanText(product.brand, 'العلامة التجارية', { max: 100 }) || null,
        image: cleanText(product.image, 'رابط الصورة', { max: 2000 }) || null,
        description: cleanText(product.description, 'الوصف', { max: 3000 }) || null,
        specs,
        stock,
        component_type: componentType
    };
}

function publicSettings(settings) {
    const fields = ['name', 'tagline', 'currency', 'phone', 'whatsapp', 'address', 'hours', 'website', 'primaryColor', 'secondaryColor', 'logoIcon', 'mainLogo', 'favicon', 'bgAnimation', 'developerName', 'developerUrl', 'copyright', 'chatbotUrl'];
    return Object.fromEntries(fields.filter((field) => settings?.[field] !== undefined).map((field) => [field, settings[field]]));
}

function cleanSettings(settings) {
    const clean = publicSettings(settings || {});
    for (const field of ['name', 'tagline', 'currency', 'phone', 'whatsapp', 'address', 'hours', 'website', 'logoIcon', 'mainLogo', 'favicon', 'bgAnimation', 'developerName', 'developerUrl', 'copyright', 'chatbotUrl']) {
        if (clean[field] !== undefined) clean[field] = cleanText(clean[field], field, { max: field === 'mainLogo' || field === 'favicon' || field === 'website' || field === 'developerUrl' ? 2000 : 180 });
    }
    for (const field of ['primaryColor', 'secondaryColor']) {
        if (clean[field] !== undefined && clean[field] && !/^#[0-9a-fA-F]{6}$/.test(clean[field])) throw publicError('صيغة اللون غير صحيحة.');
    }
    if (clean.whatsapp) clean.whatsapp = clean.whatsapp.replace(/\D/g, '');
    for (const field of ['website', 'developerUrl', 'mainLogo', 'favicon', 'chatbotUrl']) {
        if (!clean[field]) continue;
        const value = clean[field];
        const isSafeRelativePath = /^(?:\.?\/)?[a-zA-Z0-9_./-]+(?:\?[a-zA-Z0-9_=&.-]+)?$/.test(value);
        const isSafeHttpsUrl = /^https:\/\/[a-zA-Z0-9.-]+(?:\/[^\s]*)?$/i.test(value);
        if (!isSafeRelativePath && !isSafeHttpsUrl) throw publicError('رابط الإعدادات يجب أن يكون HTTPS أو مساراً داخلياً آمناً.');
    }
    return clean;
}

function cleanItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw publicError('السلة فارغة أو تحتوي عناصر كثيرة.');
    const merged = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object') throw publicError('عنصر السلة غير صحيح.');
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw publicError('كمية المنتج غير صحيحة.');
        if (item.type === 'custom_build' && Array.isArray(item.components)) {
            for (const component of item.components) {
                const id = cleanText(component.id, 'معرف القطعة', { required: true, max: 100 });
                merged.set(id, (merged.get(id) || 0) + quantity);
            }
        } else {
            const id = cleanText(item.id, 'معرف المنتج', { required: true, max: 100 });
            merged.set(id, (merged.get(id) || 0) + quantity);
        }
    }
    if (merged.size > 30 || [...merged.values()].some((quantity) => quantity > 20)) throw publicError('كمية المنتجات غير صحيحة.');
    return [...merged].map(([id, quantity]) => ({ id, quantity }));
}

function signSession(user) {
    return jwt.sign({ sub: user.id, role: user.role, username: user.username }, JWT_SECRET, {
        algorithm: 'HS256', issuer: 'dar3a-store', audience: 'dar3a-admin', expiresIn: '8h'
    });
}

async function requireAuth(req, res, next) {
    try {
        const token = parseCookies(req.headers.cookie).dar3a_session;
        if (!token) throw publicError('تسجيل الدخول مطلوب.', 401);
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'dar3a-store', audience: 'dar3a-admin' });
        const user = await db.getUserById(payload.sub);
        if (!user || !user.is_active || user.role !== payload.role) throw publicError('الجلسة غير صالحة.', 401);
        req.user = db.withoutSecrets ? db.withoutSecrets(user) : (() => { const { password_hash, ...safe } = user; return safe; })();
        next();
    } catch (error) {
        if (error.public) return next(error);
        return next(publicError('الجلسة غير صالحة.', 401));
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) return next(publicError('ليس لديك الصلاحية المطلوبة.', 403));
        next();
    };
}

function activationKey() {
    return `DAR3A-${crypto.randomBytes(18).toString('hex').toUpperCase()}`;
}
function hashActivationKey(key) { return crypto.createHash('sha256').update(key).digest('hex'); }
function oneYearFrom(date = new Date()) {
    const result = new Date(date);
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    return result.toISOString();
}

app.get('/api/health', (req, res) => {
    res.status((db.configured || allowDemoMode) && JWT_SECRET?.length >= 32 ? 200 : 503).json({
        status: (db.configured || allowDemoMode) && JWT_SECRET?.length >= 32 ? 'ok' : 'configuration_required',
        database: db.configured ? 'supabase' : allowDemoMode ? 'demo' : 'not_configured',
        license: licenseRequired ? licenseCache.status : 'not_required',
        timestamp: new Date().toISOString()
    });
});

app.use('/api', ensureConfigured);

// Public storefront endpoints
app.get('/api/products', requireStoreLicense, async (req, res, next) => {
    try { res.json(await db.getProducts()); } catch (error) { next(error); }
});
app.get('/api/settings', requireStoreLicense, async (req, res, next) => {
    try { res.json(publicSettings(await db.getSettings() || {})); } catch (error) { next(error); }
});
app.post('/api/newsletter', requireStoreLicense, publicWriteLimiter, async (req, res, next) => {
    try { await db.addSubscriber(cleanEmail(req.body.email)); res.status(201).json({ success: true, message: 'تم الاشتراك بنجاح.' }); } catch (error) { next(error); }
});
app.post('/api/orders', requireStoreLicense, publicWriteLimiter, async (req, res, next) => {
    try {
        const order = await db.createOrder({
            customer_name: cleanText(req.body.customer_name, 'الاسم', { required: true, max: 120 }),
            customer_phone: cleanPhone(req.body.customer_phone),
            customer_address: cleanText(req.body.customer_address, 'العنوان', { max: 300 }) || null,
            notes: cleanText(req.body.notes, 'الملاحظات', { max: 1000 }) || null,
            payment_method: ['cash', 'bankak', 'fawry'].includes(req.body.payment_method) ? req.body.payment_method : 'cash',
            coupon: req.body.coupon ? cleanText(req.body.coupon, 'الكوبون', { max: 40 }).toUpperCase() : null,
            items: cleanItems(req.body.items)
        });
        res.status(201).json({ success: true, order });
    } catch (error) { next(error); }
});
app.post('/api/license/verify', publicWriteLimiter, async (req, res, next) => {
    try {
        const key = cleanText(req.body.activationKey, 'مفتاح التفعيل', { required: true, max: 100 });
        const result = await db.verifyActivation(key, cleanDomain(req.body.domain));
        res.status(result.valid ? 200 : 403).json(result);
    } catch (error) { next(error); }
});

// Authentication: username/password only. The resulting token remains in an HttpOnly cookie.
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
        const username = canonicalUsername(req.body.username);
        const password = String(req.body.password || '');
        const user = await db.getUserByUsername(username);
        const valid = user?.is_active && password && await bcrypt.compare(password, user.password_hash);
        if (!valid) throw publicError('اسم المستخدم أو كلمة المرور غير صحيحين.', 401);
        await db.updateUserLogin(user.id);
        res.cookie('dar3a_session', signSession(user), sessionCookieOptions());
        res.json({ success: true, user: db.withoutSecrets ? db.withoutSecrets(user) : { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
    } catch (error) { next(error); }
});
// WebAuthn platform authenticators use the device's biometric/PIN system. Only
// Developer accounts can register and use a biometric credential.
app.post('/api/auth/webauthn/register/options', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        const config = getWebAuthnConfig(req);
        const credentials = await db.listWebAuthnCredentials(req.user.id);
        const options = await generateRegistrationOptions({
            rpName: config.rpName,
            rpID: config.rpID,
            userName: req.user.username,
            userID: new TextEncoder().encode(req.user.id),
            userDisplayName: req.user.display_name || req.user.username,
            attestationType: 'none',
            timeout: 60000,
            excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports || [] })),
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                residentKey: 'required',
                userVerification: 'required'
            }
        });
        createWebAuthnChallenge(res, 'register', req.user.id, options.challenge);
        res.json(options);
    } catch (error) { next(error); }
});
app.post('/api/auth/webauthn/register/verify', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        const ceremony = readWebAuthnChallenge(req, 'register');
        clearWebAuthnChallenge(res);
        if (ceremony.userId !== req.user.id) throw publicError('جلسة البصمة لا تخص هذا الحساب.', 403);
        const config = getWebAuthnConfig(req);
        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: req.body.response,
                expectedChallenge: ceremony.challenge,
                expectedOrigin: config.expectedOrigin,
                expectedRPID: config.rpID,
                requireUserVerification: true
            });
        } catch (error) {
            throw publicError('تعذر التحقق من بصمة الجهاز.', 400);
        }
        if (!verification.verified || !verification.registrationInfo) throw publicError('تعذر التحقق من بصمة الجهاز.', 400);
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        const saved = await db.saveWebAuthnCredential({
            user_id: req.user.id,
            credential_id: credential.id,
            public_key: Buffer.from(credential.publicKey).toString('base64url'),
            counter: credential.counter,
            transports: Array.isArray(req.body.response?.response?.transports) ? req.body.response.response.transports : [],
            device_type: credentialDeviceType,
            backed_up: credentialBackedUp,
            name: cleanText(req.body.name || 'بصمة هذا الجهاز', 'اسم الجهاز', { max: 80 }) || 'بصمة هذا الجهاز'
        });
        res.status(201).json({ success: true, credential: saved });
    } catch (error) { next(error); }
});
app.post('/api/auth/webauthn/authenticate/options', authLimiter, async (req, res, next) => {
    try {
        const username = canonicalUsername(req.body.username);
        const user = await db.getUserByUsername(username);
        if (!user || !user.is_active || user.role !== 'developer') throw publicError('بيانات دخول البصمة غير متاحة لهذا الحساب.', 401);
        const config = getWebAuthnConfig(req);
        const credentials = await db.listWebAuthnCredentials(user.id);
        if (!credentials.length) throw publicError('لا توجد بصمة مسجلة لهذا الحساب. سجلها أولاً من لوحة المطور.', 401);
        const options = await generateAuthenticationOptions({
            rpID: config.rpID,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: credential.transports || [] }))
        });
        createWebAuthnChallenge(res, 'authenticate', user.id, options.challenge);
        res.json(options);
    } catch (error) { next(error); }
});
app.post('/api/auth/webauthn/authenticate/verify', authLimiter, async (req, res, next) => {
    try {
        const ceremony = readWebAuthnChallenge(req, 'authenticate');
        clearWebAuthnChallenge(res);
        const credentialId = cleanText(req.body.response?.id, 'معرف البصمة', { required: true, max: 2048 });
        const credential = await db.getWebAuthnCredential(credentialId);
        if (!credential || credential.user_id !== ceremony.userId) throw publicError('بصمة الجهاز غير معروفة.', 401);
        const user = await db.getUserById(ceremony.userId);
        if (!user || !user.is_active || user.role !== 'developer') throw publicError('الحساب غير متاح لدخول البصمة.', 401);
        const config = getWebAuthnConfig(req);
        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: req.body.response,
                expectedChallenge: ceremony.challenge,
                expectedOrigin: config.expectedOrigin,
                expectedRPID: config.rpID,
                credential: {
                    id: credential.credential_id,
                    publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64url')),
                    counter: Number(credential.counter),
                    transports: credential.transports || []
                },
                requireUserVerification: true
            });
        } catch (error) {
            throw publicError('تعذر التحقق من بصمة الجهاز.', 401);
        }
        if (!verification.verified) throw publicError('تعذر التحقق من بصمة الجهاز.', 401);
        await db.updateWebAuthnCredential(credential.credential_id, verification.authenticationInfo.newCounter);
        res.cookie('dar3a_session', signSession(user), sessionCookieOptions());
        res.json({ success: true, user: db.withoutSecrets ? db.withoutSecrets(user) : { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
    } catch (error) { next(error); }
});
app.get('/api/auth/webauthn/credentials', requireAuth, requireRole('developer'), async (req, res, next) => {
    try { res.json(await db.listWebAuthnCredentials(req.user.id)); } catch (error) { next(error); }
});
app.delete('/api/auth/webauthn/credentials/:credentialId', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        await db.deleteWebAuthnCredential(req.user.id, cleanText(req.params.credentialId, 'معرف البصمة', { required: true, max: 2048 }));
        res.json({ success: true });
    } catch (error) { next(error); }
});

app.post('/api/auth/change-password', requireAuth, async (req, res, next) => {
    try {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = validPassword(req.body.newPassword);
        const user = await db.getUserById(req.user.id);
        if (!user || !await bcrypt.compare(currentPassword, user.password_hash)) {
            throw publicError('كلمة المرور الحالية غير صحيحة.', 401);
        }
        if (await bcrypt.compare(newPassword, user.password_hash)) {
            throw publicError('اختر كلمة مرور جديدة مختلفة عن الحالية.');
        }
        await db.updateUser(req.user.id, { password_hash: await bcrypt.hash(newPassword, 12) });
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح.' });
    } catch (error) { next(error); }
});
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('dar3a_session', { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
    res.json({ success: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Developer dashboard and store administration
app.get('/api/dashboard', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { res.json(await db.getDashboardStats()); } catch (error) { next(error); }
});
app.post('/api/products', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try {
        if (!Array.isArray(req.body.products) || req.body.products.length > 1000) throw publicError('قائمة المنتجات غير صحيحة.');
        const products = req.body.products.map(cleanProduct);
        if (new Set(products.map((product) => product.id)).size !== products.length) throw publicError('معرفات المنتجات يجب أن تكون فريدة.');
        await db.replaceAllProducts(products);
        res.json({ success: true });
    } catch (error) { next(error); }
});
app.post('/api/settings', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try {
        const current = await db.getSettings() || {};
        await db.saveSettings({ ...current, ...cleanSettings(req.body) });
        res.json({ success: true });
    } catch (error) { next(error); }
});
app.get('/api/coupons', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { res.json(await db.getCoupons()); } catch (error) { next(error); }
});
app.post('/api/coupons', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try {
        const coupon = {
            code: cleanText(req.body.coupon?.code ?? req.body.code, 'الكود', { required: true, max: 40 }).toUpperCase(),
            type: ['percent', 'fixed'].includes(req.body.coupon?.type ?? req.body.type) ? (req.body.coupon?.type ?? req.body.type) : 'percent',
            discount: positiveNumber(req.body.coupon?.discount ?? req.body.discount, 'قيمة الخصم', { min: 0.01 }),
            min_order: positiveNumber(req.body.coupon?.min_order ?? req.body.coupon?.minOrder ?? req.body.min_order ?? 0, 'الحد الأدنى'),
            active: (req.body.coupon?.active ?? req.body.active) !== false,
            expires_at: req.body.coupon?.expires_at ?? req.body.expires_at ?? null
        };
        if (coupon.type === 'percent' && coupon.discount > 100) throw publicError('نسبة الخصم لا يمكن أن تتجاوز 100%.');
        res.status(201).json({ success: true, coupon: await db.addCoupon(coupon) });
    } catch (error) { next(error); }
});
app.delete('/api/coupons', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { await db.deleteCoupon(cleanText(req.body.couponCode, 'كود الكوبون', { required: true, max: 40 })); res.json({ success: true }); } catch (error) { next(error); }
});
app.get('/api/orders', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { res.json(await db.getOrders()); } catch (error) { next(error); }
});
app.patch('/api/orders/:id/status', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try {
        const status = cleanText(req.body.status, 'حالة الطلب', { required: true, max: 20 });
        if (!['new', 'confirmed', 'delivered', 'cancelled'].includes(status)) throw publicError('حالة الطلب غير صحيحة.');
        res.json({ success: true, order: await db.updateOrderStatus(req.params.id, status) });
    } catch (error) { next(error); }
});
app.get('/api/newsletter', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { res.json(await db.getSubscribers()); } catch (error) { next(error); }
});
app.delete('/api/newsletter', requireAuth, requireRole('developer', 'admin'), async (req, res, next) => {
    try { await db.deleteSubscriber(req.body.email === 'all' ? 'all' : cleanEmail(req.body.email)); res.json({ success: true }); } catch (error) { next(error); }
});
app.get('/api/users', requireAuth, requireRole('developer'), async (req, res, next) => {
    try { res.json(await db.listUsers()); } catch (error) { next(error); }
});
app.post('/api/users', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        const role = cleanText(req.body.role, 'الدور', { required: true, max: 20 });
        if (!['developer', 'admin'].includes(role)) throw publicError('الدور غير صحيح.');
        const password = validPassword(req.body.password);
        const user = await db.createUser({ username: canonicalUsername(req.body.username), display_name: cleanText(req.body.display_name, 'الاسم الظاهر', { required: true, max: 100 }), role, password_hash: await bcrypt.hash(password, 12) });
        res.status(201).json({ success: true, user });
    } catch (error) { next(error); }
});
app.patch('/api/users/:id', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        if (req.params.id === req.user.id && (req.body.is_active === false || (req.body.role && req.body.role !== 'developer'))) throw publicError('لا يمكنك تعطيل أو خفض صلاحيات حساب المطور الحالي.');
        const changes = {};
        if (req.body.display_name !== undefined) changes.display_name = cleanText(req.body.display_name, 'الاسم الظاهر', { required: true, max: 100 });
        if (req.body.is_active !== undefined) changes.is_active = Boolean(req.body.is_active);
        if (req.body.role !== undefined) {
            if (!['developer', 'admin'].includes(req.body.role)) throw publicError('الدور غير صحيح.');
            changes.role = req.body.role;
        }
        if (req.body.password !== undefined) changes.password_hash = await bcrypt.hash(validPassword(req.body.password), 12);
        if (!Object.keys(changes).length) throw publicError('لا توجد تعديلات للحفظ.');
        res.json({ success: true, user: await db.updateUser(req.params.id, changes) });
    } catch (error) { next(error); }
});

// Developer portal: annual subscriptions, activation and renewal tracking.
app.get('/api/developer/subscriptions', requireAuth, requireRole('developer'), async (req, res, next) => {
    try { res.json(await db.listSubscriptions()); } catch (error) { next(error); }
});
app.post('/api/developer/subscriptions', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        const subscription = await db.createSubscription({
            client_name: cleanText(req.body.client_name, 'اسم العميل', { required: true, max: 160 }),
            contact_name: cleanText(req.body.contact_name, 'اسم جهة الاتصال', { max: 160 }) || null,
            contact_email: req.body.contact_email ? cleanEmail(req.body.contact_email) : null,
            contact_phone: req.body.contact_phone ? cleanPhone(req.body.contact_phone) : null,
            domain: cleanDomain(req.body.domain),
            plan: 'annual', status: 'pending', notes: cleanText(req.body.notes, 'الملاحظات', { max: 2000 }) || null,
            starts_at: null, expires_at: null, activation_key_hash: null
        });
        await db.addSubscriptionEvent(subscription.id, 'created', req.user.id, { domain: subscription.domain });
        res.status(201).json({ success: true, subscription });
    } catch (error) { next(error); }
});
app.post('/api/developer/subscriptions/:id/action', requireAuth, requireRole('developer'), async (req, res, next) => {
    try {
        const action = cleanText(req.body.action, 'الإجراء', { required: true, max: 20 });
        const subscription = await db.getSubscription(req.params.id);
        if (!subscription) throw publicError('الاشتراك غير موجود.', 404);
        let changes;
        let key;
        if (action === 'activate') {
            key = activationKey();
            changes = { status: 'active', starts_at: new Date().toISOString(), expires_at: oneYearFrom(), activation_key_hash: hashActivationKey(key), activation_count: 0, last_activated_at: null };
        } else if (action === 'renew') {
            const base = subscription.expires_at && new Date(subscription.expires_at) > new Date() ? new Date(subscription.expires_at) : new Date();
            changes = { status: 'active', starts_at: subscription.starts_at || new Date().toISOString(), expires_at: oneYearFrom(base) };
            if (!subscription.activation_key_hash) { key = activationKey(); changes.activation_key_hash = hashActivationKey(key); }
        } else if (action === 'suspend') {
            changes = { status: 'suspended' };
        } else if (action === 'revoke') {
            changes = { status: 'revoked', activation_key_hash: null };
        } else {
            throw publicError('الإجراء غير مدعوم.');
        }
        const updated = await db.updateSubscription(subscription.id, changes);
        await db.addSubscriptionEvent(subscription.id, action, req.user.id, { status: updated.status });
        res.json({ success: true, subscription: updated, activationKey: key || undefined, message: key ? 'احفظ مفتاح التفعيل الآن؛ لن يظهر مرة أخرى.' : undefined });
    } catch (error) { next(error); }
});

app.use('/api', (req, res, next) => next(publicError('المسار غير موجود.', 404)));
app.use((error, req, res, next) => {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('API error:', error.message);
    res.status(status).json({ error: error.public ? error.message : 'حدث خطأ داخلي. حاول لاحقاً.' });
});

module.exports = app;
