// fallback-db.js — قاعدة بيانات داخلية للعرض التجريبي (Demo Mode)
// تُستخدم تلقائياً عندما لا تكون متغيرات Supabase مهيأة،
// حتى يعمل المتجر فوراً بعد `npm install && npm start` بدون أي إعداد.
// البيانات تُحفظ في الذاكرة فقط وتُ reset عند إعادة تشغيل الخادم.

const now = () => new Date().toISOString();
const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ==================== بيانات المنتجات التجريبية ====================
// كتالوج عرض احترافي — يظهر فوراً في وضع Demo بدون Supabase
const SEED_PRODUCTS = [
    // 🎬 أفلام
    {
        id: 'seed_movie_1', type: 'movies', name: 'Fast & Furious 9', price: 2500,
        brand: 'Universal', image: 'images/Fast & Furious 9.jpg',
        description: 'نسخة HD كاملة بجودة ممتازة — فيلم الأكشن والإثارة الشهير مع ترجمة احترافية.',
        specs: { 'الجودة': '1080p', 'اللغة': 'عربي/إنجليزي', 'الحجم': '2.1 GB' },
        stock: 99, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_movie_2', type: 'movies', name: 'Oppenheimer', price: 3000,
        brand: 'Universal', image: 'images/Banner2.png',
        description: 'الفيلم الحائز على الأوسكار — جودة سينمائية مع ترجمة عربية مراجَعة.',
        specs: { 'الجودة': '1080p', 'الترجمة': 'عربي', 'المدة': '180 دقيقة' },
        stock: 99, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_movie_3', type: 'movies', name: 'باقة أفلام الأكشن (5 أفلام)', price: 9000,
        brand: 'Dar3a Films', image: 'images/مثال.jpeg',
        description: 'وفّر أكثر مع باقة 5 أفلام أكشن مختارة بعناية بجودة عالية.',
        specs: { 'العدد': '5 أفلام', 'الجودة': '1080p', 'التوفير': '25%' },
        stock: 40, created_at: now(), updated_at: now()
    },
    // 📺 مسلسلات
    {
        id: 'seed_series_1', type: 'series', name: 'مسلسل الموسم الكامل', price: 4500,
        brand: 'Dar3a Series', image: 'images/games.png',
        description: 'الموسم الكامل بجودة ممتازة وترجمة احترافية — حلقات مدمجة.',
        specs: { 'الحلقات': '12', 'الجودة': '1080p', 'الصيغة': 'MP4' },
        stock: 99, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_series_2', type: 'series', name: 'باقة مسلسلات رمضان', price: 12000,
        brand: 'Dar3a Series', image: 'images/Banner.png',
        description: 'أشهر مسلسلات الموسم في باقة واحدة — متابعة ممتعة طوال الشهر.',
        specs: { 'المسلسلات': '3', 'الجودة': 'HD', 'التوفير': '30%' },
        stock: 25, created_at: now(), updated_at: now()
    },
    // 💻 برامج هندسية
    {
        id: 'seed_soft_1', type: 'programs', name: 'AutoCAD 2026', price: 15000,
        brand: 'Autodesk', image: 'images/color.png',
        description: 'برنامج التصميم الهندسي الأشهر في العالم — تفعيل كامل مع دعم فني.',
        specs: { 'النسخة': '2026', 'النظام': 'Windows 10/11', 'المدة': 'دائم' },
        stock: 50, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_soft_2', type: 'programs', name: 'Adobe Photoshop 2026', price: 12000,
        brand: 'Adobe', image: 'images/image-removebg-preview.png',
        description: 'برنامج تعديل الصور الاحترافي — أحدث إصدار بأدوات الذكاء الاصطناعي.',
        specs: { 'النسخة': '2026', 'النظام': 'Windows', 'الدعم': 'سنة' },
        stock: 50, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_soft_3', type: 'programs', name: 'SolidWorks 2026', price: 18000,
        brand: 'Dassault', image: 'images/color.png',
        description: 'برنامج التصميم الميكانيكي ثلاثي الأبعاد الأول للمهندسين.',
        specs: { 'النسخة': '2026', 'النظام': 'Windows', 'المدة': 'دائم' },
        stock: 30, created_at: now(), updated_at: now()
    },
    // 🎮 ألعاب PC
    {
        id: 'seed_pcgame_1', type: 'pcgames', name: 'Elden Ring', price: 18000,
        brand: 'FromSoftware', image: 'images/Banner.png',
        description: 'لعبة RPG ملحمية حائزة على جوائز — نسخة كاملة مع جميع الإضافات.',
        specs: { 'المنصة': 'PC', 'النوع': 'RPG', 'التفعيل': 'Steam' },
        stock: 30, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_pcgame_2', type: 'pcgames', name: 'EA SPORTS FC 26', price: 14000,
        brand: 'EA Sports', image: 'images/games.png',
        description: 'أحدث إصدار من لعبة كرة القدم الأشهر في العالم — عربي كامل.',
        specs: { 'المنصة': 'PC', 'النوع': 'رياضة', 'اللغة': 'عربي' },
        stock: 45, created_at: now(), updated_at: now()
    },
    // 🕹️ PlayStation
    {
        id: 'seed_ps_1', type: 'playstation', name: 'Sony PlayStation 3', price: 45000,
        brand: 'Sony', image: 'images/Sony PlayStation 3.jpg',
        description: 'جهاز PlayStation 3 مع ملحقاته وألعاب مختارة — حالة ممتازة.',
        specs: { 'المنصة': 'PS3', 'الحالة': 'ممتازة', 'الملحقات': 'يد + كيبل' },
        stock: 5, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_ps_2', type: 'playstation', name: 'God of War Ragnarök', price: 16000,
        brand: 'Sony', image: 'images/Banner2.png',
        description: 'ملحمة كريتوس وأتريوس — واحدة من أفضل ألعاب PlayStation.',
        specs: { 'المنصة': 'PS4/PS5', 'النوع': 'أكشن مغامرة', 'الترجمة': 'عربي' },
        stock: 12, created_at: now(), updated_at: now()
    },
    // 🔧 قطع PC (تظهر في منشئ التجميعات)
    {
        id: 'seed_comp_1', type: 'component', componentType: 'gpu', name: 'Beast RTX 4070', price: 95000,
        brand: 'NVIDIA', image: 'images/Beast RTX 4070.png',
        description: 'كرت شاشة RTX 4070 بأداء استثنائي للألعاب والتصميم ثلاثي الأبعاد.',
        specs: { 'الذاكرة': '12GB', 'الجيل': 'Ada Lovelace' },
        stock: 10, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_2', type: 'component', componentType: 'cpu', name: 'Intel Core i7-14700K', price: 72000,
        brand: 'Intel', image: '',
        description: 'معالج Intel من الجيل الرابع عشر — أداء ممتاز للألعاب والعمل.',
        specs: { 'الأنوية': '20', 'التردد': '5.6GHz' },
        stock: 12, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_3', type: 'component', componentType: 'motherboard', name: 'ASUS ROG STRIX Z790', price: 58000,
        brand: 'ASUS', image: '',
        description: 'لوحة أم احترافية للمعالجات الحديثة مع تبريد ممتاز.',
        specs: { 'الشريحة': 'Z790', 'المنفذ': 'LGA1700' },
        stock: 8, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_4', type: 'component', componentType: 'ram', name: 'Corsair Vengeance 32GB', price: 28000,
        brand: 'Corsair', image: '',
        description: 'ذاكرة RAM بسعة 32 جيجابايت وسرعة عالية للألعاب والتصميم.',
        specs: { 'السعة': '32GB', 'السرعة': '6000MHz' },
        stock: 20, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_5', type: 'component', componentType: 'storage', name: 'Samsung 980 PRO 1TB NVMe', price: 32000,
        brand: 'Samsung', image: '',
        description: 'قرص SSD فائق السرعة — تحميل أسرع للنظام والألعاب.',
        specs: { 'السعة': '1TB', 'النوع': 'NVMe Gen4' },
        stock: 15, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_6', type: 'component', componentType: 'psu', name: 'Corsair RM850e', price: 27000,
        brand: 'Corsair', image: '',
        description: 'مزود طاقة 850 واط معتمد 80+ Gold — تشغيل هادئ وآمن.',
        specs: { 'القدرة': '850W', 'الكفاءة': '80+ Gold' },
        stock: 10, created_at: now(), updated_at: now()
    },
    {
        id: 'seed_comp_7', type: 'component', componentType: 'case', name: 'NZXT H5 Flow', price: 22000,
        brand: 'NZXT', image: '',
        description: 'صندوق كمبيوتر بتصميم أنيق وتهوية ممتازة مع إضاءة RGB.',
        specs: { 'النوع': 'Mid Tower', 'التهوية': 'ممتازة' },
        stock: 9, created_at: now(), updated_at: now()
    }
];

// ==================== حالة الذاكرة ====================
const store = {
    products: SEED_PRODUCTS.map(p => ({ ...p })),
    settings: null,
    coupons: [
        { code: 'DAR3A10', type: 'percent', discount: 10, active: true, min_order: 0, created_at: now() }
    ],
    orders: [],
    subscribers: [],
    adminSessions: []
};

// ==================== الواجهة (نفس واجهة database.js) ====================
module.exports = {
    demoMode: true,

    async getProducts() { return store.products.map(p => ({ ...p })); },

    async getProductById(id) { return store.products.find(p => p.id === id) || null; },

    async addProduct(product) {
        const p = { ...product, id: product.id || uid('prod'), created_at: now(), updated_at: now() };
        store.products.push(p);
        return { ...p };
    },

    async updateProduct(id, product) {
        const idx = store.products.findIndex(p => p.id === id);
        if (idx === -1) return null;
        store.products[idx] = { ...store.products[idx], ...product, id, updated_at: now() };
        return { ...store.products[idx] };
    },

    async deleteProduct(id) {
        store.products = store.products.filter(p => p.id !== id);
        return true;
    },

    async replaceAllProducts(products) {
        store.products = (products || []).map(p => ({ ...p, created_at: p.created_at || now(), updated_at: now() }));
        return true;
    },

    async getSettings() { return store.settings ? JSON.parse(JSON.stringify(store.settings)) : null; },

    async saveSettings(settings) { store.settings = JSON.parse(JSON.stringify(settings)); return true; },

    async getCoupons() { return store.coupons.map(c => ({ ...c })); },

    async getCouponByCode(code) {
        return store.coupons.find(c => c.code === String(code).toUpperCase()) || null;
    },

    async addCoupon(coupon) {
        const c = { ...coupon, code: String(coupon.code).toUpperCase(), created_at: now() };
        store.coupons.push(c);
        return { ...c };
    },

    async deleteCoupon(code) {
        store.coupons = store.coupons.filter(c => c.code !== String(code).toUpperCase());
        return true;
    },

    async getSubscribers() { return store.subscribers.map(s => ({ ...s })); },

    async addSubscriber(email) {
        if (store.subscribers.some(s => s.email === email)) {
            return { success: true, message: 'البريد موجود بالفعل', alreadyExists: true };
        }
        const s = { email, created_at: now(), date: now() };
        store.subscribers.push(s);
        return { success: true, data: { ...s } };
    },

    async deleteSubscriber(email) {
        store.subscribers = store.subscribers.filter(s => s.email !== email);
        return true;
    },

    async clearAllSubscribers() { store.subscribers = []; return true; },

    async getOrders() { return store.orders.map(o => ({ ...o })); },

    async addOrder(order) {
        const o = { ...order, id: order.id || uid('order'), created_at: now(), date: now() };
        store.orders.push(o);
        return { ...o };
    },

    async deleteOrder(id) {
        store.orders = store.orders.filter(o => o.id !== id);
        return true;
    },

    async clearAllOrders() { store.orders = []; return true; },

    async saveAdminSession(sessionToken, expiresAt) {
        store.adminSessions.push({ token: sessionToken, expires_at: new Date(expiresAt).toISOString() });
        return true;
    },

    async verifyAdminSession(sessionToken) {
        const s = store.adminSessions.find(x => x.token === sessionToken);
        return !!(s && new Date(s.expires_at) >= new Date());
    },

    async deleteAdminSession(sessionToken) {
        store.adminSessions = store.adminSessions.filter(x => x.token !== sessionToken);
        return true;
    },

    async cleanExpiredSessions() {
        store.adminSessions = store.adminSessions.filter(x => new Date(x.expires_at) >= new Date());
        return true;
    }
};
