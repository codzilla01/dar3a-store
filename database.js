// database.js
// طبقة البيانات الإنتاجية. لا تستخدم إلا بمفتاح Supabase service_role داخل الخادم.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();
const configured = Boolean(supabaseUrl && serviceKey);

const supabase = configured
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (...args) => globalThis.fetch(...args) }
    })
    : null;

function configurationError() {
    const error = new Error('قاعدة البيانات غير مهيأة. أضف SUPABASE_URL و SUPABASE_SERVICE_KEY.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    return error;
}

function client() {
    if (!supabase) throw configurationError();
    return supabase;
}

function throwIfError(error, context) {
    if (error) {
        const wrapped = new Error(`${context}: ${error.message}`);
        wrapped.code = error.code;
        throw wrapped;
    }
}

function withoutSecrets(user) {
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
}

const productFields = ['id', 'type', 'name', 'price', 'brand', 'image', 'description', 'specs', 'stock', 'component_type'];
function cleanProduct(product) {
    const clean = {};
    for (const field of productFields) {
        if (product[field] !== undefined) clean[field] = product[field];
    }
    if (product.componentType !== undefined && clean.component_type === undefined) {
        clean.component_type = product.componentType;
    }
    clean.updated_at = new Date().toISOString();
    return clean;
}

async function getProducts() {
    const { data, error } = await client().from('products').select('*').order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب المنتجات');
    return data || [];
}

async function replaceAllProducts(products) {
    const db = client();
    const cleaned = products.map(cleanProduct);
    const { error: deleteError } = await db.from('products').delete().not('id', 'is', null);
    throwIfError(deleteError, 'تعذر حفظ المنتجات');
    if (cleaned.length) {
        const { error: insertError } = await db.from('products').insert(cleaned);
        throwIfError(insertError, 'تعذر حفظ المنتجات');
    }
    return true;
}

async function getSettings() {
    const { data, error } = await client().from('settings').select('value').eq('key', 'site_settings').maybeSingle();
    throwIfError(error, 'تعذر جلب الإعدادات');
    return data?.value || null;
}

async function saveSettings(settings) {
    const { error } = await client().from('settings').upsert({
        key: 'site_settings', value: settings, updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    throwIfError(error, 'تعذر حفظ الإعدادات');
    return true;
}

async function getCoupons() {
    const { data, error } = await client().from('coupons').select('*').order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب الكوبونات');
    return data || [];
}

async function addCoupon(coupon) {
    const record = {
        code: String(coupon.code).trim().toUpperCase(),
        type: coupon.type,
        discount: coupon.discount,
        min_order: coupon.min_order ?? coupon.minOrder ?? 0,
        expires_at: coupon.expires_at || null,
        active: coupon.active !== false
    };
    const { data, error } = await client().from('coupons').insert(record).select().single();
    throwIfError(error, 'تعذر إضافة الكوبون');
    return data;
}

async function deleteCoupon(code) {
    const { error } = await client().from('coupons').delete().eq('code', String(code).toUpperCase());
    throwIfError(error, 'تعذر حذف الكوبون');
    return true;
}

async function createOrder(order) {
    const { data, error } = await client().rpc('create_store_order', {
        p_customer_name: order.customer_name,
        p_customer_phone: order.customer_phone,
        p_customer_address: order.customer_address || null,
        p_notes: order.notes || null,
        p_payment_method: order.payment_method,
        p_items: order.items,
        p_coupon: order.coupon || null
    });
    throwIfError(error, 'تعذر إنشاء الطلب');
    return data;
}

async function getOrders() {
    const { data, error } = await client().from('orders').select('*').order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب الطلبات');
    return data || [];
}

async function updateOrderStatus(id, status) {
    const { data, error } = await client().from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    throwIfError(error, 'تعذر تحديث حالة الطلب');
    return data;
}

async function getSubscribers() {
    const { data, error } = await client().from('subscribers').select('*').order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب المشتركين');
    return data || [];
}

async function addSubscriber(email) {
    const { error } = await client().from('subscribers').upsert({ email, created_at: new Date().toISOString() }, { onConflict: 'email', ignoreDuplicates: true });
    throwIfError(error, 'تعذر حفظ الاشتراك');
    return { success: true };
}

async function deleteSubscriber(email) {
    const query = client().from('subscribers').delete();
    const { error } = email === 'all' ? await query.not('email', 'is', null) : await query.eq('email', email);
    throwIfError(error, 'تعذر حذف المشترك');
    return true;
}

async function getUserByUsername(username) {
    const { data, error } = await client().from('admin_users').select('*').eq('username', username).maybeSingle();
    throwIfError(error, 'تعذر التحقق من الحساب');
    return data || null;
}

async function getUserById(id) {
    const { data, error } = await client().from('admin_users').select('*').eq('id', id).maybeSingle();
    throwIfError(error, 'تعذر التحقق من الحساب');
    return data || null;
}

async function updateUserLogin(id) {
    const { error } = await client().from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
    throwIfError(error, 'تعذر تحديث جلسة الحساب');
}

async function listUsers() {
    const { data, error } = await client().from('admin_users')
        .select('id, username, display_name, role, is_active, created_at, updated_at, last_login_at')
        .order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب المستخدمين');
    return data || [];
}

async function createUser(user) {
    const { data, error } = await client().from('admin_users').insert({
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        password_hash: user.password_hash,
        is_active: true
    }).select('id, username, display_name, role, is_active, created_at, updated_at, last_login_at').single();
    throwIfError(error, 'تعذر إنشاء المستخدم');
    return data;
}

async function updateUser(id, changes) {
    const { data, error } = await client().from('admin_users').update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', id).select('id, username, display_name, role, is_active, created_at, updated_at, last_login_at').single();
    throwIfError(error, 'تعذر تحديث المستخدم');
    return data;
}

async function listWebAuthnCredentials(userId) {
    const { data, error } = await client().from('webauthn_credentials')
        .select('credential_id, name, transports, device_type, backed_up, created_at, last_used_at')
        .eq('user_id', userId).order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب مفاتيح البصمة');
    return data || [];
}

async function getWebAuthnCredential(credentialId) {
    const { data, error } = await client().from('webauthn_credentials').select('*').eq('credential_id', credentialId).maybeSingle();
    throwIfError(error, 'تعذر التحقق من مفتاح البصمة');
    return data || null;
}

async function saveWebAuthnCredential(credential) {
    const { data, error } = await client().from('webauthn_credentials').insert({
        user_id: credential.user_id,
        credential_id: credential.credential_id,
        public_key: credential.public_key,
        counter: credential.counter,
        transports: credential.transports || [],
        device_type: credential.device_type || null,
        backed_up: Boolean(credential.backed_up),
        name: credential.name || null
    }).select('credential_id, name, transports, device_type, backed_up, created_at, last_used_at').single();
    throwIfError(error, 'تعذر حفظ مفتاح البصمة');
    return data;
}

async function updateWebAuthnCredential(credentialId, counter) {
    const { error } = await client().from('webauthn_credentials').update({
        counter,
        last_used_at: new Date().toISOString()
    }).eq('credential_id', credentialId);
    throwIfError(error, 'تعذر تحديث مفتاح البصمة');
}

async function deleteWebAuthnCredential(userId, credentialId) {
    const { error } = await client().from('webauthn_credentials').delete().eq('user_id', userId).eq('credential_id', credentialId);
    throwIfError(error, 'تعذر حذف مفتاح البصمة');
    return true;
}

async function getDashboardStats() {
    const db = client();
    const [products, orders, subscribers, subscriptions, recentOrders] = await Promise.all([
        db.from('products').select('*', { count: 'exact', head: true }),
        db.from('orders').select('*', { count: 'exact', head: true }),
        db.from('subscribers').select('*', { count: 'exact', head: true }),
        db.from('subscriptions').select('*', { count: 'exact', head: true }),
        db.from('orders').select('id, customer_name, total, status, created_at').order('created_at', { ascending: false }).limit(5)
    ]);
    for (const result of [products, orders, subscribers, subscriptions, recentOrders]) throwIfError(result.error, 'تعذر جلب إحصاءات لوحة التحكم');
    return {
        products: products.count || 0,
        orders: orders.count || 0,
        subscribers: subscribers.count || 0,
        subscriptions: subscriptions.count || 0,
        recentOrders: recentOrders.data || []
    };
}

async function listSubscriptions() {
    const { data, error } = await client().from('subscriptions').select('*').order('created_at', { ascending: false });
    throwIfError(error, 'تعذر جلب الاشتراكات');
    return data || [];
}

async function createSubscription(subscription) {
    const { data, error } = await client().from('subscriptions').insert(subscription).select().single();
    throwIfError(error, 'تعذر إنشاء الاشتراك');
    return data;
}

async function getSubscription(id) {
    const { data, error } = await client().from('subscriptions').select('*').eq('id', id).maybeSingle();
    throwIfError(error, 'تعذر جلب الاشتراك');
    return data || null;
}

async function updateSubscription(id, changes) {
    const { data, error } = await client().from('subscriptions').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    throwIfError(error, 'تعذر تحديث الاشتراك');
    return data;
}

async function verifyActivation(activationKey, domain) {
    const keyHash = require('crypto').createHash('sha256').update(activationKey).digest('hex');
    const { data, error } = await client().from('subscriptions')
        .select('*').eq('activation_key_hash', keyHash).eq('domain', domain).maybeSingle();
    throwIfError(error, 'تعذر التحقق من التفعيل');
    if (!data) return { valid: false, status: 'not_found' };
    const expired = data.expires_at && new Date(data.expires_at) < new Date();
    const valid = data.status === 'active' && !expired;
    if (valid) {
        await updateSubscription(data.id, {
            last_activated_at: new Date().toISOString(),
            activation_count: Number(data.activation_count || 0) + 1
        });
    }
    return { valid, status: expired ? 'expired' : data.status, expires_at: data.expires_at, client_name: data.client_name };
}

async function addSubscriptionEvent(subscriptionId, action, actorId, metadata = {}) {
    const { error } = await client().from('subscription_events').insert({
        subscription_id: subscriptionId, action, actor_id: actorId || null, metadata
    });
    throwIfError(error, 'تعذر حفظ سجل الاشتراك');
}

module.exports = {
    configured,
    supabase,
    withoutSecrets,
    getProducts,
    replaceAllProducts,
    getSettings,
    saveSettings,
    getCoupons,
    addCoupon,
    deleteCoupon,
    createOrder,
    getOrders,
    updateOrderStatus,
    getSubscribers,
    addSubscriber,
    deleteSubscriber,
    getUserByUsername,
    getUserById,
    updateUserLogin,
    listUsers,
    createUser,
    updateUser,
    listWebAuthnCredentials,
    getWebAuthnCredential,
    saveWebAuthnCredential,
    updateWebAuthnCredential,
    deleteWebAuthnCredential,
    getDashboardStats,
    listSubscriptions,
    createSubscription,
    getSubscription,
    updateSubscription,
    verifyActivation,
    addSubscriptionEvent
};
