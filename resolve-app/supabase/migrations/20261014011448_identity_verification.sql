-- =============================================================================
-- Verificação de identidade do profissional (selo "Verificado"), manual.
--
-- O profissional envia, com consentimento (selfie é dado biométrico, sensível
-- pela LGPD), a foto de um documento com foto e uma selfie segurando o
-- documento. As fotos ficam no bucket privado `verification`, pasta <user_id>/:
-- só o dono vê; a equipe vê pelo painel do Supabase.
--
-- Revisão, no painel: Table Editor → verifications → status 'approved' ou
-- 'rejected' (com `reason`, que o profissional vê). Aprovar liga
-- professionals.verified; nos dois casos ele recebe um push. Depois da análise
-- o app do profissional apaga as fotos (files_deleted_at); a pasta também pode
-- ser apagada à mão em Storage → verification.
-- =============================================================================

create type public.verification_status as enum ('pending', 'approved', 'rejected');

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null default auth.uid() references public.professionals (id) on delete cascade,
  document_path text not null check (char_length(document_path) <= 200),
  selfie_path text not null check (char_length(selfie_path) <= 200),
  -- Enviar já é o consentimento (o app só envia depois de a pessoa autorizar).
  consent_at timestamptz not null default now(),
  status public.verification_status not null default 'pending',
  -- Motivo da recusa, escrito no painel; o profissional vê.
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  files_deleted_at timestamptz
);

comment on table public.verifications is 'Pedidos de selo Verificado. Revise no painel: status approved/rejected (+ reason).';

create index verifications_professional_idx on public.verifications (professional_id, created_at desc);
-- Uma análise por vez.
create unique index verifications_one_pending_idx on public.verifications (professional_id) where status = 'pending';

alter table public.verifications enable row level security;
revoke all on public.verifications from anon, authenticated;
grant select on public.verifications to authenticated;
grant insert (document_path, selfie_path) on public.verifications to authenticated;
grant update (files_deleted_at) on public.verifications to authenticated;

create policy "verifications: o dono vê" on public.verifications
  for select to authenticated
  using (professional_id = (select auth.uid()));

create policy "verifications: o profissional envia" on public.verifications
  for insert to authenticated
  with check (
    professional_id = (select auth.uid())
    and exists (select 1 from public.professionals p where p.id = (select auth.uid()))
    and document_path like (select auth.uid())::text || '/%'
    and selfie_path like (select auth.uid())::text || '/%'
  );

create policy "verifications: o dono marca as fotos apagadas" on public.verifications
  for update to authenticated
  using (professional_id = (select auth.uid()))
  with check (professional_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Fotos
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "verification: o dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "verification: o dono vê" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "verification: o dono apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Push direto para uma pessoa (avisos da conta, fora de conversa)
-- -----------------------------------------------------------------------------

create function private.push_to_user(p_user uuid, p_title text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_tokens text[];
  v_request bigint;
begin
  select
    jsonb_agg(jsonb_build_object(
      'to', t.token, 'title', p_title, 'body', p_body, 'sound', 'default', 'channelId', 'mensagens',
      'data', jsonb_build_object('url', p_url)
    ) order by t.token),
    array_agg(t.token order by t.token)
  into v_payload, v_tokens
  from public.push_tokens t
  where t.user_id = p_user;

  if v_payload is not null then
    v_request := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_payload,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
    insert into private.push_sends (request_id, tokens) values (v_request, v_tokens);
  end if;
exception when others then
  raise warning 'push_to_user: %', sqlerrm;
end;
$$;

revoke all on function private.push_to_user(uuid, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Revisão (no painel)
-- -----------------------------------------------------------------------------

create function private.on_verification_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.reviewed_at := now();
    if new.status = 'approved' then
      update public.professionals set verified = true where id = new.professional_id;
      perform private.push_to_user(new.professional_id, 'Identidade confirmada', 'Seu perfil agora tem o selo Verificado.', '/profissional/verificacao');
    else
      perform private.push_to_user(
        new.professional_id,
        'Não deu para confirmar sua identidade',
        coalesce(nullif(btrim(new.reason), ''), 'Veja o motivo no app e envie de novo.'),
        '/profissional/verificacao'
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.on_verification_reviewed() from public, anon, authenticated;

create trigger verifications_reviewed before update of status on public.verifications
  for each row execute function private.on_verification_reviewed();

-- Conta excluída: some o registro da verificação (as fotos o app apaga antes).
create function private.drop_verifications_of_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.verifications where professional_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.drop_verifications_of_deleted() from public, anon, authenticated;

create trigger profiles_drop_verifications after update of deleted_at on public.profiles
  for each row execute function private.drop_verifications_of_deleted();
