-- ============================================================
-- Dar3a Store — Supabase Database Schema
-- نفّذ هذا الملف في: Supabase Dashboard > SQL Editor
-- ============================================================

-- ---------- 1) المنتجات ----------
create table if not exists public.products (
    id text primary key,
    type text not null default 'movies',          -- movies | series | programs | pcgames | playstation | component
    name text not null,
    price numeric not null default 0,
    brand text,
    image text,
    description text,
    specs jsonb,                                   -- {"key":"value", ...}
    stock integer default 0,
    component_type text,                           -- cpu | motherboard | gpu | ram | storage | psu | case
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists products_type_idx on public.products (type);

-- ---------- 2) إعدادات المتجر (صف واحد) ----------
create table if not exists public.settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz default now()
);

-- ---------- 3) الكوبونات ----------
create table if not exists public.coupons (
    code text primary key,
    discount numeric not null default 0,           -- نسبة مئوية أو مبلغ ثابت
    type text default 'percent',                   -- percent | fixed
    expires_at timestamptz,
    active boolean default true,
    created_at timestamptz default now()
);

-- ---------- 4) الطلبات ----------
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_name text,
    customer_phone text,
    customer_address text,
    notes text,
    items jsonb not null,                          -- [{id,name,price,quantity}]
    total numeric default 0,
    payment_method text,                           -- cash | bankak | fawry
    status text default 'new',                     -- new | confirmed | delivered | cancelled
    date timestamptz default now()
);

-- ---------- 5) مشتركو النشرة البريدية ----------
create table if not exists public.subscribers (
    email text primary key,
    date timestamptz default now()
);

-- ---------- 6) جلسات الإدارة ----------
create table if not exists public.admin_sessions (
    token text primary key,
    expires_at timestamptz not null,
    created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security (RLS)
-- الواجهة الأمامية تستعلم عبر /api فقط (من الخادم)، لذا نُبقي
-- السياسات منفتحة للمفاتيح العامة في هذه النسخة البسيطة.
-- عدّلها لاحقاً حسب سياسة الأمان التي تفضلها.
-- ============================================================
alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.subscribers enable row level security;
alter table public.admin_sessions enable row level security;

do $$
declare t text;
begin
    foreach t in array array['products','settings','coupons','orders','subscribers','admin_sessions'] loop
        execute format('drop policy if exists "anon_all_%s" on public.%I', t, t);
        execute format('create policy "anon_all_%s" on public.%I for all using (true) with check (true)', t, t);
    end loop;
end $$;

-- ============================================================
-- بيانات البداية (اختيارية) — إعدادات المتجر الافتراضية
-- ============================================================
insert into public.settings (key, value)
values (
    'site_settings',
    '{
        "name": "Dar3a Store",
        "tagline": "أفلام • مسلسلات • برامج هندسية • ألعاب — كل ما تحتاجه في مكان واحد",
        "currency": "ج.س",
        "phone": "0922265656",
        "whatsapp": "249922265656",
        "address": "السودان - أمدرمان",
        "hours": "يومياً 10 ص - 10 م",
        "website": "https://dar3a-store.vercel.app",
        "primaryColor": "#e63946",
        "secondaryColor": "#ff6b6b",
        "logoIcon": "fa-shield-halved",
        "mainLogo": "",
        "favicon": "",
        "bgAnimation": "particles",
        "developerName": "Mohamed Elnil",
        "developerUrl": "https://me-one-blue.vercel.app/about.html",
        "copyright": "© 2026 Dar3a Store",
        "chatbotUrl": "chat-bot.html"
    }'::jsonb
)
on conflict (key) do nothing;
