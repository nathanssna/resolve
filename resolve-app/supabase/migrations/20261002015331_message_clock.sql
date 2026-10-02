-- =============================================================================
-- Ordem das mensagens dentro da mesma transação.
--
-- now() é o horário de início da transação: a mensagem de sistema do aceite e
-- outras mensagens criadas no mesmo comando ficavam com o mesmo created_at e
-- apareciam em ordem aleatória no chat. clock_timestamp() avança a cada linha.
-- =============================================================================

create or replace function private.before_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.before_message_insert() from public, anon, authenticated;
