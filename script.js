// ---------- إعدادات وقراءة المنتجات من localStorage ----------
        const STORAGE_KEY = 'products_data';

        // تهيئة التطبيق بعد تحميل DOM
        document.addEventListener('DOMContentLoaded', function() {
            initializeApp();
        });

        function initializeApp() {
            // تهيئة القائمة المتنقلة
            initMobileMenu();
            
            // تهيئة السلة
            updateCart();
            
            // عرض المنتجات
            renderProducts();
            
            // إضافة مستمعي الأحداث للتصفية
            addFilterEventListeners();
            
            // إضافة مستمعي الأحداث الأساسية
            addBasicEventListeners();
            
            // تهيئة الدخول السري للإدارة
            initAdminSecret();
            
            // بدء الاستماع للتحديثات
            startStorageListener();
        }

        function initMobileMenu() {
            const menuToggle = document.getElementById('mobile-menu-toggle');
            const mainNav = document.getElementById('main-nav');
            
            if (menuToggle && mainNav) {
                menuToggle.addEventListener('click', function() {
                    mainNav.classList.toggle('active');
                    this.setAttribute('aria-expanded', mainNav.classList.contains('active'));
                });
                
                // إغلاق القائمة عند النقر على رابط
                mainNav.addEventListener('click', function(e) {
                    if (e.target.tagName === 'A') {
                        mainNav.classList.remove('active');
                        menuToggle.setAttribute('aria-expanded', 'false');
                    }
                });
                
                // إغلاق القائمة عند النقر خارجها
                document.addEventListener('click', function(e) {
                    if (!mainNav.contains(e.target) && !menuToggle.contains(e.target)) {
                        mainNav.classList.remove('active');
                        menuToggle.setAttribute('aria-expanded', 'false');
                    }
                });
            }
        }

        function loadProducts() {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
                return DEFAULT_PRODUCTS.slice();
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error('Failed to parse products', e);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
                return DEFAULT_PRODUCTS.slice();
            }
        }

        // عرض المنتجات في الموقع مع تحسين الأداء
        function renderProducts(filter = '') {
            const grid = document.getElementById('products-grid');
            const noProducts = document.getElementById('no-products');
            const products = loadProducts();
            const q = (filter || '').trim().toLowerCase();

            const filtered = products.filter(p => {
                if (!q) return true;
                return p.name.toLowerCase().includes(q) ||
                       (p.brand || '').toLowerCase().includes(q) ||
                       (p.category || '').toLowerCase().includes(q) ||
                       (p.sku || '').toLowerCase().includes(q);
            });

            // استخدام DocumentFragment لتحسين الأداء
            const fragment = document.createDocumentFragment();
            
            if (filtered.length === 0) {
                noProducts.classList.remove('hidden');
                grid.innerHTML = '';
                return;
            } else {
                noProducts.classList.add('hidden');
            }

            filtered.forEach(p => {
                const card = createProductCard(p);
                fragment.appendChild(card);
            });

            grid.innerHTML = '';
            grid.appendChild(fragment);

            // إضافة مستمعي الأحداث للعناصر الجديدة
            addProductEventListeners();
        }

        function createProductCard(product) {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.setAttribute('data-brand', product.brand.toLowerCase());
            
            // إنشاء HTML للمنتج
            card.innerHTML = `
                <div class="product-image">
                    <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" 
                         loading="lazy" width="400" height="260"
                         onerror="this.src='https://via.placeholder.com/400x260?text=No+Image'">
                    <div class="product-overlay">
                        <button class="btn btn-primary quick-view" data-product-id="${product.id}">
                            <i class="fas fa-eye"></i> عرض سريع
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${escapeHtml(product.name)}</h3>
                    <p class="product-brand">${escapeHtml(product.brand)}</p>
                    <div class="product-specs">
                        ${product.specifications ? Object.entries(product.specifications).slice(0, 2).map(([key, value]) => 
                            `<span>${key}: ${value}</span>`
                        ).join('') : ''}
                    </div>
                    <div class="product-price">${parseFloat(product.price).toLocaleString()} ج.م</div>
                    <div class="product-stock">${escapeHtml(product.availability)} - الكمية: ${escapeHtml(String(product.stock || 0))}</div>
                    <div class="product-actions">
                        <button class="btn btn-primary add-to-cart" data-product-id="${product.id}">
                            <i class="fas fa-shopping-cart"></i> إضافة للسلة
                        </button>
                    </div>
                </div>
            `;
            return card;
        }

        // دالة لجلب تفاصيل منتج معين
        function getProductDetails(productId) {
            const products = loadProducts();
            return products.find(p => p.id === productId);
        }

        // عرض تفاصيل المنتج في النافذة المنبثقة
        function showProductModal(product) {
            const modalBody = document.getElementById('modal-body');
            const specifications = product.specifications || {};
            
            let specsHTML = '';
            for (const [key, value] of Object.entries(specifications)) {
                specsHTML += `<li><strong>${key}:</strong> ${value}</li>`;
            }
            
            modalBody.innerHTML = `
                <div class="modal-product">
                    <div class="modal-product-image">
                        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" 
                             loading="lazy" width="400" height="300"
                             onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                    </div>
                    <div class="modal-product-details">
                        <h2>${escapeHtml(product.name)}</h2>
                        <p class="product-brand">${escapeHtml(product.brand)}</p>
                        <p class="product-description">${escapeHtml(product.description || 'لا يوجد وصف متاح')}</p>
                        
                        <div class="product-specifications">
                            <h3>المواصفات:</h3>
                            <ul>${specsHTML}</ul>
                        </div>
                        
                        <div class="product-price">${parseFloat(product.price).toLocaleString()} ج.م</div>
                        <div class="product-stock">${escapeHtml(product.availability)} - الكمية: ${escapeHtml(String(product.stock || 0))}</div>
                        
                        <div class="modal-actions">
                            <button class="btn btn-primary add-to-cart-modal" data-product-id="${product.id}">
                                <i class="fas fa-shopping-cart"></i> إضافة إلى السلة
                            </button>
                            <button class="btn btn-secondary close-modal-btn">
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // إضافة مستمعي الأحداث
            document.querySelector('.add-to-cart-modal').addEventListener('click', function() {
                addToCart(product);
                closeModal();
            });
            
            document.querySelector('.close-modal-btn').addEventListener('click', closeModal);
            
            // عرض النافذة
            document.getElementById('product-modal').style.display = 'flex';
        }

        // إضافة مستمعي الأحداث للمنتجات
        function addProductEventListeners() {
            // أزرار العرض السريع
            document.querySelectorAll('.quick-view').forEach(button => {
                button.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-product-id'));
                    const product = getProductDetails(productId);
                    if (product) {
                        showProductModal(product);
                    }
                });
            });
            
            // أزرار إضافة إلى السلة
            document.querySelectorAll('.add-to-cart').forEach(button => {
                button.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-product-id'));
                    const product = getProductDetails(productId);
                    if (product) {
                        addToCart(product);
                    }
                });
            });
        }

        // البحث مع debounce لتحسين الأداء
        let searchTimeout;
        document.getElementById('top-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                renderProducts(e.target.value);
            }, 300);
        });

        // التصفية حسب العلامة التجارية
        function addFilterEventListeners() {
            const filterButtons = document.querySelectorAll('.filter-btn');
            
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    // إزالة النشاط من جميع الأزرار
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    // إضافة النشاط للزر المحدد
                    this.classList.add('active');
                    
                    const filter = this.getAttribute('data-filter');
                    if (filter === 'all') {
                        renderProducts('');
                    } else {
                        renderProducts(filter);
                    }
                });
            });
        }

        // escape بسيط
        function escapeHtml(s) {
            if (!s) return '';
            return String(s)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", "&#039;");
        }

        // إضافة مستمعي الأحداث الأساسية
        function addBasicEventListeners() {
            // أيقونة السلة - التحقق من وجود منتجات قبل فتح السلة
            document.getElementById('cart-icon').addEventListener('click', function() {
                if (cart.length === 0) {
                    showCartNotification('السلة فارغة');
                    return;
                }
                document.getElementById('cart-modal').classList.add('active');
            });
            
            // إغلاق السلة
            document.getElementById('close-cart').addEventListener('click', function() {
                document.getElementById('cart-modal').classList.remove('active');
            });
            
            // مواصلة التسوق
            document.getElementById('continue-shopping').addEventListener('click', function() {
                document.getElementById('cart-modal').classList.remove('active');
            });
            
            // إتمام الطلب عبر واتساب
            document.getElementById('checkout-whatsapp').addEventListener('click', function() {
                if (cart.length === 0) {
                    showCartNotification('السلة فارغة');
                    return;
                }
                
                let message = 'مرحباً، أريد طلب المنتجات التالية:\n\n';
                let total = 0;
                
                cart.forEach(item => {
                    const itemTotal = item.price * item.quantity;
                    total += itemTotal;
                    message += `- ${item.name} (${item.quantity} × ${item.price.toLocaleString()} ج.م) = ${itemTotal.toLocaleString()} ج.م\n`;
                });
                
                message += `\nالمجموع: ${total.toLocaleString()} ج.م`;
                
                message = escapeHtml(message);
                
                const phone = '201025555207';
                const encodedMessage = encodeURIComponent(message);
                const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
                
                window.open(whatsappUrl, '_blank');
            });
            
            // إغلاق نافذة المنتج
            document.getElementById('close-modal').addEventListener('click', closeModal);
            
            // إغلاق النوافذ عند النقر خارجها
            window.addEventListener('click', function(e) {
                const productModal = document.getElementById('product-modal');
                const cartModal = document.getElementById('cart-modal');
                
                if (e.target === productModal) {
                    closeModal();
                }
                
                if (e.target === cartModal) {
                    cartModal.classList.remove('active');
                }
            });
        }

        // استماع لحدث التخزين ليحدث التزامن بين تبويبات المتصفح
        function startStorageListener() {
            window.addEventListener('storage', (e) => {
                if (e.key === STORAGE_KEY) {
                    console.log('تم تحديث المنتجات من نافذة أخرى');
                    renderProducts(document.getElementById('top-search').value);
                }
            });
            
            // أيضًا استمع للتغييرات المحلية (للتأكد من التزامن في نفس النافذة)
            window.addEventListener('storageUpdated', () => {
                console.log('تم تحديث المنتجات محلياً');
                renderProducts(document.getElementById('top-search').value);
            });
        }

        // وظيفة الدخول السري للوحة التحكم
        function initAdminSecret() {
            // 1) فتح مباشرة إذا param موجود
            const url = new URL(location.href);
            if (url.searchParams.has('admin')) {
                location.href = 'admin.html';
                return;
            }
            
            // 2) منطقة السر في الفوتر — اضغط مطولًا لمدة 2000ms
            const secret = document.querySelector('.footer-secret');
            let pressTimer = null;
            
            if (secret) {
                secret.addEventListener('mousedown', startTimer);
                secret.addEventListener('touchstart', startTimer);
                secret.addEventListener('mouseup', clearTimer);
                secret.addEventListener('mouseleave', clearTimer);
                secret.addEventListener('touchend', clearTimer);
            }

            function startTimer(e) {
                e.preventDefault();
                pressTimer = setTimeout(() => { location.href = 'admin.html'; }, 2000);
            }
            
            function clearTimer() { 
                if (pressTimer) { 
                    clearTimeout(pressTimer); 
                    pressTimer = null; 
                } 
            }
        }

        // إدارة سلة التسوق
        let cart = JSON.parse(localStorage.getItem('azzam_cart')) || [];

        function addToCart(product) {
            const existingItem = cart.find(item => item.id === product.id);
            
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    quantity: 1
                });
            }
            
            updateCart();
            showCartNotification('تمت إضافة المنتج إلى السلة');
        }

        function updateCart() {
            localStorage.setItem('azzam_cart', JSON.stringify(cart));
            const cartCount = document.getElementById('cart-count');
            cartCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
            
            // إخفاء عداد السلة إذا كانت فارغة
            if (cart.length === 0) {
                cartCount.style.display = 'none';
            } else {
                cartCount.style.display = 'flex';
            }
            
            // تحديث عرض السلة
            const cartItems = document.getElementById('cart-items');
            const cartTotal = document.getElementById('cart-total');
            
            if (cart.length === 0) {
                cartItems.innerHTML = '<div class="empty-cart">السلة فارغة</div>';
                cartTotal.textContent = 'المجموع: 0 ج.م';
                // إخفاء السلة إذا كانت فارغة
                document.getElementById('cart-modal').classList.remove('active');
            } else {
                const fragment = document.createDocumentFragment();
                let total = 0;
                
                cart.forEach(item => {
                    const itemTotal = item.price * item.quantity;
                    total += itemTotal;
                    
                    const cartItem = document.createElement('div');
                    cartItem.className = 'cart-item';
                    cartItem.innerHTML = `
                        <div class="cart-item-info">
                            <img src="${item.image}" alt="${item.name}" class="cart-item-image" loading="lazy" width="50" height="50">
                            <div class="cart-item-details">
                                <h4>${item.name}</h4>
                                <div class="cart-item-price">${item.price.toLocaleString()} ج.م</div>
                            </div>
                        </div>
                        <div class="cart-item-actions">
                            <button class="quantity-btn decrease" data-id="${item.id}">-</button>
                            <span class="quantity">${item.quantity}</span>
                            <button class="quantity-btn increase" data-id="${item.id}">+</button>
                            <button class="remove-btn" data-id="${item.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    fragment.appendChild(cartItem);
                });
                
                cartItems.innerHTML = '';
                cartItems.appendChild(fragment);
                cartTotal.textContent = `المجموع: ${total.toLocaleString()} ج.م`;
                
                // إضافة مستمعي الأحداث للسلة
                addCartEventListeners();
            }
        }

        function addCartEventListeners() {
            // زيادة الكمية
            document.querySelectorAll('.increase').forEach(btn => {
                btn.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-id'));
                    const item = cart.find(item => item.id === productId);
                    if (item) {
                        item.quantity += 1;
                        updateCart();
                    }
                });
            });
            
            // تقليل الكمية
            document.querySelectorAll('.decrease').forEach(btn => {
                btn.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-id'));
                    const item = cart.find(item => item.id === productId);
                    if (item && item.quantity > 1) {
                        item.quantity -= 1;
                        updateCart();
                    } else if (item && item.quantity === 1) {
                        // إذا كانت الكمية 1، قم بحذف المنتج
                        cart = cart.filter(item => item.id !== productId);
                        updateCart();
                    }
                });
            });
            
            // حذف المنتج
            document.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-id'));
                    cart = cart.filter(item => item.id !== productId);
                    updateCart();
                });
            });
        }

        function showCartNotification(message) {
            // إنشاء إشعار مؤقت
            const notification = document.createElement('div');
            notification.className = 'cart-notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--success-color);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 1002;
                animation: fadeInOut 3s ease-in-out;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                max-width: 90%;
                text-align: center;
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }

        // إدارة النوافذ المنبثقة
        function closeModal() {
            document.getElementById('product-modal').style.display = 'none';
        }

        // إضافة أنيميشن للإشعار
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;

        document.head.appendChild(style);
