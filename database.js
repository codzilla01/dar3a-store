// database.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL و SUPABASE_ANON_KEY مطلوبان في متغيرات البيئة');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase initialized successfully');

// ============================================
// دوال المنتجات
// ============================================

async function getProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw new Error(`خطأ في جلب المنتجات: ${error.message}`);
    return data || [];
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
    
    const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select();
    
    if (error) throw new Error(`خطأ في إضافة المنتج: ${error.message}`);
    return data && data[0] ? data[0] : null;
}

async function updateProduct(id, product) {
    product.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('products')
        .update(product)
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
    const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .neq('id', '');
    
    if (deleteError) throw new Error(`خطأ في حذف المنتجات: ${deleteError.message}`);
    
    if (products && products.length > 0) {
        const { error: insertError } = await supabase
            .from('products')
            .insert(products);
        
        if (insertError) throw new Error(`خطأ في إدراج المنتجات: ${insertError.message}`);
    }
    
    return true;
}

async function getProductsByType(type) {
    const products = await getProducts();
    return products.filter(p => p.type === type);
}

async function searchProducts(query) {
    const products = await getProducts();
    const searchTerm = query.toLowerCase();
    return products.filter(p => p.name && p.name.toLowerCase().includes(searchTerm));
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
        });
    
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
        .insert([coupon])
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
        .insert([order])
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
// تصدير الدوال
// ============================================

module.exports = {
    getProducts,
    getProductById,
    addProduct,
    updateProduct,
    deleteProduct,
    replaceAllProducts,
    getProductsByType,
    searchProducts,
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
    supabase
};
