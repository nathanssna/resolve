-- =============================================================================
-- Avaliações no Realtime.
--
-- Sem isto, o profissional só via a avaliação do cliente (e a nota nova)
-- depois de recarregar o app. O app assina só as avaliações dele
-- (filtro professional_id / client_id), não todas.
-- =============================================================================

alter publication supabase_realtime add table public.reviews;
