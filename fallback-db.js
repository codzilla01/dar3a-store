// fallback-db.js
// وضع عرض محلي فقط. لا يتم اختياره إلا عند ALLOW_DEMO_MODE=true.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const demoUsername = String(process.env.DEMO_DEVELOPER_USERNAME || 'demo-admin').trim().toLowerCase();
const demoPassword = process.env.DEMO_DEVELOPER_PASSWORD || 'ChangeThisDemoPassword123!';

const store = {
    products: [
        { id: 'demo_movie_1', type: 'movies', name: 'فيلم تجريبي مرخّص', price: 5000, brand: 'Demo', image: 'images/Fast & Furious 9.jpg', description: 'بيانات عرض محلية فقط.', specs: {}, stock: 25, created_at: now(), updated_at: now() },
        { id: 'demo_game_1', type: 'pcgames', name: 'لعبة تجريبية مرخّصة', price: 12000, brand: 'Demo', image: 'images/games.png', description: 'بيانات عرض محلية فقط.', specs: {}, stock: 20, created_at: now(), updated_at: now() },
        { id: 'demo_cpu_1', type: 'component', component_type: 'cpu', name: 'Demo CPU', price: 25000, brand: 'Demo', image: '', description: 'قطعة تجميع تجريبية.', specs: {}, stock: 10, created_at: now(), updated_at: now() }
    ],
    settings: {
        name: 'Dar3a Store', tagline: 'أفلام • مسلسلات • برامج • ألعاب', currency: 'ج.س',
        phone: '0922265656', whatsapp: '249922265656', address: 'السودان - أمدرمان',
        hours: 'يومياً 10 ص - 10 م', website: '', primaryColor: '#e63946', secondaryColor: '#ff6b6b',
        logoIcon: 'fa-shield-halved', mainLogo: '', favicon: '', bgAnimation: 'particles',
        developerName: 'Dar3a Developer', developerUrl: 'developer.html', copyright: '© 2026 Dar3a Store', chatbotUrl: 'chat-bot.html'
    },
    coupons: [{ code: 'DAR3A10', type: 'percent', discount: 10, min_order: 0, active: true, created_at: now() }],
    orders: [],
    subscribers: [],
    users: [{ id: uid(), username: demoUsername, display_name: 'مطور العرض', role: 'developer', password_hash: bcrypt.hashSync(demoPassword, 12), is_active: true, created_at: now(), updated_at: now(), last_login_at: null }],
    webauthnCredentials: [],
    subscriptions: [],
    events: []
};

const copy = (value) => JSON.parse(JSON.stringify(value));
const safeUser = (user) => { const { password_hash, ...safe } = user; return copy(safe); };

function getProduct(id) { return store.products.find((product) => product.id === id); }

module.exports = {
    configured: false,
    demoMode: true,
    async getProducts() { return copy(store.products); },
    async replaceAllProducts(products) {
        store.products = products.map((product) => ({ ...copy(product), updated_at: now(), created_at: product.created_at || now() }));
        return true;
    },
    async getSettings() { return copy(store.settings); },
    async saveSettings(settings) { store.settings = { ...store.settings, ...copy(settings) }; return true; },
    async getCoupons() { return copy(store.coupons); },
    async addCoupon(coupon) {
        const code = String(coupon.code).trim().toUpperCase();
        if (store.coupons.some((item) => item.code === code)) throw new Error('الكوبون موجود بالفعل');
        const item = { code, type: coupon.type, discount: coupon.discount, min_order: coupon.min_order ?? coupon.minOrder ?? 0, active: coupon.active !== false, expires_at: coupon.expires_at || null, created_at: now() };
        store.coupons.push(item); return copy(item);
    },
    async deleteCoupon(code) { store.coupons = store.coupons.filter((item) => item.code !== String(code).toUpperCase()); return true; },
    async createOrder(order) {
        let subtotal = 0;
        const items = [];
        for (const requested of order.items) {
            const product = getProduct(requested.id);
            const quantity = Number(requested.quantity);
            if (!product || !Number.isInteger(quantity) || quantity < 1 || product.stock < quantity) throw new Error('يوجد منتج غير متاح أو كمية غير صحيحة');
            subtotal += Number(product.price) * quantity;
            product.stock -= quantity;
            product.updated_at = now();
            items.push({ id: product.id, name: product.name, price: Number(product.price), quantity });
        }
        let discount = 0;
        let coupon = null;
        if (order.coupon) {
            coupon = store.coupons.find((item) => item.code === String(order.coupon).toUpperCase() && item.active);
            if (!coupon || (coupon.expires_at && new Date(coupon.expires_at) < new Date()) || subtotal < Number(coupon.min_order || 0)) throw new Error('الكوبون غير صالح');
            discount = coupon.type === 'percent' ? subtotal * Number(coupon.discount) / 100 : Number(coupon.discount);
            discount = Math.min(discount, subtotal);
        }
        const record = { id: uid(), customer_name: order.customer_name, customer_phone: order.customer_phone, customer_address: order.customer_address || null, notes: order.notes || null, payment_method: order.payment_method, items, subtotal, discount, total: subtotal - discount, coupon: coupon?.code || null, status: 'new', date: now(), created_at: now(), updated_at: now() };
        store.orders.push(record);
        return copy(record);
    },
    async getOrders() { return copy(store.orders).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async updateOrderStatus(id, status) { const item = store.orders.find((order) => order.id === id); if (!item) throw new Error('الطلب غير موجود'); item.status = status; item.updated_at = now(); return copy(item); },
    async getSubscribers() { return copy(store.subscribers); },
    async addSubscriber(email) { if (!store.subscribers.some((item) => item.email === email)) store.subscribers.push({ email, created_at: now() }); return { success: true }; },
    async deleteSubscriber(email) { store.subscribers = email === 'all' ? [] : store.subscribers.filter((item) => item.email !== email); return true; },
    async getUserByUsername(username) { const item = store.users.find((user) => user.username === username); return item ? copy(item) : null; },
    async getUserById(id) { const item = store.users.find((user) => user.id === id); return item ? copy(item) : null; },
    async updateUserLogin(id) { const item = store.users.find((user) => user.id === id); if (item) item.last_login_at = now(); },
    async listUsers() { return store.users.map(safeUser); },
    async createUser(user) { const item = { id: uid(), ...copy(user), is_active: true, created_at: now(), updated_at: now(), last_login_at: null }; store.users.push(item); return safeUser(item); },
    async updateUser(id, changes) { const item = store.users.find((user) => user.id === id); if (!item) throw new Error('المستخدم غير موجود'); Object.assign(item, copy(changes), { updated_at: now() }); return safeUser(item); },
    async listWebAuthnCredentials(userId) { return copy(store.webauthnCredentials.filter((credential) => credential.user_id === userId).map(({ public_key, counter, user_id, ...safe }) => safe)); },
    async getWebAuthnCredential(credentialId) { const credential = store.webauthnCredentials.find((item) => item.credential_id === credentialId); return credential ? copy(credential) : null; },
    async saveWebAuthnCredential(credential) { if (store.webauthnCredentials.some((item) => item.credential_id === credential.credential_id)) throw new Error('مفتاح البصمة مسجل بالفعل'); const item = { ...copy(credential), created_at: now(), last_used_at: null }; store.webauthnCredentials.push(item); const { public_key, counter, user_id, ...safe } = item; return copy(safe); },
    async updateWebAuthnCredential(credentialId, counter) { const credential = store.webauthnCredentials.find((item) => item.credential_id === credentialId); if (!credential) throw new Error('مفتاح البصمة غير موجود'); credential.counter = counter; credential.last_used_at = now(); },
    async deleteWebAuthnCredential(userId, credentialId) { store.webauthnCredentials = store.webauthnCredentials.filter((item) => !(item.user_id === userId && item.credential_id === credentialId)); return true; },
    async getDashboardStats() { return { products: store.products.length, orders: store.orders.length, subscribers: store.subscribers.length, subscriptions: store.subscribers.length, recentOrders: copy(store.orders.slice(-5).reverse()) }; },
    async listSubscriptions() { return copy(store.subscriptions).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async createSubscription(subscription) { const item = { id: uid(), activation_count: 0, last_activated_at: null, created_at: now(), updated_at: now(), ...copy(subscription) }; store.subscriptions.push(item); return copy(item); },
    async getSubscription(id) { const item = store.subscriptions.find((subscription) => subscription.id === id); return item ? copy(item) : null; },
    async updateSubscription(id, changes) { const item = store.subscriptions.find((subscription) => subscription.id === id); if (!item) throw new Error('الاشتراك غير موجود'); Object.assign(item, copy(changes), { updated_at: now() }); return copy(item); },
    async verifyActivation(activationKey, domain) { const hash = crypto.createHash('sha256').update(activationKey).digest('hex'); const item = store.subscriptions.find((subscription) => subscription.activation_key_hash === hash && subscription.domain === domain); if (!item) return { valid: false, status: 'not_found' }; const expired = item.expires_at && new Date(item.expires_at) < new Date(); const valid = item.status === 'active' && !expired; if (valid) { item.last_activated_at = now(); item.activation_count += 1; } return { valid, status: expired ? 'expired' : item.status, expires_at: item.expires_at, client_name: item.client_name }; },
    async addSubscriptionEvent(subscriptionId, action, actorId, metadata = {}) { store.events.push({ id: uid(), subscription_id: subscriptionId, action, actor_id: actorId, metadata: copy(metadata), created_at: now() }); }
};
