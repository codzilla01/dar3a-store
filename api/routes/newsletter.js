const express = require('express');
const authenticate = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const subscribers = await db.getSubscribers();
    res.json(subscribers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    await db.addSubscriber(email);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add subscriber' });
  }
});

router.delete('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { email } = req.body;
  try {
    if (email === 'all') {
      await db.clearAllSubscribers();
    } else {
      await db.deleteSubscriber(email);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

module.exports = router;