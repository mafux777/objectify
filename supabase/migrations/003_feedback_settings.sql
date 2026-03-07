-- ============================================================
-- Shared Feedback & Account Deletion
-- ============================================================

-- 1. Shared feedback table — users share diagram context with the developer
create table public.shared_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  document_title text,
  diagram_spec jsonb not null,
  chat_history jsonb default '[]',
  feedback_messages jsonb default '[]',
  user_comment text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.shared_feedback enable row level security;

-- Users can insert their own feedback
create policy "Users insert own feedback"
  on public.shared_feedback for insert
  with check (auth.uid() = user_id);

-- Users can view their own submissions
create policy "Users view own feedback"
  on public.shared_feedback for select
  using (auth.uid() = user_id);

-- 2. Account deletion function
-- Deletes all user data across tables, storage, and auth
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
as $$
begin
  -- Delete from app tables (order matters for FK constraints)
  delete from public.shared_feedback where user_id = auth.uid();
  delete from public.credit_transactions where user_id = auth.uid();
  delete from public.conversions where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();

  -- Delete uploaded images from storage
  delete from storage.objects
    where bucket_id = 'diagram-images'
    and (storage.foldername(name))[1] = auth.uid()::text;

  -- Finally, delete the auth user itself
  delete from auth.users where id = auth.uid();
end;
$$;
