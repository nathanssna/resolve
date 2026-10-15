-- =============================================================================
-- A marca é Rezolveaê: os textos que o banco escreve (avisos no chat, push,
-- erros) deixam de dizer "Resolve". Mesmas funções, só o texto muda.
-- =============================================================================

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
    raise exception 'A equipe da Rezolveaê está analisando este serviço' using errcode = 'P0001';
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

create or replace function public.complete_onboarding(p_full_name text, p_role public.user_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome' using errcode = '22023';
  end if;

  if p_role is null then
    raise exception 'Escolha como você vai usar a Rezolveaê' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Perfil não encontrado' using errcode = 'P0002';
  end if;

  if v_profile.full_name <> '' then
    raise exception 'Seu cadastro já foi concluído' using errcode = 'P0001';
  end if;

  update public.profiles
  set full_name = v_name, role = p_role
  where id = v_uid
  returning * into v_profile;

  -- Profissional ganha a ficha (não verificada) para completar depois.
  if p_role = 'profissional' then
    insert into public.professionals (id) values (v_uid) on conflict (id) do nothing;
  end if;

  return v_profile;
end;
$$;

create or replace function private.push_on_message()
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
  v_tokens text[];
  v_request bigint;
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

    -- Quem desligou esse tipo de aviso em Perfil → Notificações não recebe.
    select array_agg(r.id) into v_recipients
    from unnest(v_recipients) as r(id)
    left join public.notification_prefs np on np.user_id = r.id
    where case when new.kind = 'text' then coalesce(np.messages, true) else coalesce(np.updates, true) end;

    v_body := case new.kind
      when 'text' then left(new.body, 180)
      when 'request' then 'Novo pedido de orçamento: ' || left(new.body, 140)
      when 'proposal' then (
        select 'Proposta: ' || private.format_brl(p.amount) || ' · ' || p.scheduled_label
        from public.proposals p where p.id = new.proposal_id
      )
      when 'system' then new.body
    end;

    select
      jsonb_agg(jsonb_build_object(
        'to', t.token,
        'title', coalesce(v_title, 'Rezolveaê'),
        'body', coalesce(v_body, 'Nova mensagem'),
        'sound', 'default',
        'channelId', 'mensagens',
        'data', jsonb_build_object('url', '/chat/' || v_conv.id, 'conversationId', v_conv.id)
      ) order by t.token),
      array_agg(t.token order by t.token)
    into v_payload, v_tokens
    from public.push_tokens t
    where t.user_id = any(v_recipients);

    if v_payload is not null then
      v_request := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := v_payload,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
      );
      insert into private.push_sends (request_id, tokens) values (v_request, v_tokens);
    end if;
  exception when others then
    raise warning 'push_on_message: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function private.on_verification_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro boolean := exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'profissional');
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.reviewed_at := now();
    if new.status = 'approved' then
      update public.profiles set identity_verified_at = now(), verification_required_at = null where id = new.user_id;
      if v_pro then
        update public.professionals set verified = true where id = new.user_id;
      end if;
      perform private.push_to_user(
        new.user_id,
        'Identidade confirmada',
        case when v_pro then 'Seu perfil agora tem o selo Verificado.' else 'Obrigado. Você já pode usar a Rezolveaê normalmente.' end,
        '/verificacao'
      );
    else
      perform private.push_to_user(
        new.user_id,
        'Não deu para confirmar sua identidade',
        coalesce(nullif(btrim(new.reason), ''), 'Veja o motivo no app e envie de novo.'),
        '/verificacao'
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_report_conversation(p_report_id uuid)
returns table (id uuid, created_at timestamptz, sender_name text, from_reported boolean, kind text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found or v_report.conversation_id is null then
    raise exception 'Esta denúncia não tem conversa' using errcode = 'P0002';
  end if;
  perform private.admin_audit(v_admin, 'ver_conversa', v_report.conversation_id, jsonb_build_object('report', p_report_id));
  return query
  select m.id, m.created_at, coalesce(nullif(btrim(pr.full_name), ''), 'Rezolveaê'), m.sender_id = v_report.reported_id, m.kind::text, m.body
  from public.messages m
  left join public.profiles pr on pr.id = m.sender_id
  where m.conversation_id = v_report.conversation_id
  order by m.created_at;
end;
$$;

create or replace function public.admin_unsuspend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
begin
  update public.profiles set suspended_until = null where id = p_user and suspended_until is not null;
  if not found then
    raise exception 'Esta conta não está suspensa' using errcode = 'P0001';
  end if;
  update public.professionals set paused = false, paused_until = null where id = p_user;
  perform private.admin_audit(v_admin, 'reativar', p_user, '{}');
  perform private.push_to_user(p_user, 'Sua conta foi reativada', 'Você já pode usar a Rezolveaê normalmente.', '/');
end;
$$;

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
        'id', m.id, 'created_at', m.created_at, 'sender_name', coalesce(nullif(btrim(pr.full_name), ''), 'Rezolveaê'),
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

create or replace function public.mark_order_done(p_order_id uuid, p_photos text[] default '{}')
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
    raise exception 'A equipe da Rezolveaê está analisando este serviço' using errcode = 'P0001';
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

create or replace function public.dispute_order(p_order_id uuid)
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
    raise exception 'A equipe da Rezolveaê já está analisando este serviço' using errcode = 'P0001';
  end if;

  perform private.open_service_report(v_order, 'O profissional diz que o serviço foi feito; o cliente disse que não.');
  perform private.order_note(v_order, 'O profissional discordou. A equipe da Rezolveaê vai analisar a conversa e decidir.');
  return v_order;
end;
$$;

create or replace function public.ask_team_order(p_order_id uuid)
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
    raise exception 'A equipe da Rezolveaê já está analisando este serviço' using errcode = 'P0001';
  end if;

  update public.orders set help_requested_at = now() where id = v_order.id returning * into v_order;
  perform private.open_service_report(v_order, 'O cliente não confirma o serviço há mais de 7 dias.');
  perform private.order_note(v_order, 'O profissional pediu ajuda à equipe da Rezolveaê para concluir o serviço.');
  return v_order;
end;
$$;

create or replace function public.request_reschedule(p_order_id uuid, p_scheduled_at timestamptz, p_label text)
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
    raise exception 'A equipe da Rezolveaê está analisando este serviço' using errcode = 'P0001';
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

create or replace function public.admin_resolve_service(p_report_id uuid, p_done boolean)
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
      perform private.finish_order(v_order, 'equipe', 'A equipe da Rezolveaê confirmou que o serviço foi feito. Serviço concluído.');
    else
      update public.orders
      set done_at = null, done_blocked = true, help_requested_at = null
      where id = v_order.id
      returning * into v_order;
      perform private.order_note(v_order, 'A equipe da Rezolveaê não confirmou que o serviço foi feito. Remarquem ou cancelem.');
    end if;
  end if;

  perform private.admin_audit(v_admin, 'resolver_servico', p_report_id, jsonb_build_object('order', v_order.id, 'done', p_done));
end;
$$;

create or replace function public.admin_send_support(p_user uuid, p_body text)
returns public.support_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_body text := btrim(coalesce(p_body, ''));
  v_msg public.support_messages;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user and p.deleted_at is null) then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'Escreva uma mensagem (até 2.000 caracteres)' using errcode = 'P0001';
  end if;

  insert into public.support_threads (user_id, last_message_at, team_last_read_at, waiting_team)
  values (p_user, now(), now(), false)
  on conflict (user_id) do update
    set last_message_at = now(), team_last_read_at = now(), waiting_team = false;

  insert into public.support_messages (user_id, from_team, body)
  values (p_user, true, v_body)
  returning * into v_msg;

  if coalesce((select np.messages from public.notification_prefs np where np.user_id = p_user), true) then
    perform private.push_to_user(p_user, 'Rezolveaê', left(v_body, 180), '/suporte');
  end if;
  perform private.admin_audit(v_admin, 'mensagem_oficial', p_user, jsonb_build_object('message', v_msg.id));
  return v_msg;
end;
$$;
