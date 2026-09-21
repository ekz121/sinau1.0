-- Match the bucket limit to the current Supabase Free project-wide upload cap.
-- Video duration is not constrained in the database or frontend.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4']
WHERE id = 'videos';
