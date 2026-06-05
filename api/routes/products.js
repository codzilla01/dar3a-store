// routes/products.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../admin-auth');

// GET جميع المنتجات (عام)
router.get('/', async (req, res) => {
    try {
        const products = await db.getProducts();
        res.json(products);
    } catch (error) {
        console.error('خطأ في جلب المنتجات:', error);
        res.status(500).json({ error: 'فشل جلب المنتجات' });
    }
});

// GET منتج واحد
router.get('/:id', async (req, res) => {
    try {
        const product = await db.getProductById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        res.json(product);
    } catch (error) {
        console.error('خطأ في جلب المنتج:', error);
        res.status(500).json({ error: 'فشل جلب المنتج' });
    }
});

// POST حفظ جميع المنتجات (مدير فقط)
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { products } = req.body;
        if (!Array.isArray(products)) {
            return res.status(400).json({ error: 'بيانات غير صالحة' });
        }
        await db.replaceAllProducts(products);
        res.json({ success: true, message: 'تم حفظ المنتجات' });
    } catch (error) {
        console.error('خطأ في حفظ المنتجات:', error);
        res.status(500).json({ error: 'فشل حفظ المنتجات' });
    }
});

// POST إضافة منتج (مدير فقط)
router.post('/add', requireAdmin, async (req, res) => {
    try {
        const product = req.body;
        if (!product.name || !product.price) {
            return res.status(400).json({ error: 'الاسم والسعر مطلوبان' });
        }
        const result = await db.addProduct(product);
        if (!result) {
            return res.status(500).json({ error: 'فشل إضافة المنتج' });
        }
        res.json({ success: true, product: result });
    } catch (error) {
        console.error('خطأ في إضافة المنتج:', error);
        res.status(500).json({ error: 'فشل إضافة المنتج' });
    }
});

// PUT تحديث منتج (مدير فقط)
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const product = req.body;
        const result = await db.updateProduct(req.params.id, product);
        if (!result) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        res.json({ success: true, product: result });
    } catch (error) {
        console.error('خطأ في تحديث المنتج:', error);
        res.status(500).json({ error: 'فشل تحديث المنتج' });
    }
});

// DELETE حذف منتج (مدير فقط)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const success = await db.deleteProduct(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }
        res.json({ success: true, message: 'تم حذف المنتج' });
    } catch (error) {
        console.error('خطأ في حذف المنتج:', error);
        res.status(500).json({ error: 'فشل حذف المنتج' });
    }
});

module.exports = router;
