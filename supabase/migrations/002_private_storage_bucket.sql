-- Make diagram-images bucket private (no anonymous public access)
update storage.buckets
set public = false
where id = 'diagram-images';

-- Drop the old public read policy
drop policy if exists "Public read for diagram images" on storage.objects;

-- Users can only read their own uploaded images (files under their user_id/ folder)
create policy "Users can read own diagram images"
  on storage.objects for select
  using (
    bucket_id = 'diagram-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
