-- 005_wallets.sql: Safe wallet identity for anonymous-first auth
-- Each user gets a counterfactual Safe (Gnosis Safe) address on Base.
-- The app's master key is the sole owner; no private keys stored in DB.

-- 1. Wallets table
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  address text not null unique,
  salt_nonce text not null,
  created_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

-- Users can read their own wallet
create policy "Users can read own wallet"
  on public.wallets for select
  using (auth.uid() = profile_id);

-- Only service_role (edge functions) can insert wallets
create policy "Service role can insert wallets"
  on public.wallets for insert
  with check (false);

-- 2. Add wallet_address to profiles for quick display
alter table public.profiles add column if not exists wallet_address text;
