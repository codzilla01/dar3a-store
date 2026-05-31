const express = require('express');
const authenticate = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    let settings = await db.getSettings();
    if (!settings) {
      // إعدادات افتراضية
      settings = {
        name: 'Dar3a Store',
        tagline: 'أفلام • مسلسلات • برامج • ألعاب',
        currency: 'ج.س',
        phone: '0922265656',
        whatsapp: '0922265656',
        address: 'السودان - امدرمان',
        hours: 'يومياً 10 ص - 10 م',
        website: 'https://dar3a-store.vercel.app',
        primaryColor: '#e63946',
        secondaryColor: '#ff6b6b',
        logoIcon: 'fa-shield-halved',
        mainLogo: '',
        favicon: '',
        bgAnimation: 'particles',
        developerName: 'Mohamed Elnil',
        developerUrl: 'https://me-one-blue.vercel.app/about.html',
        copyright: '© 2026 Dar3a Store',
        chatbotUrl: 'chat-bot.html'
      };
      await db.saveSettings(settings);
    }
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  try {
    await db.saveSettings(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;