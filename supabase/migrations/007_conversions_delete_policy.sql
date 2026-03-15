-- Add missing DELETE policy for conversions table.
-- Without this, RLS silently blocks all deletes.
create policy "Users can delete own conversions"
  on public.conversions for delete
  using (auth.uid() = user_id);
