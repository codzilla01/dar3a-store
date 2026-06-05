// routes/orders.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyAdmin } = require('../middleware/auth');

// GET جميع الطلبات (مدير فقط)
router.get('/', verifyAdmin, async (req, res) => {
    try {
        const orders = await db.getOrders();
        res.json(orders);
    } catch (error) {
        console.error('خطأ في جلب الطلبات:', error);
        res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
});

// POST إضافة طلب جديد
router.post('/', async (req, res) => {
    try {
        const order = req.body;
        if (!order.items || !order.items.length) {
            return res.status(400).json({ error: 'الطلب فارغ' });
        }
        
        const result = await db.addOrder(order);
        if (!result) {
            return res.status(500).json({ error: 'فشل إضافة الطلب' });
        }
        
        res.json({ success: true, order: result });
    } catch (error) {
        console.error('خطأ في إضافة الطلب:', error);
        res.status(500).json({ error: 'فشل إضافة الطلب' });
    }
});

// DELETE حذف طلب (مدير فقط)
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const success = await db.deleteOrder(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'الطلب غير موجود' });
        }
        res.json({ success: true, message: 'تم حذف الطلب' });
    } catch (error) {
        console.error('خطأ في حذف الطلب:', error);
        res.status(500).json({ error: 'فشل حذف الطلب' });
    }
});

// DELETE مسح جميع الطلبات (مدير فقط)
router.delete('/clear/all', verifyAdmin, async (req, res) => {
    try {
        await db.clearAllOrders();
        res.json({ success: true, message: 'تم مسح جميع الطلبات' });
    } catch (error) {
        console.error('خطأ في مسح الطلبات:', error);
        res.status(500).json({ error: 'فشل مسح الطلبات' });
    }
});

module.exports = router;