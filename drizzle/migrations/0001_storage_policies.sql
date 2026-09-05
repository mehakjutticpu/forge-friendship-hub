CREATE POLICY "auth read chat media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('chat-media','avatars'));
CREATE POLICY "auth upload own media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('chat-media','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth update own media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('chat-media','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "auth delete own media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('chat-media','avatars') AND (storage.foldername(name))[1] = auth.uid()::text);