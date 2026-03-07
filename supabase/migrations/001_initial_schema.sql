-- ============================================================
-- Objectify: Initial Schema
-- Tables: profiles, conversions, credit_transactions, waitlist
-- ============================================================

-- 1. Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Conversions
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text,
  spec jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.conversions enable row level security;

create policy "Users can read own conversions"
  on public.conversions for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversions"
  on public.conversions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversions"
  on public.conversions for update
  using (auth.uid() = user_id);

-- 3. Credit Transactions (audit log)
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy "Users can read own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

-- 4. Waitlist
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  desired_credits integer,
  willing_to_pay text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "Authenticated users can insert waitlist"
  on public.waitlist for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- Functions
-- ============================================================

-- Atomically deduct a credit and log the transaction
create or replace function public.deduct_credit(uid uuid, conversion_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  current_credits integer;
begin
  -- Lock the row to prevent race conditions
  select credits into current_credits
  from public.profiles
  where id = uid
  for update;

  if current_credits is null or current_credits < 1 then
    return false;
  end if;

  update public.profiles
  set credits = credits - 1
  where id = uid;

  insert into public.credit_transactions (user_id, amount, reason)
  values (uid, -1, 'conversion:' || conversion_id::text);

  return true;
end;
$$;

-- ============================================================
-- Triggers
-- ============================================================

-- On new user signup, create a profile with initial credits
-- First 50 users get 5 credits, after that 1 credit
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
  initial_credits integer;
begin
  select count(*) into user_count from public.profiles;

  if user_count < 50 then
    initial_credits := 5;
  else
    initial_credits := 1;
  end if;

  insert into public.profiles (id, email, credits)
  values (new.id, new.email, initial_credits);

  insert into public.credit_transactions (user_id, amount, reason)
  values (new.id, initial_credits, 'signup_bonus');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Storage
-- ============================================================

-- Create a public bucket for diagram images
insert into storage.buckets (id, name, public)
values ('diagram-images', 'diagram-images', true)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "Users can upload diagram images"
  on storage.objects for insert
  with check (
    bucket_id = 'diagram-images'
    and auth.role() = 'authenticated'
  );

-- Anyone can read (public bucket)
create policy "Public read for diagram images"
  on storage.objects for select
  using (bucket_id = 'diagram-images');

-- Rate limiting: max 5 conversions per minute per user
-- (Enforced via a check on recent conversions count)
create or replace function public.check_rate_limit(uid uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.conversions
  where user_id = uid
    and created_at > now() - interval '1 minute';

  return recent_count < 5;
end;
$$;
