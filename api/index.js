const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Mount route modules
app.use('/api/products', require('./routes/products'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/orders', require('./routes/orders'));

// Support both URL action parameter or body action for admin auth
app.use('/api/auth', require('./admin-auth'));

// Serve static files when running locally
app.use(express.static(path.join(__dirname, '..')));

// Fallback to index.html for SPA routing if needed
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

// Listen on a port when run directly (local development)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running locally on http://localhost:${PORT}`);
    });
}

module.exports = app;
