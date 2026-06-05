// routes/upload.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyAdmin } = require('../middleware/auth');

// تخزين الصور في الذاكرة (للتحويل إلى Base64)
const storage = multer.memoryStorage();

// فلتر الصور
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: fileFilter
});

// POST رفع صورة واحدة (مدير فقط)
router.post('/', verifyAdmin, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع صورة' });
        }

        // تحويل الصورة إلى Base64
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        
        res.json({
            success: true,
            url: base64Image,
            message: 'تم رفع الصورة بنجاح'
        });
    } catch (error) {
        console.error('خطأ في رفع الصورة:', error);
        res.status(500).json({ error: 'فشل رفع الصورة' });
    }
});

// POST رفع صورة من رابط (مدير فقط)
router.post('/url', verifyAdmin, (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'الرابط مطلوب' });
        }
        
        // التحقق من أن الرابط صالح
        const isValidUrl = url.startsWith('http') || url.startsWith('data:image');
        if (!isValidUrl) {
            return res.status(400).json({ error: 'رابط غير صالح' });
        }
        
        res.json({
            success: true,
            url: url,
            message: 'تم حفظ الرابط'
        });
    } catch (error) {
        console.error('خطأ في حفظ رابط الصورة:', error);
        res.status(500).json({ error: 'فشل حفظ الرابط' });
    }
});

module.exports = router;