-- =============================================================================
-- Fotos (pedido e perfil) e notificações push.
--
-- Fotos do pedido: bucket privado `request-photos`, caminho
--   <conversation_id>/<arquivo>.jpg — só o cliente da conversa envia, só os
--   dois participantes veem (o app usa URLs assinadas).
-- Foto de perfil: bucket público `avatars`, caminho <user_id>/<arquivo>.
--
-- Push: cada mensagem nova vira uma notificação para o outro participante,
-- enviada à API de push da Expo pelo pg_net (assíncrono, depois do commit).
-- Nunca impede a mensagem de ser gravada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fotos no pedido
-- -----------------------------------------------------------------------------

alter table public.messages
  add column photos text[] not null default '{}',
  add constraint messages_photos_max check (cardinality(photos) <= 4),
  add constraint messages_photos_only_request check (kind = 'request' or cardinality(photos) = 0);

comment on column public.messages.photos is 'Caminhos no bucket request-photos (<conversation_id>/<arquivo>). Só em mensagens request.';

-- As fotos precisam estar na pasta da própria conversa.
drop policy "messages: participantes escrevem" on public.messages;
create policy "messages: participantes escrevem" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id)
    and (
      kind = 'text'
      or (
        kind = 'request'
        and exists (
          select 1 from public.conversations c
          where c.id = messages.conversation_id and c.client_id = (select auth.uid())
        )
      )
    )
    and not exists (select 1 from unnest(photos) as p(path) where p.path not like conversation_id::text || '/%')
  );

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('request-photos', 'request-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "request-photos: cliente da conversa envia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-photos'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1] and c.client_id = (select auth.uid())
    )
  );

create policy "request-photos: participantes veem" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1] and (select auth.uid()) in (c.client_id, c.professional_id)
    )
  );

create policy "request-photos: quem enviou apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'request-photos' and owner_id = (select auth.uid())::text);

create policy "avatars: leitura pública" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars: o dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: o dono troca" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: o dono apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Push
-- -----------------------------------------------------------------------------

create extension if not exists pg_net;

create function private.push_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_recipients uuid[];
  v_title text;
  v_body text;
  v_payload jsonb;
begin
  begin
    select * into v_conv from public.conversations where id = new.conversation_id;

    if new.sender_id is not null then
      -- Mensagem de alguém: avisa o outro participante.
      v_recipients := array_remove(array[v_conv.client_id, v_conv.professional_id], new.sender_id);
      select nullif(btrim(p.full_name), '') into v_title from public.profiles p where p.id = new.sender_id;
    else
      -- Mensagem de sistema (aceite, conclusão…): avisa quem não fez a ação.
      v_recipients := array_remove(array[v_conv.client_id, v_conv.professional_id], auth.uid());
    end if;

    v_body := case new.kind
      when 'text' then left(new.body, 180)
      when 'request' then 'Novo pedido de orçamento: ' || left(new.body, 140)
      when 'proposal' then (
        select 'Proposta: ' || private.format_brl(p.amount) || ' · ' || p.scheduled_label
        from public.proposals p where p.id = new.proposal_id
      )
      when 'system' then new.body
    end;

    select jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', coalesce(v_title, 'Resolve'),
      'body', coalesce(v_body, 'Nova mensagem'),
      'sound', 'default',
      'channelId', 'mensagens',
      'data', jsonb_build_object('url', '/chat/' || v_conv.id, 'conversationId', v_conv.id)
    ))
    into v_payload
    from public.push_tokens t
    where t.user_id = any(v_recipients);

    if v_payload is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_payload,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    raise warning 'push_on_message: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.push_on_message() from public, anon, authenticated;

create trigger messages_push
  after insert on public.messages
  for each row execute function private.push_on_message();

-- O app apaga o token deste aparelho ao sair da conta.
-- (push_tokens já tem a política "só o dono" para all.)
