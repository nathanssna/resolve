-- Fecha permissões que sobravam dos privilégios padrão do Supabase.
-- O RLS já barrava tudo isto; aqui fica a segunda camada.

-- Avaliações: só quem participou do serviço lê a linha (com client_id e order_id).
-- O perfil público usa get_professional_reviews (security definer, só o primeiro nome).
drop policy "reviews: leitura pública" on public.reviews;
create policy "reviews: participantes leem" on public.reviews
  for select to authenticated
  using ((select auth.uid()) = client_id or (select auth.uid()) = professional_id);
revoke all on public.reviews from anon;

-- Ninguém sem login escreve em nada; TRUNCATE ignora o RLS.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- Escritas que só acontecem pelas RPCs (security definer) ou pelo painel.
revoke insert, update, delete on public.services, public.support_threads, public.support_messages from authenticated;
revoke delete on public.conversations, public.messages, public.orders, public.professionals,
  public.profiles, public.proposals, public.reviews from authenticated;
revoke update on public.professional_services from authenticated;
