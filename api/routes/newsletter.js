// routes/newsletter.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../admin-auth');

// GET جميع المشتركين (مدير فقط)
router.get('/', requireAdmin, async (req, res) => {
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
router.delete('/', requireAdmin, async (req, res) => {
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

module.exports = router;
