-- Fix credit allocation: anonymous users get 0 credits.
-- Sign-up bonus is granted when they link an identity.
-- "First 50" is counted against real (non-anonymous) sign-ups only.

-- 1. Update handle_new_user: anonymous users get 0 credits
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  real_user_count integer;
  initial_credits integer;
begin
  if new.is_anonymous then
    -- Anonymous users get 0 credits (Create from Prompt is free)
    initial_credits := 0;
  else
    -- Count only non-anonymous users for the "first 50" check
    select count(*) into real_user_count
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.is_anonymous = false;

    if real_user_count < 50 then
      initial_credits := 5;
    else
      initial_credits := 1;
    end if;
  end if;

  insert into public.profiles (id, email, credits)
  values (new.id, new.email, initial_credits);

  insert into public.credit_transactions (user_id, amount, reason)
  values (new.id, initial_credits, case
    when new.is_anonymous then 'anonymous_session'
    else 'signup_bonus'
  end);

  return new;
end;
$$;

-- 2. Grant sign-up bonus when anonymous user links identity
--    (is_anonymous flips from true to false via updateUser or linkIdentity)
create or replace function public.handle_identity_linked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  real_user_count integer;
  bonus integer;
begin
  -- Count non-anonymous users for "first 50" check
  select count(*) into real_user_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.is_anonymous = false;

  if real_user_count < 50 then
    bonus := 5;
  else
    bonus := 1;
  end if;

  -- Add bonus credits to the now-linked profile
  update public.profiles
  set credits = credits + bonus
  where id = new.id;

  insert into public.credit_transactions (user_id, amount, reason)
  values (new.id, bonus, 'signup_bonus');

  return new;
end;
$$;

create trigger on_identity_linked
  after update on auth.users
  for each row
  when (old.is_anonymous = true and new.is_anonymous = false)
  execute function public.handle_identity_linked();
