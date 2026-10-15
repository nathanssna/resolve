-- =============================================================================
-- Conclusão do serviço com confirmação do cliente, remarcar e disputas.
--
-- Um serviço combinado só termina concluído, cancelado ou remarcado:
--   * O profissional marca "Serviço feito" (a partir do começo do período
--     marcado), com até 3 fotos do trabalho pronto (bucket `done-photos`).
--   * O cliente responde: sim (conclui) ou não (volta a combinado; para marcar
--     "feito" de novo, os dois remarcam antes).
--   * Sem resposta: lembretes ao cliente (1 e 3 dias); com 3 dias, ele não faz
--     pedido novo até responder. Com foto, conclui sozinho em 7 dias; sem foto,
--     o profissional pode pedir ajuda à equipe.
--   * "Não foi feito" de má-fé: o profissional discorda e a equipe decide
--     (denúncia `servico` no painel). Contestação indevida fica no histórico
--     do cliente que outros profissionais veem.
--   * Remarcar: qualquer um propõe nova data, o outro aceita ou recusa.
--   * Cancelar: profissional que cancela depois do dia marcado (sem ter feito)
--     conta como em cima da hora; cliente que cancela depois de "não foi
--     feito" ou depois do dia não conta.
--   * No dia seguinte ao marcado, sem "feito", o profissional recebe um aviso.
-- `complete_order` continua (versões antigas do app): profissional = feito
-- sem foto; cliente = confirma, se o profissional já marcou.
-- =============================================================================

alter table public.orders
  add column done_at timestamptz,
  add column done_photos text[] not null default '{}' check (cardinality(done_photos) <= 3),
  add column done_contested_at timestamptz,
  add column done_blocked boolean not null default false,
  add column completed_by text check (completed_by in ('cliente', 'automatico', 'equipe')),
  add column client_contest_wrong boolean not null default false,
  add column confirm_reminders smallint not null default 0,
  add column followup_at timestamptz,
  add column help_requested_at timestamptz,
  add column reschedule_at timestamptz,
  add column reschedule_label text check (char_length(reschedule_label) <= 60),
  add column reschedule_by uuid references public.profiles (id) on delete set null,
  add column reschedule_requested_at timestamptz;

comment on column public.orders.done_at is 'O profissional marcou "Serviço feito"; falta o cliente confirmar (enquanto status = combinado).';
comment on column public.orders.done_photos is 'Fotos do trabalho pronto, no bucket done-photos (<order_id>/<arquivo>).';
comment on column public.orders.done_contested_at is 'O cliente respondeu "não foi feito" (a última vez).';
comment on column public.orders.done_blocked is 'Depois de "não foi feito": o profissional só marca "feito" de novo depois de remarcar.';
comment on column public.orders.completed_by is 'Quem concluiu: o cliente confirmou, automático (7 dias com foto) ou a equipe.';
comment on column public.orders.client_contest_wrong is 'A equipe decidiu que o "não foi feito" do cliente era indevido.';
comment on column public.orders.reschedule_at is 'Remarcação pendente: novo começo de período proposto por reschedule_by.';

create index orders_done_waiting_idx on public.orders (done_at) where status = 'combinado' and done_at is not null;

alter table public.reports
  add column order_id uuid references public.orders (id) on delete set null;
alter table public.reports drop constraint reports_reason_check;
alter table public.reports
  add constraint reports_reason_check check (reason in ('golpe', 'assedio', 'conteudo', 'pagamento', 'outro', 'servico'));

comment on column public.reports.order_id is 'Denúncia de serviço (reason = servico): o serviço em disputa.';

create index reports_order_idx on public.reports (order_id) where order_id is not null;

-- -----------------------------------------------------------------------------
-- Fotos do serviço feito
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('done-photos', 'done-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "done-photos: profissional do serviço envia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'done-photos'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1] and o.professional_id = (select auth.uid()) and o.status = 'combinado'
    )
  );

create policy "done-photos: participantes veem" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'done-photos'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1] and (select auth.uid()) in (o.client_id, o.professional_id)
    )
  );

create policy "done-photos: administrador vê" on storage.objects
  for select to authenticated
  using (bucket_id = 'done-photos' and private.is_admin_session());

create policy "done-photos: quem enviou apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'done-photos' and owner_id = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Ajudantes
-- -----------------------------------------------------------------------------

-- Push de atualização (respeita Perfil → Notificações → Pedidos e propostas).
create function private.push_update(p_user uuid, p_title text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select np.updates from public.notification_prefs np where np.user_id = p_user), true) then
    perform private.push_to_user(p_user, p_title, p_body, p_url);
  end if;
end;
$$;
revoke all on function private.push_update(uuid, text, text, text) from public, anon, authenticated;

create function private.order_note(p_order public.orders, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.messages (conversation_id, sender_id, kind, request_id, body)
  values (p_order.conversation_id, null, 'system', p_order.request_id, p_body);
$$;
revoke all on function private.order_note(public.orders, text) from public, anon, authenticated;

create function private.first_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Cliente') from public.profiles p where p.id = p_user;
$$;
revoke all on function private.first_name(uuid) from public, anon, authenticated;

-- Fecha como concluído (cliente, automático ou equipe) e conta para o profissional.
create function private.finish_order(p_order public.orders, p_by text, p_note text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set status = 'concluido', completed_at = now(), completed_by = p_by,
      reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
  where id = p_order.id
  returning * into v_order;

  update public.professionals set jobs_count = jobs_count + 1 where id = v_order.professional_id;
  perform private.order_note(v_order, p_note);
  return v_order;
end;
$$;
revoke all on function private.finish_order(public.orders, text, text) from public, anon, authenticated;

-- Serviço em disputa (denúncia de serviço aberta): nada muda até a equipe decidir.
create function private.order_disputed(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.reports r where r.order_id = p_order_id and r.reason = 'servico' and r.resolved_at is null);
$$;
revoke all on function private.order_disputed(uuid) from public, anon, authenticated;

-- Lê o serviço travado e confere que é de quem chama.
create function private.lock_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_uid not in (v_order.client_id, v_order.professional_id) then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_order.status <> 'combinado' then
    raise exception 'Este serviço não está mais em andamento' using errcode = 'P0001';
  end if;
  return v_order;
end;
$$;
revoke all on function private.lock_order(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Serviço feito (profissional) e confirmação (cliente)
-- -----------------------------------------------------------------------------

create function public.mark_order_done(p_order_id uuid, p_photos text[] default '{}')
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
  v_photos text[] := coalesce(p_photos, '{}');
begin
  if auth.uid() <> v_order.professional_id then
    raise exception 'Só o profissional marca o serviço como feito' using errcode = '42501';
  end if;
  if v_order.done_at is not null then
    raise exception 'Você já marcou este serviço como feito. Aguarde o cliente confirmar.' using errcode = 'P0001';
  end if;
  if v_order.done_blocked then
    raise exception 'O cliente disse que o serviço não foi feito. Remarquem antes de marcar de novo.' using errcode = 'P0001';
  end if;
  if private.order_disputed(v_order.id) then
    raise exception 'A equipe do Resolve está analisando este serviço' using errcode = 'P0001';
  end if;
  if v_order.scheduled_at is not null and now() < v_order.scheduled_at then
    raise exception 'Você poderá marcar como feito a partir do dia e período combinados' using errcode = 'P0001';
  end if;
  if cardinality(v_photos) > 3 then
    raise exception 'Envie no máximo 3 fotos' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_photos) f(path) where split_part(f.path, '/', 1) <> v_order.id::text) then
    raise exception 'Foto inválida' using errcode = 'P0001';
  end if;

  update public.orders
  set done_at = now(), done_photos = v_photos, confirm_reminders = 0, help_requested_at = null,
      reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
  where id = v_order.id
  returning * into v_order;

  perform private.order_note(v_order, format(
    'Serviço marcado como feito%s. %s, confirme se foi feito.',
    case when cardinality(v_photos) > 0 then ' (com fotos)' else '' end,
    private.first_name(v_order.client_id)
  ));
  return v_order;
end;
$$;

create function public.confirm_order_done(p_order_id uuid, p_done boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  if auth.uid() <> v_order.client_id then
    raise exception 'Só o cliente confirma o serviço' using errcode = '42501';
  end if;
  if v_order.done_at is null then
    raise exception 'O profissional ainda não marcou o serviço como feito' using errcode = 'P0001';
  end if;

  if p_done then
    return private.finish_order(v_order, 'cliente', 'Serviço concluído');
  end if;

  update public.orders
  set done_at = null, done_photos = '{}', done_contested_at = now(), done_blocked = true, confirm_reminders = 0, help_requested_at = null
  where id = v_order.id
  returning * into v_order;

  perform private.order_note(v_order, format(
    '%s disse que o serviço não foi feito. Remarquem ou cancelem.', private.first_name(v_order.client_id)
  ));
  return v_order;
end;
$$;

-- Compatibilidade (versões antigas do app tinham um botão só, "Serviço concluído").
create or replace function public.complete_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  if auth.uid() = v_order.professional_id then
    return public.mark_order_done(p_order_id, '{}');
  end if;
  return public.confirm_order_done(p_order_id, true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Discordar e pedir ajuda (profissional) → denúncia de serviço para a equipe
-- -----------------------------------------------------------------------------

create function private.open_service_report(p_order public.orders, p_details text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reports (reporter_id, reported_id, conversation_id, reason, details, order_id)
  values (p_order.professional_id, p_order.client_id, p_order.conversation_id, 'servico', p_details, p_order.id);
$$;
revoke all on function private.open_service_report(public.orders, text) from public, anon, authenticated;

create function public.dispute_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  if auth.uid() <> v_order.professional_id then
    raise exception 'Só o profissional pode discordar' using errcode = '42501';
  end if;
  if not v_order.done_blocked then
    raise exception 'Só dá para discordar depois que o cliente disser que o serviço não foi feito' using errcode = 'P0001';
  end if;
  if private.order_disputed(v_order.id) then
    raise exception 'A equipe do Resolve já está analisando este serviço' using errcode = 'P0001';
  end if;

  perform private.open_service_report(v_order, 'O profissional diz que o serviço foi feito; o cliente disse que não.');
  perform private.order_note(v_order, 'O profissional discordou. A equipe do Resolve vai analisar a conversa e decidir.');
  return v_order;
end;
$$;

create function public.ask_team_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  if auth.uid() <> v_order.professional_id then
    raise exception 'Só o profissional pode pedir ajuda aqui' using errcode = '42501';
  end if;
  if v_order.done_at is null or v_order.done_at > now() - interval '7 days' then
    raise exception 'Você poderá pedir ajuda 7 dias depois de marcar o serviço como feito' using errcode = 'P0001';
  end if;
  if cardinality(v_order.done_photos) > 0 then
    raise exception 'Com fotos, o serviço é concluído sozinho em 7 dias' using errcode = 'P0001';
  end if;
  if v_order.help_requested_at is not null or private.order_disputed(v_order.id) then
    raise exception 'A equipe do Resolve já está analisando este serviço' using errcode = 'P0001';
  end if;

  update public.orders set help_requested_at = now() where id = v_order.id returning * into v_order;
  perform private.open_service_report(v_order, 'O cliente não confirma o serviço há mais de 7 dias.');
  perform private.order_note(v_order, 'O profissional pediu ajuda à equipe do Resolve para concluir o serviço.');
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Remarcar
-- -----------------------------------------------------------------------------

create function public.request_reschedule(p_order_id uuid, p_scheduled_at timestamptz, p_label text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
  v_label text := left(nullif(btrim(coalesce(p_label, '')), ''), 60);
begin
  if v_order.done_at is not null then
    raise exception 'O serviço está esperando o cliente confirmar se foi feito' using errcode = 'P0001';
  end if;
  if private.order_disputed(v_order.id) then
    raise exception 'A equipe do Resolve está analisando este serviço' using errcode = 'P0001';
  end if;
  if p_scheduled_at is null or v_label is null then
    raise exception 'Escolha o novo dia e período' using errcode = 'P0001';
  end if;
  -- Mesmas regras da proposta: período que ainda não acabou, até 90 dias.
  if p_scheduled_at + interval '4 hours' < now() then
    raise exception 'Escolha um dia e um período que ainda não passaram' using errcode = 'P0001';
  end if;
  if p_scheduled_at > now() + interval '90 days' then
    raise exception 'Escolha uma data nos próximos 90 dias' using errcode = 'P0001';
  end if;
  if p_scheduled_at = v_order.scheduled_at then
    raise exception 'Escolha uma data diferente da combinada' using errcode = 'P0001';
  end if;

  update public.orders
  set reschedule_at = p_scheduled_at, reschedule_label = v_label, reschedule_by = auth.uid(), reschedule_requested_at = now()
  where id = v_order.id
  returning * into v_order;

  perform private.order_note(v_order, format('%s propôs remarcar para %s.', private.first_name(auth.uid()), v_label));
  return v_order;
end;
$$;

create function public.respond_reschedule(p_order_id uuid, p_accept boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
  v_label text := v_order.reschedule_label;
  v_mine boolean := v_order.reschedule_by = auth.uid();
begin
  if v_order.reschedule_at is null then
    raise exception 'Não há remarcação para responder' using errcode = 'P0001';
  end if;
  -- Quem pediu não aceita o próprio pedido, mas pode desistir dele.
  if v_mine and p_accept then
    raise exception 'Espere a outra pessoa responder' using errcode = 'P0001';
  end if;

  if p_accept then
    update public.orders
    set scheduled_at = reschedule_at, scheduled_label = reschedule_label, reminded_at = null, followup_at = null,
        done_blocked = false,
        reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
    where id = v_order.id
    returning * into v_order;
    perform private.order_note(v_order, format('Remarcado para %s.', v_label));
  else
    update public.orders
    set reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
    where id = v_order.id
    returning * into v_order;
    perform private.order_note(v_order, case
      when v_mine then format('%s desistiu de remarcar para %s.', private.first_name(auth.uid()), v_label)
      else format('%s não aceitou remarcar para %s.', private.first_name(auth.uid()), v_label)
    end);
  end if;
  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelar: novas regras
-- -----------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders := private.lock_order(p_order_id);
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
  v_is_pro boolean := v_uid = v_order.professional_id;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day date := (v_order.scheduled_at at time zone 'America/Sao_Paulo')::date;
  v_late boolean;
  v_by text;
begin
  if v_order.done_at is not null then
    raise exception '%', case when v_is_pro
      then 'Você marcou o serviço como feito. Aguarde o cliente confirmar.'
      else 'Responda primeiro se o serviço foi feito.'
    end using errcode = 'P0001';
  end if;
  if private.order_disputed(v_order.id) then
    raise exception 'A equipe do Resolve está analisando este serviço' using errcode = 'P0001';
  end if;

  v_late := v_order.scheduled_at is not null and now() > v_order.scheduled_at - interval '12 hours' and case
    -- Profissional: depois do dia sem ter feito também conta (ele se comprometeu e não foi).
    when v_is_pro then true
    -- Cliente: só até o fim do dia, e nunca depois de dizer que o serviço não foi feito.
    else v_today <= v_day and v_order.done_contested_at is null
  end;
  if v_late and v_reason is null then
    raise exception 'Conte o motivo do cancelamento' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'cancelado', canceled_at = now(), canceled_by = v_uid, canceled_late = v_late, cancel_reason = v_reason,
      reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
  where id = p_order_id
  returning * into v_order;

  v_by := case when v_is_pro then 'pelo profissional' else 'pelo cliente' end;
  perform private.order_note(v_order, case
    when v_late then format('Serviço cancelado em cima da hora %s: %s', v_by, v_reason)
    when v_reason is not null then format('Serviço cancelado %s: %s', v_by, v_reason)
    else 'Serviço cancelado ' || v_by
  end);

  -- Profissional: 3 em cima da hora em 30 dias → pausa de 7 dias.
  if v_late and v_is_pro and (
    select count(*) from public.orders o
    where o.professional_id = v_uid and o.canceled_by = v_uid and o.canceled_late
      and o.canceled_at > now() - interval '30 days'
  ) >= 3 then
    update public.professionals
    set paused = true, paused_until = greatest(coalesce(paused_until, now()), now() + interval '7 days')
    where id = v_uid;
  end if;

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cliente que não confirma há 3 dias não faz pedido novo
-- -----------------------------------------------------------------------------

create or replace function private.check_request_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_open integer;
  v_day integer;
  v_waiting text;
begin
  select c.client_id into v_client from public.conversations c where c.id = new.conversation_id;

  select private.first_name(o.professional_id) into v_waiting
  from public.orders o
  where o.client_id = v_client and o.status = 'combinado' and o.done_at < now() - interval '3 days'
  order by o.done_at
  limit 1;
  if v_waiting is not null then
    raise exception 'Confirme o serviço com % antes de fazer um novo pedido', v_waiting using errcode = 'P0001';
  end if;

  select
    count(*) filter (where r.closed_at is null and not exists (select 1 from public.orders o where o.request_id = r.id)),
    count(*) filter (where r.created_at > now() - interval '24 hours')
  into v_open, v_day
  from public.requests r
  join public.conversations c on c.id = r.conversation_id
  where c.client_id = v_client;

  if v_open >= 5 then
    raise exception 'Você tem 5 pedidos em aberto. Espere as respostas ou cancele algum antes de pedir outro.' using errcode = 'P0001';
  end if;
  if v_day >= 10 then
    raise exception 'Você já fez 10 pedidos hoje. Tente de novo amanhã.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Histórico do cliente (o que o profissional vê no pedido)
-- -----------------------------------------------------------------------------

drop function public.client_track_record(uuid);

create function public.client_track_record(p_client_id uuid)
returns table (done integer, late_cancels integer, has_phone boolean, identity_verified boolean, wrong_contests integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.done, r.late_cancels, r.has_phone, r.identity_verified, r.wrong_contests
  from (
    select
      (select count(*) from public.orders o where o.client_id = p_client_id and o.status = 'concluido')::integer as done,
      (select count(*) from public.orders o where o.client_id = p_client_id and o.canceled_late and o.canceled_by = o.client_id)::integer as late_cancels,
      coalesce(btrim(p.phone), '') <> '' as has_phone,
      p.identity_verified_at is not null as identity_verified,
      (select count(*) from public.orders o where o.client_id = p_client_id and o.client_contest_wrong)::integer as wrong_contests
    from public.profiles p
    where p.id = p_client_id
  ) r
  where exists (
    select 1 from public.conversations c
    where c.client_id = p_client_id and c.professional_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Equipe: decide a disputa de serviço
-- -----------------------------------------------------------------------------

create function public.admin_resolve_service(p_report_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
  v_order public.orders;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.reason <> 'servico' or v_report.order_id is null then
    raise exception 'Denúncia de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_report.resolved_at is not null then
    raise exception 'Esta denúncia já foi resolvida' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = v_report.order_id for update;

  update public.reports
  set resolved_at = now(), resolved_by = v_admin,
      resolution = case when p_done then 'Serviço feito: concluído pela equipe' else 'Serviço não confirmado pela equipe' end
  where id = p_report_id;

  if v_order.status = 'combinado' then
    if p_done then
      if v_order.done_contested_at is not null and v_order.done_at is null then
        update public.orders set client_contest_wrong = true where id = v_order.id;
      end if;
      perform private.finish_order(v_order, 'equipe', 'A equipe do Resolve confirmou que o serviço foi feito. Serviço concluído.');
    else
      update public.orders
      set done_at = null, done_photos = '{}', done_blocked = true, help_requested_at = null
      where id = v_order.id
      returning * into v_order;
      perform private.order_note(v_order, 'A equipe do Resolve não confirmou que o serviço foi feito. Remarquem ou cancelem.');
    end if;
  end if;

  perform private.admin_audit(v_admin, 'resolver_servico', p_report_id, jsonb_build_object('order', v_order.id, 'done', p_done));
end;
$$;

-- A denúncia mostra o serviço em disputa (com as fotos).
create or replace function public.admin_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
  v jsonb;
begin
  select * into v_report from public.reports r where r.id = p_id;
  if not found then
    raise exception 'Denúncia não encontrada' using errcode = 'P0002';
  end if;
  if v_report.conversation_id is not null then
    perform private.admin_audit(v_admin, 'ver_conversa', v_report.conversation_id, jsonb_build_object('report', p_id));
  end if;

  select jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'details', r.details, 'created_at', r.created_at,
    'resolved_at', r.resolved_at, 'resolution', r.resolution,
    'reporter', jsonb_build_object('id', r.reporter_id, 'name', rp.full_name),
    'reported', jsonb_build_object('id', r.reported_id, 'name', rd.full_name, 'suspended_until', rd.suspended_until),
    'reported_total', (select count(*) from public.reports x where x.reported_id = r.reported_id),
    'previous', (
      select jsonb_build_object('reason', x.reason, 'created_at', x.created_at, 'resolution', x.resolution)
      from public.reports x
      where x.reported_id = r.reported_id and x.id <> r.id and x.created_at <= r.created_at
      order by x.created_at desc
      limit 1
    ),
    'order', (
      select jsonb_build_object(
        'id', o.id, 'status', o.status, 'service', s.title, 'amount', o.amount, 'scheduled_label', o.scheduled_label,
        'done_at', o.done_at, 'done_photos', o.done_photos, 'done_contested_at', o.done_contested_at
      )
      from public.orders o join public.services s on s.id = o.service_id
      where o.id = r.order_id
    ),
    'conversation_id', r.conversation_id,
    'messages_total', (select count(*) from public.messages m where m.conversation_id = r.conversation_id),
    -- As últimas mensagens até a denúncia (o contexto do que foi denunciado).
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'created_at', m.created_at, 'sender_name', coalesce(nullif(btrim(pr.full_name), ''), 'Resolve'),
        'from_reported', m.sender_id = r.reported_id, 'kind', m.kind, 'body', m.body
      ) order by m.created_at)
      from (
        select * from public.messages x
        where x.conversation_id = r.conversation_id and x.created_at <= r.created_at
        order by x.created_at desc
        limit 8
      ) m
      left join public.profiles pr on pr.id = m.sender_id
    ), '[]'::jsonb)
  )
  into v
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles rd on rd.id = r.reported_id
  where r.id = p_id;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rotina: lembretes, conclusão automática com foto, remarcação vencida
-- -----------------------------------------------------------------------------

create function private.service_followups()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
  v_order public.orders;
begin
  -- Com foto e 7 dias sem resposta do cliente: conclui.
  for v_order in
    select * from public.orders o
    where o.status = 'combinado' and o.done_at < now() - interval '7 days' and cardinality(o.done_photos) > 0
      and not private.order_disputed(o.id)
    for update
  loop
    perform private.finish_order(v_order, 'automatico', format(
      'Serviço concluído automaticamente: %s não respondeu em 7 dias.', private.first_name(v_order.client_id)
    ));
    v_count := v_count + 1;
  end loop;

  -- Cliente sem responder: lembrete com 1 dia e com 3 dias.
  for v_row in
    update public.orders o set confirm_reminders = o.confirm_reminders + 1
    where o.status = 'combinado' and o.done_at is not null
      and ((o.confirm_reminders = 0 and o.done_at < now() - interval '1 day')
        or (o.confirm_reminders = 1 and o.done_at < now() - interval '3 days'))
    returning o.id, o.client_id, o.professional_id, o.confirm_reminders
  loop
    perform private.push_update(
      v_row.client_id,
      'O serviço foi feito?',
      format('%s marcou o serviço como feito. Confirme no app%s.',
        private.first_name(v_row.professional_id),
        case when v_row.confirm_reminders = 2 then ' para continuar fazendo pedidos' else '' end),
      '/pedido/' || v_row.id
    );
    v_count := v_count + 1;
  end loop;

  -- Dia seguinte ao marcado, sem "feito": pergunta ao profissional (uma vez por data).
  for v_row in
    update public.orders o set followup_at = now()
    where o.status = 'combinado' and o.done_at is null and o.followup_at is null and o.scheduled_at is not null
      and (o.scheduled_at at time zone 'America/Sao_Paulo')::date < (now() at time zone 'America/Sao_Paulo')::date
    returning o.id, o.client_id, o.professional_id
  loop
    perform private.push_update(
      v_row.professional_id,
      'O serviço aconteceu?',
      format('Com %s: marque como feito ou remarque.', private.first_name(v_row.client_id)),
      '/pedido/' || v_row.id
    );
    v_count := v_count + 1;
  end loop;

  -- Remarcação pendente cuja data passou: vence.
  for v_order in
    update public.orders o
    set reschedule_at = null, reschedule_label = null, reschedule_by = null, reschedule_requested_at = null
    where o.status = 'combinado' and o.reschedule_at is not null and o.reschedule_at + interval '4 hours' < now()
    returning o.*
  loop
    perform private.order_note(v_order, 'O pedido de remarcação venceu: a data passou sem resposta.');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function private.service_followups() from public, anon, authenticated;

-- De hora em hora, aos 30 (o lembrete do dia seguinte sai a partir da meia-noite; a maioria
-- chega de manhã porque a rotina roda o dia todo, mas uma vez só por data).
select cron.schedule('acompanhamento-servicos', '30 * * * *', 'select private.service_followups()');

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke execute on function public.mark_order_done(uuid, text[]) from public, anon;
revoke execute on function public.confirm_order_done(uuid, boolean) from public, anon;
revoke execute on function public.dispute_order(uuid) from public, anon;
revoke execute on function public.ask_team_order(uuid) from public, anon;
revoke execute on function public.request_reschedule(uuid, timestamptz, text) from public, anon;
revoke execute on function public.respond_reschedule(uuid, boolean) from public, anon;
revoke execute on function public.client_track_record(uuid) from public, anon;
revoke execute on function public.admin_resolve_service(uuid, boolean) from public, anon;

grant execute on function public.mark_order_done(uuid, text[]) to authenticated;
grant execute on function public.confirm_order_done(uuid, boolean) to authenticated;
grant execute on function public.dispute_order(uuid) to authenticated;
grant execute on function public.ask_team_order(uuid) to authenticated;
grant execute on function public.request_reschedule(uuid, timestamptz, text) to authenticated;
grant execute on function public.respond_reschedule(uuid, boolean) to authenticated;
grant execute on function public.client_track_record(uuid) to authenticated;
grant execute on function public.admin_resolve_service(uuid, boolean) to authenticated;
