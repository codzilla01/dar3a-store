// routes/settings.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../admin-auth');

// GET إعدادات المتجر (عام)
router.get('/', async (req, res) => {
    try {
        const settings = await db.getSettings();
        if (!settings) {
            return res.json({
                name: 'Dar3a Store',
                currency: 'ج.س',
                whatsapp: '0922265656',
                primaryColor: '#e63946'
            });
        }
        res.json(settings);
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error);
        res.status(500).json({ error: 'فشل جلب الإعدادات' });
    }
});

// POST حفظ الإعدادات (مدير فقط)
router.post('/', requireAdmin, async (req, res) => {
    try {
        const settings = req.body;
        const success = await db.saveSettings(settings);
        if (!success) {
            return res.status(500).json({ error: 'فشل حفظ الإعدادات' });
        }
        res.json({ success: true, message: 'تم حفظ الإعدادات' });
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        res.status(500).json({ error: 'فشل حفظ الإعدادات' });
    }
});

module.exports = router;
