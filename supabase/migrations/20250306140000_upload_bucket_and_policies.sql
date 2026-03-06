-- Upload bucket and storage policies for Console brand asset uploads.
-- Console uses NEXT_PUBLIC_SUPABASE_ANON_KEY; uploads go to upload/brands/{brand_id}/assets/.
-- Run this migration so the Console "Upload files" in Brand Identity works.

-- Create the upload bucket if it does not exist (public so getPublicUrl works without signed URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('upload', 'upload', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Idempotent: drop if exists then create (safe to re-run).
DROP POLICY IF EXISTS "upload_brands_insert_anon" ON storage.objects;
DROP POLICY IF EXISTS "upload_select_anon" ON storage.objects;
DROP POLICY IF EXISTS "upload_brands_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "upload_select_authenticated" ON storage.objects;

-- Allow anon (Console with anon key) to INSERT into upload bucket under brands/
CREATE POLICY "upload_brands_insert_anon"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'upload'
  AND (storage.foldername(name))[1] = 'brands'
);

-- Allow anon to SELECT (read) from upload bucket so public URLs and thumbnails work
CREATE POLICY "upload_select_anon"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'upload');

-- Allow authenticated users same access (for future auth-backed Console)
CREATE POLICY "upload_brands_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'upload'
  AND (storage.foldername(name))[1] = 'brands'
);

CREATE POLICY "upload_select_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'upload');
