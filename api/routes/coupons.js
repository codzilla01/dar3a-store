// routes/coupons.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyAdmin } = require('../middleware/auth');

// GET جميع الكوبونات (مدير فقط)
router.get('/', verifyAdmin, async (req, res) => {
    try {
        const coupons = await db.getCoupons();
        res.json(coupons);
    } catch (error) {
        console.error('خطأ في جلب الكوبونات:', error);
        res.status(500).json({ error: 'فشل جلب الكوبونات' });
    }
});

// POST إضافة كوبون جديد (مدير فقط)
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const coupon = req.body;
        if (!coupon.code || !coupon.discount) {
            return res.status(400).json({ error: 'الكود والخصم مطلوبان' });
        }
        
        // التحقق من وجود الكوبون مسبقاً
        const existing = await db.getCouponByCode(coupon.code);
        if (existing) {
            return res.status(400).json({ error: 'الكوبون موجود بالفعل' });
        }
        
        const result = await db.addCoupon(coupon);
        if (!result) {
            return res.status(500).json({ error: 'فشل إضافة الكوبون' });
        }
        
        res.json({ success: true, coupon: result });
    } catch (error) {
        console.error('خطأ في إضافة الكوبون:', error);
        res.status(500).json({ error: 'فشل إضافة الكوبون' });
    }
});

// DELETE حذف كوبون (مدير فقط)
router.delete('/', verifyAdmin, async (req, res) => {
    try {
        const { couponCode } = req.body;
        if (!couponCode) {
            return res.status(400).json({ error: 'كود الكوبون مطلوب' });
        }
        
        const success = await db.deleteCoupon(couponCode);
        if (!success) {
            return res.status(404).json({ error: 'الكوبون غير موجود' });
        }
        
        res.json({ success: true, message: 'تم حذف الكوبون' });
    } catch (error) {
        console.error('خطأ في حذف الكوبون:', error);
        res.status(500).json({ error: 'فشل حذف الكوبون' });
    }
});

// POST التحقق من صحة كوبون (عام)
router.post('/verify', async (req, res) => {
    try {
        const { code, total } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'كود الكوبون مطلوب' });
        }
        
        const coupon = await db.getCouponByCode(code);
        if (!coupon) {
            return res.json({ valid: false, error: 'الكوبون غير موجود' });
        }
        
        if (!coupon.active) {
            return res.json({ valid: false, error: 'الكوبون غير فعال' });
        }
        
        if (coupon.minOrder && total && total < coupon.minOrder) {
            return res.json({ 
                valid: false, 
                error: `الحد الأدنى للطلب ${coupon.minOrder}` 
            });
        }
        
        let discount = 0;
        if (coupon.type === 'percent') {
            discount = (total * coupon.discount) / 100;
        } else {
            discount = coupon.discount;
        }
        
        res.json({ 
            valid: true, 
            coupon,
            discount: Math.min(discount, total),
            finalTotal: total - Math.min(discount, total)
        });
    } catch (error) {
        console.error('خطأ في التحقق من الكوبون:', error);
        res.status(500).json({ error: 'فشل التحقق من الكوبون' });
    }
});

module.exports = router;