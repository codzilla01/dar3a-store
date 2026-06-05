// middleware/auth.js
const jwt = require('jsonwebtoken');

function getSecret() {
    const s = process.env.ADMIN_JWT_SECRET;
    if (!s || s.length < 16) {
        throw new Error('ADMIN_JWT_SECRET must be set (min 16 chars)');
    }
    return s;
}

// التحقق من توكن المدير
function verifyAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }

    try {
        const secret = getSecret();
        const decoded = jwt.verify(token, secret);
        
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'صلاحيات غير كافية' });
        }
        
        if (decoded.exp && Date.now() > decoded.exp) {
            return res.status(401).json({ error: 'انتهت الجلسة' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('خطأ في التحقق من التوكن:', error);
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
}

// التحقق من توكن المساعد
function verifyAssistant(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }

    try {
        const secret = getSecret();
        const decoded = jwt.verify(token, secret);
        
        if (decoded.role !== 'admin' && decoded.role !== 'assistant') {
            return res.status(403).json({ error: 'صلاحيات غير كافية' });
        }
        
        if (decoded.exp && Date.now() > decoded.exp) {
            return res.status(401).json({ error: 'انتهت الجلسة' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('خطأ في التحقق من التوكن:', error);
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
}

module.exports = {
    verifyAdmin,
    verifyAssistant
};