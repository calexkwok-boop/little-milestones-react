create policy "Allow authenticated uploads to own media folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
