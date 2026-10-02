-- =============================================================================
-- Avatares: ninguém lista o bucket.
--
-- A política "leitura pública" permitia LISTAR todos os arquivos de `avatars`
-- pela API do Storage (enumerar as fotos de todos os usuários). Bucket público
-- já serve cada arquivo pelo link público sem política de select; o select só
-- é necessário para o próprio dono trocar a foto (upsert).
-- =============================================================================

drop policy "avatars: leitura pública" on storage.objects;

create policy "avatars: o dono vê a própria pasta" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
