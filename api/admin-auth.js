// admin-auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// المفتاح السري الخاص بك
const ADMIN_JWT_SECRET = 'dvpHiueQCQAkzFqoNzfQLkGuEXNMJfRh';

// ============================================
// دوال المصادقة الأساسية
// ============================================

function generateToken(payload) {
    const tokenPayload = {
        ...payload,
        exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
    };
    return jwt.sign(tokenPayload, ADMIN_JWT_SECRET);
}

function verifyToken(token) {
    try {
        return jwt.verify(token, ADMIN_JWT_SECRET);
    } catch (error) {
        return null;
    }
}

function verifyAdmin(token) {
    const decoded = verifyToken(token);
    if (!decoded) return false;
    return decoded.role === 'admin';
}

function verifyAssistant(token) {
    const decoded = verifyToken(token);
    if (!decoded) return false;
    return decoded.role === 'assistant' || decoded.role === 'admin';
}

function getUserFromToken(token) {
    return verifyToken(token);
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateChallengeToken(otpHash, expiresIn = 300) {
    const payload = {
        h: otpHash,
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        attempts: 0,
        n: crypto.randomBytes(8).toString('hex')
    };
    return jwt.sign(payload, ADMIN_JWT_SECRET);
}

function verifyChallengeToken(token) {
    try {
        return jwt.verify(token, ADMIN_JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// ============================================
// وسيط للتحقق من المدير في طلبات API
// ============================================

function requireAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - التوكن مطلوب' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
    
    if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'صلاحيات غير كافية - تحتاج دور مدير' });
    }
    
    req.user = decoded;
    next();
}

function requireAssistant(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به - التوكن مطلوب' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
    
    if (decoded.role !== 'admin' && decoded.role !== 'assistant') {
        return res.status(403).json({ error: 'صلاحيات غير كافية - تحتاج دور مساعد أو مدير' });
    }
    
    req.user = decoded;
    next();
}

// ============================================
// تصدير الدوال
// ============================================

module.exports = {
    generateToken,
    verifyToken,
    verifyAdmin,
    verifyAssistant,
    getUserFromToken,
    requireAdmin,
    requireAssistant,
    generateChallengeToken,
    verifyChallengeToken,
    hashOtp,
    ADMIN_JWT_SECRET
};
