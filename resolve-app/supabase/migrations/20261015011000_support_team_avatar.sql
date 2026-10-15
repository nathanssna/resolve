-- =============================================================================
-- Foto do canal oficial: a da conta da equipe (a logo do Resolve), lida pelo app
-- de qualquer pessoa logada. É a do administrador mais antigo; trocar a foto
-- dessa conta troca a do canal.
-- =============================================================================

create function public.support_team_avatar()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.avatar_url
  from private.admins a
  join public.profiles p on p.id = a.user_id
  where p.avatar_url is not null
  order by a.created_at
  limit 1;
$$;

revoke execute on function public.support_team_avatar() from public, anon;
grant execute on function public.support_team_avatar() to authenticated;
