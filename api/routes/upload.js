const express = require('express');
const multer = require('multer');
const authenticate = require('../middleware/auth');
const supabase = require('../supabase-client');
const crypto = require('crypto');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/', authenticate, upload.single('image'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileExt = req.file.originalname.split('.').pop();
  const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });
  
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Upload failed' });
  }
  
  const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
  
  res.json({ url: publicUrl });
});

module.exports = router;