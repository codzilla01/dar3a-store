-- ============================================================
-- Dar3a Store — Production schema and security migration
-- Run this entire file in Supabase SQL Editor using the project owner.
-- The browser NEVER receives the service_role key. All access is via /api.
-- ============================================================

create extension if not exists pgcrypto;

-- Store catalogue -----------------------------------------------------------
create table if not exists public.products (
    id text primary key,
    type text not null default 'movies',
    name text not null,
    price numeric(14,2) not null default 0 check (price >= 0),
    brand text,
    image text,
    description text,
    specs jsonb not null default '{}'::jsonb,
    stock integer not null default 0 check (stock >= 0),
    component_type text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists products_type_idx on public.products (type);

create table if not exists public.settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
    code text primary key,
    discount numeric(14,2) not null check (discount > 0),
    type text not null default 'percent' check (type in ('percent', 'fixed')),
    min_order numeric(14,2) not null default 0 check (min_order >= 0),
    expires_at timestamptz,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
alter table public.coupons add column if not exists min_order numeric(14,2) not null default 0;
alter table public.coupons add column if not exists expires_at timestamptz;

-- Customer order data -------------------------------------------------------
create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_name text not null,
    customer_phone text not null,
    customer_address text,
    notes text,
    items jsonb not null,
    subtotal numeric(14,2) not null default 0,
    discount numeric(14,2) not null default 0,
    total numeric(14,2) not null default 0,
    coupon text,
    payment_method text not null default 'cash' check (payment_method in ('cash', 'bankak', 'fawry')),
    status text not null default 'new' check (status in ('new', 'confirmed', 'delivered', 'cancelled')),
    date timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists subtotal numeric(14,2) not null default 0;
alter table public.orders add column if not exists discount numeric(14,2) not null default 0;
alter table public.orders add column if not exists coupon text;
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- Newsletter ---------------------------------------------------------------
create table if not exists public.subscribers (
    email text primary key,
    date timestamptz not null default now(),
    created_at timestamptz not null default now()
);
alter table public.subscribers add column if not exists created_at timestamptz not null default now();

-- Back-office accounts. Passwords are bcrypt hashes only. ------------------
create table if not exists public.admin_users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique check (username = lower(username)),
    display_name text not null,
    role text not null check (role in ('super_admin', 'admin', 'developer')),
    password_hash text not null,
    is_active boolean not null default true,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists admin_users_active_idx on public.admin_users (username, is_active);

-- Annual client subscription and activation tracking ----------------------
create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    client_name text not null,
    contact_name text,
    contact_email text,
    contact_phone text,
    domain text not null unique,
    plan text not null default 'annual' check (plan = 'annual'),
    status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),
    starts_at timestamptz,
    expires_at timestamptz,
    activation_key_hash text unique,
    activation_count integer not null default 0 check (activation_count >= 0),
    last_activated_at timestamptz,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists subscriptions_status_expiry_idx on public.subscriptions (status, expires_at);

create table if not exists public.subscription_events (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.subscriptions(id) on delete cascade,
    action text not null,
    actor_id uuid references public.admin_users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists subscription_events_subscription_idx on public.subscription_events (subscription_id, created_at desc);

-- Atomically validates prices, coupon, and inventory. It never accepts a
-- client-provided price, name, or order total.
create or replace function public.create_store_order(
    p_customer_name text,
    p_customer_phone text,
    p_customer_address text,
    p_notes text,
    p_payment_method text,
    p_items jsonb,
    p_coupon text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_item jsonb;
    v_product public.products%rowtype;
    v_coupon public.coupons%rowtype;
    v_quantity integer;
    v_subtotal numeric(14,2) := 0;
    v_discount numeric(14,2) := 0;
    v_total numeric(14,2);
    v_items jsonb := '[]'::jsonb;
    v_order public.orders%rowtype;
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'ORDER_ITEMS_REQUIRED';
    end if;

    for v_item in select value from jsonb_array_elements(p_items) loop
        begin
            v_quantity := (v_item->>'quantity')::integer;
        exception when others then
            raise exception 'INVALID_ITEM_QUANTITY';
        end;
        if v_quantity < 1 or v_quantity > 20 then raise exception 'INVALID_ITEM_QUANTITY'; end if;

        select * into v_product from public.products where id = v_item->>'id' for update;
        if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
        if v_product.stock < v_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;

        update public.products set stock = stock - v_quantity, updated_at = now() where id = v_product.id;
        v_subtotal := v_subtotal + (v_product.price * v_quantity);
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'id', v_product.id, 'name', v_product.name, 'price', v_product.price, 'quantity', v_quantity
        ));
    end loop;

    if nullif(trim(coalesce(p_coupon, '')), '') is not null then
        select * into v_coupon from public.coupons
        where code = upper(trim(p_coupon)) and active = true and (expires_at is null or expires_at > now())
        for update;
        if not found or v_subtotal < v_coupon.min_order then raise exception 'INVALID_COUPON'; end if;
        if v_coupon.type = 'percent' then
            v_discount := round(v_subtotal * v_coupon.discount / 100, 2);
        else
            v_discount := v_coupon.discount;
        end if;
        v_discount := least(v_discount, v_subtotal);
    end if;

    v_total := v_subtotal - v_discount;
    insert into public.orders (
        customer_name, customer_phone, customer_address, notes, items, subtotal, discount, total, coupon,
        payment_method, status, date, created_at, updated_at
    ) values (
        p_customer_name, p_customer_phone, nullif(p_customer_address, ''), nullif(p_notes, ''), v_items,
        v_subtotal, v_discount, v_total, case when v_coupon.code is null then null else v_coupon.code end,
        p_payment_method, 'new', now(), now(), now()
    ) returning * into v_order;

    return jsonb_build_object(
        'id', v_order.id, 'items', v_order.items, 'subtotal', v_order.subtotal,
        'discount', v_order.discount, 'total', v_order.total, 'coupon', v_order.coupon,
        'payment_method', v_order.payment_method, 'status', v_order.status, 'created_at', v_order.created_at
    );
end;
$$;

-- Remove the old insecure anonymous policies, enable RLS, then revoke all
-- direct anon/authenticated access. service_role (server-side only) bypasses RLS.
do $$
declare
    target text;
    policy_name text;
begin
    foreach target in array array['products','settings','coupons','orders','subscribers','admin_sessions','admin_users','subscriptions','subscription_events'] loop
        if to_regclass('public.' || target) is not null then
            for policy_name in select policyname from pg_policies where schemaname = 'public' and tablename = target loop
                execute format('drop policy if exists %I on public.%I', policy_name, target);
            end loop;
            execute format('alter table public.%I enable row level security', target);
            execute format('alter table public.%I force row level security', target);
        end if;
    end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function public.create_store_order(text, text, text, text, text, jsonb, text) from public, anon, authenticated;

-- Default public visual settings. Replace these through the super-admin UI.
insert into public.settings (key, value)
values ('site_settings', '{
    "name": "Dar3a Store",
    "tagline": "أفلام • مسلسلات • برامج هندسية • ألعاب",
    "currency": "ج.س",
    "phone": "0922265656",
    "whatsapp": "249922265656",
    "address": "السودان - أمدرمان",
    "hours": "يومياً 10 ص - 10 م",
    "primaryColor": "#e63946",
    "secondaryColor": "#ff6b6b",
    "logoIcon": "fa-shield-halved",
    "developerName": "Dar3a Developer",
    "developerUrl": "developer.html",
    "copyright": "© 2026 Dar3a Store",
    "chatbotUrl": "chat-bot.html"
}'::jsonb)
on conflict (key) do nothing;

-- Create the first super-admin safely after this migration:
-- npm run bootstrap-admin -- <username> <strong-password> <display-name>
