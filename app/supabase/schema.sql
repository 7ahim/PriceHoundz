-- ============================================================
--  PriceHound — Supabase Schema
--  Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Enable UUID generation ───────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── profiles ─────────────────────────────────────────────────
-- Mirrors auth.users; auto-created on first sign-in via trigger
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

-- ── tracked_products ─────────────────────────────────────────
create table if not exists public.tracked_products (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  url           text not null,
  name          text,
  image_url     text,
  platform      text,                        -- 'amazon' | 'flipkart' | 'myntra' | 'other'
  target_price  numeric(12, 2) not null,
  current_price numeric(12, 2),
  is_active     boolean default true not null,
  notify_sent   boolean default false not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- ── price_history ─────────────────────────────────────────────
create table if not exists public.price_history (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.tracked_products(id) on delete cascade,
  price       numeric(12, 2) not null,
  scraped_at  timestamptz default now() not null
);

-- ── notification_log ──────────────────────────────────────────
create table if not exists public.notification_log (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.tracked_products(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  sent_at     timestamptz default now() not null,
  price       numeric(12, 2) not null,        -- price at time of notification
  email       text not null
);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_tracked_products_user_id  on public.tracked_products(user_id);
create index if not exists idx_price_history_product_id  on public.price_history(product_id);
create index if not exists idx_price_history_scraped_at  on public.price_history(scraped_at desc);
create index if not exists idx_notification_log_user_id  on public.notification_log(user_id);

-- ── updated_at trigger ────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.tracked_products;
create trigger set_updated_at
  before update on public.tracked_products
  for each row execute function public.handle_updated_at();

-- ── Auto-create profile on signup ────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security (RLS) ──────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.tracked_products   enable row level security;
alter table public.price_history      enable row level security;
alter table public.notification_log   enable row level security;

-- profiles: users can only see and edit their own row
create policy "profiles: select own"  on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own"  on public.profiles for update using (auth.uid() = id);

-- tracked_products: full CRUD for own rows only
create policy "products: select own"  on public.tracked_products for select using (auth.uid() = user_id);
create policy "products: insert own"  on public.tracked_products for insert with check (auth.uid() = user_id);
create policy "products: update own"  on public.tracked_products for update using (auth.uid() = user_id);
create policy "products: delete own"  on public.tracked_products for delete using (auth.uid() = user_id);

-- price_history: readable if the user owns the product
create policy "price_history: select own" on public.price_history for select
  using (
    exists (
      select 1 from public.tracked_products tp
      where tp.id = price_history.product_id
        and tp.user_id = auth.uid()
    )
  );

-- service role can insert price_history (used by cron scraper)
create policy "price_history: service insert" on public.price_history for insert
  with check (true);  -- restricted to service_role key via server-side only

-- notification_log: select own
create policy "notif_log: select own" on public.notification_log for select using (auth.uid() = user_id);
create policy "notif_log: service insert" on public.notification_log for insert with check (true);
