-- =============================================================================
-- Contato escondido no chat antes de combinar.
--
-- O telefone de cada um só é liberado depois do aceite (get_contact_phone). Sem esta
-- regra, bastava escrever o número no chat para combinar por fora. Agora, enquanto a
-- conversa não tem serviço combinado ou concluído, o banco troca por "[contato oculto]":
--   * telefone, CPF e outros números com 8 algarismos ou mais (menos CEP e valor com milhar);
--   * e-mail, @perfil e links de WhatsApp, Telegram, Instagram e Facebook.
-- Vale para mensagens de texto, a descrição do pedido e a observação da proposta.
-- As mesmas regras estão em src/utils/contact.ts (o app avisa enquanto a pessoa digita).
-- Mensagens antigas não são alteradas.
-- =============================================================================

create function private.hide_contact(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := p_text;
  m text;
begin
  if v is null then
    return null;
  end if;
  v := regexp_replace(v, '(https?://)?(www\.)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|instagram\.com|facebook\.com)/[^[:space:]]*', '[contato oculto]', 'gi');
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contato oculto]', 'g');
  v := regexp_replace(v, '(^|[^A-Za-z0-9_.])@[A-Za-z0-9._]{3,}', '\1[contato oculto]', 'g');
  for m in select (regexp_matches(v, '\+?\(?[0-9][0-9[:space:].()-]{6,}[0-9]', 'g'))[1] loop
    if length(regexp_replace(m, '[^0-9]', '', 'g')) >= 8
      and m !~ '^[0-9]{5}-[0-9]{3}$'
      and m !~ '^[0-9]{1,3}(\.[0-9]{3})+$' then
      v := replace(v, m, '[contato oculto]');
    end if;
  end loop;
  return v;
end;
$$;

create function private.hide_contact_before_deal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders o
    where o.conversation_id = new.conversation_id and o.status in ('combinado', 'concluido')
  ) then
    return new;
  end if;
  if tg_table_name = 'messages' then
    if new.kind in ('text', 'request') then
      new.body := left(private.hide_contact(new.body), 4000);
    end if;
  else
    new.note := left(private.hide_contact(new.note), 1000);
  end if;
  return new;
end;
$$;

revoke all on function private.hide_contact(text) from public, anon, authenticated;
revoke all on function private.hide_contact_before_deal() from public, anon, authenticated;

create trigger messages_hide_contact
  before insert on public.messages
  for each row execute function private.hide_contact_before_deal();

create trigger proposals_hide_contact
  before insert on public.proposals
  for each row execute function private.hide_contact_before_deal();
