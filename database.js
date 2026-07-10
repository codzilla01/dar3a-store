// database.js - النسخة المصححة والموافقة لبيئة Vercel السحابية
const { createClient } = require('@supabase/supabase-js');

// تنظيف المتغيرات البيئية تلقائياً من أي مسافات زائدة قد تسبب فشل الاتصال
const supabaseUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : null;
const supabaseKey = process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.trim() : null;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ SUPABASE_URL و SUPABASE_ANON_KEY مطلوبان في متغيرات البيئة بـ Vercel');
}

// إنشاء الاتصال وحقن الـ Fetch الصريح لحل مشكلة TypeError: fetch failed في Vercel
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    },
    global: {
        fetch: (...args) => globalThis.fetch(...args) // إجبار Supabase على استخدام الـ fetch الأصلي للسيرفر
    }
});

console.log('✅ Supabase initialized successfully with explicit fetch');

// ============================================
// دالة تنظيف المنتج - تحويل camelCase إلى snake_case
// ============================================
function cleanProduct(p) {
    const cleaned = {};
    // قائمة الحقول المسموحة فقط
    const allowedFields = ['id', 'type', 'name', 'price', 'brand', 'image', 'description', 'specs', 'stock', 'created_at', 'updated_at', 'component_type'];
    
    for (const key of allowedFields) {
        if (p[key] !== undefined) {
            cleaned[key] = p[key];
        }
    }
    
    // التعامل مع componentType إذا كان موجوداً
    if (p.componentType !== undefined && cleaned.component_type === undefined) {
        cleaned.component_type = p.componentType;
    }
    
    // ضمان وجود التواريخ
    if (!cleaned.created_at) cleaned.created_at = new Date().toISOString();
    if (!cleaned.updated_at) cleaned.updated_at = new Date().toISOString();
    
    return cleaned;
}

// ============================================
// دوال المنتجات
// ============================================

async function getProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('🔴 Error inside getProducts:', err);
        throw new Error(`خطأ في جلب المنتجات: ${err.message || err}`);
    }
}

async function getProductById(id) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        throw new Error(`خطأ في جلب المنتج: ${error.message}`);
    }
    return data || null;
}

async function addProduct(product) {
    if (!product.id) {
        product.id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
    product.created_at = new Date().toISOString();
    product.updated_at = new Date().toISOString();
    
    const cleaned = cleanProduct(product);
    
    const { data, error } = await supabase
        .from('products')
        .insert([cleaned])
        .select();
    
    if (error) {
        console.error('Insert error details:', error);
        throw new Error(`خطأ في إضافة المنتج: ${error.message}`);
    }
    return data && data[0] ? data[0] : null;
}

async function updateProduct(id, product) {
    product.updated_at = new Date().toISOString();
    
    const cleaned = cleanProduct(product);
    
    const { data, error } = await supabase
        .from('products')
        .update(cleaned)
        .eq('id', id)
        .select();
    
    if (error) throw new Error(`خطأ في تحديث المنتج: ${error.message}`);
    return data && data[0] ? data[0] : null;
}

async function deleteProduct(id) {
    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
    
    if (error) throw new Error(`خطأ في حذف المنتج: ${error.message}`);
    return true;
}

async function replaceAllProducts(products) {
    const cleanedProducts = products.map(cleanProduct);
    
    const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .neq('id', '');
    
    if (deleteError) throw new Error(`خطأ في حذف المنتجات: ${deleteError.message}`);
    
    if (cleanedProducts && cleanedProducts.length > 0) {
        const { error: insertError } = await supabase
            .from('products')
            .insert(cleanedProducts);
        
        if (insertError) {
            console.error('ReplaceAll insert error:', insertError);
            throw new Error(`خطأ في إدراج المنتجات: ${insertError.message}`);
        }
    }
    
    return true;
}

// ============================================
// دوال الإعدادات
// ============================================

async function getSettings() {
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'site_settings')
        .single();
    
    if (error && error.code !== 'PGRST116') {
        throw new Error(`خطأ في جلب الإعدادات: ${error.message}`);
    }
    return data?.value || null;
}

async function saveSettings(settings) {
    const { error } = await supabase
        .from('settings')
        .upsert({
            key: 'site_settings',
            value: settings,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    
    if (error) throw new Error(`خطأ في حفظ الإعدادات: ${error.message}`);
    return true;
}

// ============================================
// دوال الكوبونات
// ============================================

async function getCoupons() {
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw new Error(`خطأ في جلب الكوبونات: ${error.message}`);
    return data || [];
}

async function getCouponByCode(code) {
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();
    
    if (error && error.code !== 'PGRST116') {
        throw new Error(`خطأ في جلب الكوبون: ${error.message}`);
    }
    return data || null;
}

async function addCoupon(coupon) {
    coupon.code = coupon.code.toUpperCase();
    coupon.created_at = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('coupons')
        .insert([{
            code: coupon.code,
            type: coupon.type,
            discount: coupon.discount,
            active: coupon.active,
            min_order: coupon.min_order || 0,
            created_at: coupon.created_at
        }])
        .select();
    
    if (error) throw new Error(`خطأ في إضافة الكوبون: ${error.message}`);
    return data && data[0] ? data[0] : null;
}

async function deleteCoupon(code) {
    const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('code', code.toUpperCase());
    
    if (error) throw new Error(`خطأ في حذف الكوبون: ${error.message}`);
    return true;
}

// ============================================
// دوال المشتركين
// ============================================

async function getSubscribers() {
    const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw new Error(`خطأ في جلب المشتركين: ${error.message}`);
    return data || [];
}

async function addSubscriber(email) {
    const { data: existing, error: checkError } = await supabase
        .from('subscribers')
        .select('email')
        .eq('email', email)
        .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
        throw new Error(`خطأ في التحقق من المشترك: ${checkError.message}`);
    }
    
    if (existing) {
        return { success: true, message: 'البريد موجود بالفعل', alreadyExists: true };
    }
    
    const { data, error } = await supabase
        .from('subscribers')
        .insert([{ email, created_at: new Date().toISOString() }])
        .select();
    
    if (error) throw new Error(`خطأ في إضافة المشترك: ${error.message}`);
    return { success: true, data: data && data[0] ? data[0] : null };
}

async function deleteSubscriber(email) {
    const { error } = await supabase
        .from('subscribers')
        .delete()
        .eq('email', email);
    
    if (error) throw new Error(`خطأ في حذف المشترك: ${error.message}`);
    return true;
}

async function clearAllSubscribers() {
    const { error } = await supabase
        .from('subscribers')
        .delete()
        .neq('email', '');
    
    if (error) throw new Error(`خطأ في حذف جميع المشتركين: ${error.message}`);
    return true;
}

// ============================================
// دوال الطلبات
// ============================================

async function getOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw new Error(`خطأ في جلب الطلبات: ${error.message}`);
    return data || [];
}

async function addOrder(order) {
    order.created_at = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            id: order.id,
            items: order.items,
            total: order.total,
            coupon: order.coupon,
            created_at: order.created_at
        }])
        .select();
    
    if (error) throw new Error(`خطأ في إضافة الطلب: ${error.message}`);
    return data && data[0] ? data[0] : null;
}

async function deleteOrder(id) {
    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);
    
    if (error) throw new Error(`خطأ في حذف الطلب: ${error.message}`);
    return true;
}

async function clearAllOrders() {
    const { error } = await supabase
        .from('orders')
        .delete()
        .neq('id', '');
    
    if (error) throw new Error(`خطأ في مسح الطلبات: ${error.message}`);
    return true;
}

// ============================================
// دوال جلسات المدير
// ============================================

async function saveAdminSession(sessionToken, expiresAt) {
    const { error } = await supabase
        .from('admin_sessions')
        .upsert({
            token: sessionToken,
            expires_at: new Date(expiresAt).toISOString(),
            created_at: new Date().toISOString()
        }, { onConflict: 'token' });
    
    if (error) throw new Error(`خطأ في حفظ جلسة المدير: ${error.message}`);
    return true;
}

async function verifyAdminSession(sessionToken) {
    const { data, error } = await supabase
        .from('admin_sessions')
        .select('*')
        .eq('token', sessionToken)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        throw new Error(`خطأ في التحقق من جلسة المدير: ${error.message}`);
    }
    
    if (!data) return false;
    if (new Date(data.expires_at) < new Date()) return false;
    return true;
}

async function deleteAdminSession(sessionToken) {
    const { error } = await supabase
        .from('admin_sessions')
        .delete()
        .eq('token', sessionToken);
    
    if (error) throw new Error(`خطأ في حذف جلسة المدير: ${error.message}`);
    return true;
}

async function cleanExpiredSessions() {
    const { error } = await supabase
        .from('admin_sessions')
        .delete()
        .lt('expires_at', new Date().toISOString());
    
    if (error) throw new Error(`خطأ في تنظيف الجلسات: ${error.message}`);
    return true;
}

// ============================================
// تصدير الدوال
// ============================================

module.exports = {
    getProducts,
    getProductById,
    addProduct,
    updateProduct,
    deleteProduct,
    replaceAllProducts,
    getSettings,
    saveSettings,
    getCoupons,
    getCouponByCode,
    addCoupon,
    deleteCoupon,
    getSubscribers,
    addSubscriber,
    deleteSubscriber,
    clearAllSubscribers,
    getOrders,
    addOrder,
    deleteOrder,
    clearAllOrders,
    saveAdminSession,
    verifyAdminSession,
    deleteAdminSession,
    cleanExpiredSessions,
    supabase
};
