-- =============================================================================
-- Primeiro acesso: nome e papel (cliente/profissional).
--
-- No login por código (signInWithOtp) o usuário nasce sem metadados, então o
-- trigger handle_new_user cria o profile com full_name = '' e role = 'cliente'.
-- O papel não é editável por update (sem grant de coluna), então o primeiro
-- acesso passa por esta RPC, que só funciona uma vez: enquanto o nome está vazio.
-- =============================================================================

create function public.complete_onboarding(p_full_name text, p_role public.user_role)
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
    raise exception 'Escolha como você vai usar o Resolve' using errcode = '22023';
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

revoke execute on function public.complete_onboarding(text, public.user_role) from public, anon;
grant execute on function public.complete_onboarding(text, public.user_role) to authenticated;
