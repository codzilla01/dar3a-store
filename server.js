// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const app = require('./index');

dotenv.config();

const PORT = process.env.PORT || 3000;

// إعداد CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// تشغيل الخادم
app.listen(PORT, () => {
    console.log('🚀 متجر Dar3a Store يعمل على المنفذ ' + PORT);
    console.log('🌐 http://localhost:' + PORT);
    console.log('✅ المفتاح السري موجود وطوله:', process.env.ADMIN_JWT_SECRET ? process.env.ADMIN_JWT_SECRET.length : 'غير موجود');
});
