-- =============================================================================
-- O profissional pausa o recebimento de pedidos (férias, agenda cheia).
--
-- Pausado, ele some das listas do app e não recebe conversa nem pedido novo.
-- O que já está em andamento (chat, propostas, serviços combinados) continua.
-- =============================================================================

alter table public.professionals add column paused boolean not null default false;

comment on column public.professionals.paused is 'Pausou o recebimento de pedidos: fora das listas, sem conversa nem pedido novo.';

grant select (paused) on public.professionals to anon, authenticated;
grant update (paused) on public.professionals to authenticated;

create function private.check_professional_accepting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro uuid;
begin
  if tg_table_name = 'conversations' then
    -- open_conversation insere com "on conflict do nothing": conversa que já existe segue abrindo.
    if exists (
      select 1 from public.conversations c
      where c.client_id = new.client_id and c.professional_id = new.professional_id
    ) then
      return new;
    end if;
    v_pro := new.professional_id;
  else
    select c.professional_id into v_pro from public.conversations c where c.id = new.conversation_id;
  end if;

  if exists (select 1 from public.professionals p where p.id = v_pro and p.paused) then
    raise exception 'Este profissional não está recebendo pedidos no momento' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_professional_accepting() from public, anon, authenticated;

create trigger conversations_professional_accepting before insert on public.conversations
  for each row execute function private.check_professional_accepting();

create trigger requests_professional_accepting before insert on public.requests
  for each row execute function private.check_professional_accepting();
