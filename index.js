// index.js
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// تخزين مؤقت لأكواد التحقق (في production استخدم Redis)
const otpStore = new Map();
const sessionStore = new Map();

// تنظيف الجلسات المنتهية كل ساعة
setInterval(async () => {
    await db.cleanExpiredSessions();
    for (const [token, data] of sessionStore.entries()) {
        if (data.expires < Date.now()) sessionStore.delete(token);
    }
}, 60 * 60 * 1000);

// ==================== API Routes ====================

// -------------------- Health Check --------------------
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// -------------------- Products API --------------------
app.get('/api/products', async (req, res) => {
    try {
        const products = await db.getProducts();
        res.json(products);
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ error: 'products must be an array' });
        }
        await db.replaceAllProducts(products);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving products:', error);
        res.status(500).json({ error: error.message });
    }
});

// -------------------- Settings API --------------------
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await db.getSettings();
        if (!settings) {
            // إعدادات افتراضية
            settings = {
                name: 'Dar3a Store',
                tagline: 'أفلام • مسلسلات • برامج • ألعاب',
                currency: 'ج.س',
                phone: '0922265656',
                whatsapp: '0922265656',
                address: 'السودان - امدرمان',
                hours: 'يومياً 10 ص - 10 م',
                website: 'https://dar3a-store.vercel.app',
                primaryColor: '#e63946',
                secondaryColor: '#ff6b6b',
                logoIcon: 'fa-shield-halved',
                mainLogo: '',
                favicon: '',
                bgAnimation: 'particles',
                developerName: 'Mohamed Elnil',
                developerUrl: 'https://me-one-blue.vercel.app/about.html',
                copyright: '© 2026 Dar3a Store',
                chatbotUrl: 'chat-bot.html'
            };
        }
        res.json(settings);
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        await db.saveSettings(req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// -------------------- Coupons API --------------------
app.get('/api/coupons', async (req, res) => {
    try {
        const coupons = await db.getCoupons();
        res.json(coupons);
    } catch (error) {
        console.error('Error getting coupons:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/coupons', async (req, res) => {
    try {
        const { coupon } = req.body;
        await db.addCoupon(coupon);
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding coupon:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/coupons', async (req, res) => {
    try {
        const { couponCode } = req.body;
        await db.deleteCoupon(couponCode);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({ error: error.message });
    }
});

// -------------------- Orders API --------------------
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await db.getOrders();
        res.json(orders);
    } catch (error) {
        console.error('Error getting orders:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        await db.addOrder(order);
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding order:', error);
        res.status(500).json({ error: error.message });
    }
});

// -------------------- Newsletter API --------------------
app.get('/api/newsletter', async (req, res) => {
    try {
        const subscribers = await db.getSubscribers();
        res.json(subscribers);
    } catch (error) {
        console.error('Error getting subscribers:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/newsletter', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'بريد إلكتروني غير صحيح' });
        }
        const result = await db.addSubscriber(email);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Error adding subscriber:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/newsletter', async (req, res) => {
    try {
        const { email } = req.body;
        if (email === 'all') {
            await db.clearAllSubscribers();
        } else {
            await db.deleteSubscriber(email);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting subscriber:', error);
        res.status(500).json({ error: error.message });
    }
});

// -------------------- Admin Auth API --------------------
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

app.post('/api/auth/request', async (req, res) => {
    try {
        const { role, storeName } = req.body;
        const otp = generateOTP();
        const expiresIn = 300; // 5 دقائق
        const challengeToken = crypto.randomBytes(16).toString('hex');
        
        otpStore.set(challengeToken, {
            otp,
            expires: Date.now() + expiresIn * 1000,
            role: role || 'admin'
        });
        
        // إرسال OTP عبر تيليجرام
        const botToken = role === 'assistant' 
            ? process.env.TELEGRAM_ASSISTANT_TOKEN || process.env.ASSISTANT_BOT_TOKEN
            : process.env.TELEGRAM_BOT_TOKEN;
        const chatId = role === 'assistant'
            ? process.env.TELEGRAM_ASSISTANT_CHAT_ID || process.env.ASSISTANT_CHAT_ID
            : process.env.TELEGRAM_CHAT_ID;
        
        const message = `🔐 *كود التحقق لمتجر ${storeName || 'Dar3a Store'}*\n\n${role === 'admin' ? '👑 مدير' : '👥 مساعد'}\n\n📱 *الكود:* \`${otp}\`\n\n⏰ صالح لمدة 5 دقائق`;
        
        try {
            const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
            });
        } catch (telegramError) {
            console.error('Telegram error:', telegramError);
        }
        
        res.json({ ok: true, challengeToken, expiresIn });
    } catch (error) {
        console.error('Error requesting OTP:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { otp, challengeToken, role } = req.body;
        const stored = otpStore.get(challengeToken);
        
        if (!stored) {
            return res.status(401).json({ error: 'انتهت صلاحية الكود، اطلب كود جديد' });
        }
        
        if (stored.expires < Date.now()) {
            otpStore.delete(challengeToken);
            return res.status(401).json({ error: 'انتهت صلاحية الكود، اطلب كود جديد' });
        }
        
        if (stored.otp !== otp) {
            return res.status(401).json({ error: 'الكود غير صحيح' });
        }
        
        otpStore.delete(challengeToken);
        
        const sessionToken = generateSessionToken();
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 ساعة
        
        await db.saveAdminSession(sessionToken, expiresAt);
        sessionStore.set(sessionToken, { expires: expiresAt, role: stored.role });
        
        res.json({ ok: true, sessionToken, expiresAt });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const { sessionToken } = req.body;
        if (sessionToken) {
            await db.deleteAdminSession(sessionToken);
            sessionStore.delete(sessionToken);
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/verify-session', async (req, res) => {
    try {
        const sessionToken = req.headers['x-session-token'];
        if (!sessionToken) {
            return res.json({ valid: false });
        }
        
        const isValid = await db.verifyAdminSession(sessionToken);
        res.json({ valid: isValid });
    } catch (error) {
        console.error('Error verifying session:', error);
        res.json({ valid: false });
    }
});

// ==================== Export ====================
module.exports = app;
