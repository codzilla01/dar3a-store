const supabase = require('./supabase-client');

// دوال مساعدة للتعامل مع Supabase
const db = {
  // المنتجات
  async getProducts() {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    return data;
  },
  
  async saveProducts(products) {
    // حذف الكل أولاً
    const { error: deleteError } = await supabase.from('products').delete().neq('id', '');
    if (deleteError) throw deleteError;
    
    // إدراج الجدد
    if (products.length) {
      const { error: insertError } = await supabase.from('products').insert(products);
      if (insertError) throw insertError;
    }
    return true;
  },
  
  async updateProduct(id, product) {
    const { error } = await supabase.from('products').update(product).eq('id', id);
    if (error) throw error;
    return true;
  },
  
  async deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
  
  // الإعدادات
  async getSettings() {
    const { data, error } = await supabase.from('settings').select('value').eq('key', 'site_settings').single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.value || null;
  },
  
  async saveSettings(settings) {
    const { error } = await supabase.from('settings').upsert({ key: 'site_settings', value: settings });
    if (error) throw error;
    return true;
  },
  
  // الكوبونات
  async getCoupons() {
    const { data, error } = await supabase.from('coupons').select('*');
    if (error) throw error;
    return data;
  },
  
  async addCoupon(coupon) {
    const { error } = await supabase.from('coupons').insert(coupon);
    if (error) throw error;
    return true;
  },
  
  async deleteCoupon(code) {
    const { error } = await supabase.from('coupons').delete().eq('code', code);
    if (error) throw error;
    return true;
  },
  
  // المشتركين
  async getSubscribers() {
    const { data, error } = await supabase.from('subscribers').select('*');
    if (error) throw error;
    return data;
  },
  
  async addSubscriber(email) {
    const { error } = await supabase.from('subscribers').insert({ email, date: new Date() });
    if (error && error.code !== '23505') throw error; // 23505 = duplicate
    return true;
  },
  
  async deleteSubscriber(email) {
    const { error } = await supabase.from('subscribers').delete().eq('email', email);
    if (error) throw error;
    return true;
  },
  
  async clearAllSubscribers() {
    const { error } = await supabase.from('subscribers').delete().neq('email', '');
    if (error) throw error;
    return true;
  },
  
  // الطلبات
  async getOrders() {
    const { data, error } = await supabase.from('orders').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data;
  },
  
  async addOrder(order) {
    const { error } = await supabase.from('orders').insert(order);
    if (error) throw error;
    return true;
  }
};

module.exports = db;