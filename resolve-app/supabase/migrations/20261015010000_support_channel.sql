-- =============================================================================
-- Canal oficial do Resolve: uma conversa de cada pessoa com a equipe.
--
--   support_threads   uma por pessoa (cliente ou profissional)
--   support_messages  mensagens da pessoa ou da equipe (from_team)
--
-- A pessoa lê só a própria conversa e escreve por send_support_message.
-- A equipe (administrador com segundo fator) lê e responde pelo painel
-- (admin_support_*); quem da equipe escreveu fica só no registro (admin_log),
-- o app mostra "Equipe Resolve". Ninguém fora da equipe escreve como Resolve.
-- Push: equipe → pessoa (respeita Notificações → Mensagens);
--       pessoa → administradores ("Atendimento: Ana").
-- =============================================================================

create table public.support_threads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  user_last_read_at timestamptz,
  team_last_read_at timestamptz,
  -- A última mensagem é da pessoa e a equipe ainda não respondeu.
  waiting_team boolean not null default false
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.support_threads (user_id) on delete cascade,
  from_team boolean not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.support_threads is 'Canal oficial: a conversa de cada pessoa com a equipe do Resolve.';
comment on table public.support_messages is 'Mensagens do canal oficial. from_team: escrita pela equipe (pelo painel).';

create index support_messages_user_idx on public.support_messages (user_id, created_at);
create index support_threads_waiting_idx on public.support_threads (last_message_at) where waiting_team;

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

create policy "support_threads: a pessoa lê a sua" on public.support_threads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "support_messages: a pessoa lê as suas" on public.support_messages
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.support_threads, public.support_messages to authenticated;

alter publication supabase_realtime add table public.support_threads, public.support_messages;

-- -----------------------------------------------------------------------------
-- A pessoa
-- -----------------------------------------------------------------------------

create function public.send_support_message(p_body text)
returns public.support_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_msg public.support_messages;
  v_name text;
  v_admin record;
begin
  if v_uid is null then
    raise exception 'Faça login para continuar' using errcode = '28000';
  end if;
  if v_body = '' then
    raise exception 'Escreva uma mensagem' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Mensagem muito longa (até 2.000 caracteres)' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.support_messages m
    where m.user_id = v_uid and not m.from_team and m.created_at > now() - interval '10 minutes'
  ) >= 20 then
    raise exception 'Muitas mensagens seguidas. Espere um pouco e tente de novo.' using errcode = 'P0001';
  end if;

  insert into public.support_threads (user_id, last_message_at, user_last_read_at, waiting_team)
  values (v_uid, now(), now(), true)
  on conflict (user_id) do update
    set last_message_at = now(), user_last_read_at = now(), waiting_team = true;

  insert into public.support_messages (user_id, from_team, body)
  values (v_uid, false, v_body)
  returning * into v_msg;

  -- Avisa a equipe.
  select coalesce(nullif(btrim(p.full_name), ''), 'Alguém') into v_name from public.profiles p where p.id = v_uid;
  for v_admin in select a.user_id from private.admins a loop
    perform private.push_to_user(v_admin.user_id, 'Atendimento: ' || v_name, left(v_body, 180), '/admin/atendimento/' || v_uid);
  end loop;

  return v_msg;
end;
$$;

create function public.mark_support_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_threads set user_last_read_at = now() where user_id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- A equipe (painel)
-- -----------------------------------------------------------------------------

-- Conversas: as que esperam resposta primeiro (p_waiting = só essas).
create function public.admin_support_threads(p_waiting boolean default false, p_limit integer default 100)
returns table (
  user_id uuid, name text, role public.user_role, avatar_url text, deleted boolean,
  last_message_at timestamptz, last_body text, last_from_team boolean, waiting_team boolean, unread bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select t.user_id, p.full_name, p.role, p.avatar_url, p.deleted_at is not null,
         t.last_message_at, l.body, l.from_team, t.waiting_team,
         (select count(*) from public.support_messages m
          where m.user_id = t.user_id and not m.from_team and m.created_at > coalesce(t.team_last_read_at, '-infinity'))
  from public.support_threads t
  join public.profiles p on p.id = t.user_id
  cross join lateral (
    select m.body, m.from_team from public.support_messages m
    where m.user_id = t.user_id order by m.created_at desc limit 1
  ) l
  where not p_waiting or t.waiting_team
  order by t.waiting_team desc, t.last_message_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- A conversa com uma pessoa (a leitura fica registrada e marca como lida pela equipe).
create function public.admin_support_messages(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'Pessoa não encontrada' using errcode = 'P0002';
  end if;
  update public.support_threads set team_last_read_at = now() where user_id = p_user;
  perform private.admin_audit(v_admin, 'ver_atendimento', p_user, '{}');

  select jsonb_build_object(
    'person', jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'avatar_url', p.avatar_url, 'deleted', p.deleted_at is not null),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'from_team', m.from_team, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from public.support_messages m where m.user_id = p_user
    ), '[]'::jsonb)
  )
  into v
  from public.profiles p
  where p.id = p_user;
  return v;
end;
$$;

create function public.admin_send_support(p_user uuid, p_body text)
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
    perform private.push_to_user(p_user, 'Resolve', left(v_body, 180), '/suporte');
  end if;
  perform private.admin_audit(v_admin, 'mensagem_oficial', p_user, jsonb_build_object('message', v_msg.id));
  return v_msg;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke execute on function public.send_support_message(text) from public, anon;
revoke execute on function public.mark_support_read() from public, anon;
revoke execute on function public.admin_support_threads(boolean, integer) from public, anon;
revoke execute on function public.admin_support_messages(uuid) from public, anon;
revoke execute on function public.admin_send_support(uuid, text) from public, anon;

grant execute on function public.send_support_message(text) to authenticated;
grant execute on function public.mark_support_read() to authenticated;
grant execute on function public.admin_support_threads(boolean, integer) to authenticated;
grant execute on function public.admin_support_messages(uuid) to authenticated;
grant execute on function public.admin_send_support(uuid, text) to authenticated;
