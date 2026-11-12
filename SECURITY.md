# Security Policy — Dar3a Store

## Supported versions

| Version | Supported |
|---|---|
| 1.x production hardening release | ✅ |

## Security model

- بيانات Supabase لا تصل من المتصفح مباشرة. الخادم فقط يستخدم `SUPABASE_SERVICE_KEY`.
- يتم رفض الوصول المباشر لجداول Supabase من أدوار `anon` و`authenticated` بواسطة RLS والصلاحيات في `schema.sql`.
- الدخول الإداري باسم مستخدم وكلمة مرور bcrypt، والجلسة JWT في Cookie `HttpOnly` و`SameSite=Strict` و`Secure` في الإنتاج.
- صلاحيات الخادم: `super_admin` و`admin` و`developer`.
- واجهات الإدارة الحساسة محمية على الخادم؛ إخفاء عناصر الواجهة ليس طبقة الصلاحيات.
- حساب إجمالي الطلب والمخزون والكوبون يتم في PostgreSQL؛ لا يقبل الخادم سعر المتصفح.
- تطبيق rate limiting على API العام وتسجيل الدخول، مع CSP وHelmet وحد للحجم والتحقق من المدخلات.
- مفاتيح تفعيل الاشتراكات تحفظ كـ SHA-256 hash ولا تعرض إلا مرة واحدة عند الإنشاء.

## مسؤوليات النشر

1. لا تستخدم `ALLOW_DEMO_MODE=true` خارج جهاز التطوير.
2. لا تضع `SUPABASE_SERVICE_KEY` أو `ADMIN_JWT_SECRET` في HTML أو JavaScript أو Git.
3. استخدم `openssl rand -hex 32` لإنشاء `ADMIN_JWT_SECRET` جديد لكل عميل.
4. أنشئ حساب Super Admin بالأمر `npm run bootstrap-admin` وبكلمة مرور فريدة من 12 حرفاً على الأقل.
5. راجع RLS بعد كل تغيير في schema ولا تنشئ سياسات `USING (true)` للجداول الحساسة.
6. فعّل MFA في حسابات GitHub وVercel وSupabase، وخذ نسخاً احتياطية منتظمة.
7. حدّث الحزم وشغّل `npm audit --omit=dev --audit-level=high` دورياً.
8. استخدم HTTPS ونطاق العميل قبل أي استخدام حقيقي.

## Reporting a vulnerability

لا تنشر الثغرة علناً قبل إصلاحها. أرسل وصفاً واضحاً، خطوات إعادة الإنتاج، الأثر المتوقع، وأي إثبات آمن إلى مالك المشروع أو المطور عبر القنوات الرسمية في `الروابط.txt`. سنؤكد الاستلام خلال 72 ساعة.
