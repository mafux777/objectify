-- Deposit ledger: track USDC deposits already converted to credits.
-- Enables keyless credit granting by comparing on-chain balance to ledger.

create table public.deposit_ledger (
  wallet_address text primary key references public.wallets(address) on delete cascade,
  credited_usdc_raw bigint not null default 0,
  last_checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deposit_ledger enable row level security;

create policy "Users can read own deposit ledger"
  on public.deposit_ledger for select
  using (
    wallet_address in (
      select address from public.wallets where profile_id = auth.uid()
    )
  );

-- Atomically credit a user for new USDC deposits.
-- Compares on-chain balance against previously credited amount,
-- grants 10 credits per 1 USDC, and carries forward fractional USDC.
-- Returns the number of credits added (0 if no new deposit).
create or replace function public.credit_deposit(wallet_addr text, new_usdc_raw bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_old_credited bigint;
  v_delta bigint;
  v_credits_to_add integer;
begin
  -- Look up the profile that owns this wallet
  select profile_id into v_profile_id
  from public.wallets
  where address = wallet_addr;

  if v_profile_id is null then
    return 0;
  end if;

  -- Get current credited amount (0 if no ledger entry yet)
  select credited_usdc_raw into v_old_credited
  from public.deposit_ledger
  where wallet_address = wallet_addr
  for update;

  v_old_credited := coalesce(v_old_credited, 0);
  v_delta := new_usdc_raw - v_old_credited;

  if v_delta <= 0 then
    -- Update last_checked_at even if no new deposit
    insert into public.deposit_ledger (wallet_address, credited_usdc_raw, last_checked_at, updated_at)
    values (wallet_addr, v_old_credited, now(), now())
    on conflict (wallet_address) do update
      set last_checked_at = now();
    return 0;
  end if;

  -- 10 credits per 1 USDC (1_000_000 raw units)
  -- floor(delta / 100_000) = delta * 10 / 1_000_000 truncated
  v_credits_to_add := (v_delta / 100000)::integer;

  if v_credits_to_add <= 0 then
    -- Fractional deposit too small to convert yet
    insert into public.deposit_ledger (wallet_address, credited_usdc_raw, last_checked_at, updated_at)
    values (wallet_addr, v_old_credited, now(), now())
    on conflict (wallet_address) do update
      set last_checked_at = now();
    return 0;
  end if;

  -- Lock the profile row and add credits
  update public.profiles
  set credits = credits + v_credits_to_add
  where id = v_profile_id;

  -- Update ledger: only credit the amount actually converted (fractional carries forward)
  insert into public.deposit_ledger (wallet_address, credited_usdc_raw, last_checked_at, updated_at)
  values (wallet_addr, v_old_credited + v_credits_to_add::bigint * 100000, now(), now())
  on conflict (wallet_address) do update
    set credited_usdc_raw = v_old_credited + v_credits_to_add::bigint * 100000,
        last_checked_at = now(),
        updated_at = now();

  -- Audit log
  insert into public.credit_transactions (user_id, amount, reason)
  values (v_profile_id, v_credits_to_add, 'usdc_deposit');

  return v_credits_to_add;
end;
$$;
