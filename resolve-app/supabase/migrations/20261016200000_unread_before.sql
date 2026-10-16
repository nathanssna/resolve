-- =============================================================================
-- Não lidas além das mensagens carregadas.
--
-- O app carrega as 50 mensagens mais recentes de cada conversa e contava as não
-- lidas só entre elas (60 não lidas apareciam como 50). Esta função conta as não
-- lidas ANTERIORES a um ponto (o começo do trecho carregado): esse número não muda
-- com mensagens novas, então o app soma com o que já tem na tela.
-- Conta como no app: tudo o que não foi escrito por quem pergunta (inclui avisos
-- do sistema), depois da última leitura dele.
-- =============================================================================

create function public.unread_before(p_conversation_id uuid, p_before timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  join public.messages m on m.conversation_id = c.id
  where c.id = p_conversation_id
    and (select auth.uid()) in (c.client_id, c.professional_id)
    and m.sender_id is distinct from (select auth.uid())
    and m.created_at < p_before
    and m.created_at > coalesce(
      case when (select auth.uid()) = c.client_id then c.client_last_read_at else c.professional_last_read_at end,
      '-infinity'
    );
$$;

revoke execute on function public.unread_before(uuid, timestamptz) from public, anon;
grant execute on function public.unread_before(uuid, timestamptz) to authenticated;
