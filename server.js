// server.js — local production-like server
require('dotenv').config();

const path = require('path');
const app = require('./index');

const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

app.use(require('express').static(publicDir, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    index: 'index.html'
}));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'المسار غير موجود.' });
    res.status(404).sendFile(path.join(publicDir, '404.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dar3a Store is listening on port ${PORT}`);
});
