-- Prevent users from changing their own role via the profiles update policy.
-- The existing policy "Users can update own profile" allows all columns.
-- Replace it with one that excludes the role column.

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    -- role must remain unchanged
    role = (select role from public.profiles where id = auth.uid())
  );
