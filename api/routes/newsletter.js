// routes/newsletter.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyAdmin } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// GET جميع المشتركين (مدير فقط)
router.get('/', verifyAdmin, async (req, res) => {
    try {
        const subscribers = await db.getSubscribers();
        res.json(subscribers);
    } catch (error) {
        console.error('خطأ في جلب المشتركين:', error);
        res.status(500).json({ error: 'فشل جلب المشتركين' });
    }
});

// POST إضافة مشترك جديد
router.post('/', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
        }
        
        const result = await db.addSubscriber(email);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        
        // إرسال بريد ترحيبي (اختياري)
        try {
            await sendWelcomeEmail(email);
        } catch (emailError) {
            console.warn('فشل إرسال البريد الترحيبي:', emailError.message);
        }
        
        res.json({ 
            success: true, 
            message: result.alreadyExists ? 'البريد موجود بالفعل' : 'تم الاشتراك بنجاح',
            alreadyExists: result.alreadyExists
        });
    } catch (error) {
        console.error('خطأ في إضافة المشترك:', error);
        res.status(500).json({ error: 'فشل إضافة المشترك' });
    }
});

// DELETE حذف مشترك (مدير فقط)
router.delete('/', verifyAdmin, async (req, res) => {
    try {
        const { email } = req.body;
        if (email === 'all') {
            await db.clearAllSubscribers();
            return res.json({ success: true, message: 'تم حذف جميع المشتركين' });
        }
        
        if (!email) {
            return res.status(400).json({ error: 'البريد مطلوب' });
        }
        
        const success = await db.deleteSubscriber(email);
        if (!success) {
            return res.status(404).json({ error: 'المشترك غير موجود' });
        }
        
        res.json({ success: true, message: 'تم حذف المشترك' });
    } catch (error) {
        console.error('خطأ في حذف المشترك:', error);
        res.status(500).json({ error: 'فشل حذف المشترك' });
    }
});

// دالة إرسال البريد الترحيبي
async function sendWelcomeEmail(email) {
    // تكوين الناقل
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    await transporter.sendMail({
        from: `"Dar3a Store" <${process.env.EMAIL_USER || 'noreply@dar3a.store'}>`,
        to: email,
        subject: '🎉 مرحباً بك في Dar3a Store',
        html: `
            <div style="font-family: 'Tajawal', sans-serif; padding: 20px; background: #f8fafc;">
                <h1 style="color: #e63946;">🎉 مرحباً بك في Dar3a Store!</h1>
                <p>شكراً لاشتراكك في النشرة البريدية.</p>
                <p>ستصلك أحدث العروض والمنتجات الجديدة أولاً بأول.</p>
                <a href="https://dar3a-store.vercel.app" style="background: #e63946; color: white; padding: 10px 20px; border-radius: 25px; text-decoration: none;">
                    زيارة المتجر
                </a>
            </div>
        `
    });
}

module.exports = router;