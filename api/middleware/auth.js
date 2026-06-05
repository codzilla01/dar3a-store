// middleware/auth.js
const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dvpHiueQCQAkzFqoNzfQLkGuEXNMJfRh';

function verifyAdmin(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }

    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'صلاحيات غير كافية' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
}

function verifyAssistant(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-session-token'];
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح به' });
    }

    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        
        if (decoded.role !== 'admin' && decoded.role !== 'assistant') {
            return res.status(403).json({ error: 'صلاحيات غير كافية' });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'توكن غير صالح' });
    }
}

module.exports = {
    verifyAdmin,
    verifyAssistant
};
