// index.js
const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));

// استيراد المسارات
const productsRoutes = require('./routes/products');
const settingsRoutes = require('./routes/settings');
const newsletterRoutes = require('./routes/newsletter');
const uploadRoutes = require('./routes/upload');
const couponsRoutes = require('./routes/coupons');
const ordersRoutes = require('./routes/orders');

// استخدام المسارات
app.use('/api/products', productsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/orders', ordersRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = app;
