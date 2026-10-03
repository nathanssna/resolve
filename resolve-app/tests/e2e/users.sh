#!/bin/bash
# Cria as contas temporárias de teste (teste+cli e teste+pro @exemplo.invalid, marcadas com e2e=true)
# no Supabase do projeto (npx supabase link). A senha aleatória fica em e2e/.e2e_pw (fora do git).
S=$(cd "$(dirname "$0")" && pwd)
APP=$(cd "$S/../.." && pwd)
PW=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"); echo -n "$PW" > $S/.e2e_pw; chmod 600 $S/.e2e_pw
mk() { cat <<EOF
with u as (
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '$1', extensions.crypt('$PW', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"e2e":true}', '$2', now(), now(), '', '', '', '', '', '', '', '')
  returning id, email)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now() from u returning user_id;
EOF
}
{ mk 'teste+cli@exemplo.invalid' '{"full_name":"Cliente Teste","role":"cliente"}'; mk 'teste+pro@exemplo.invalid' '{"full_name":"Pro Teste","role":"profissional"}'; cat <<'EOF'
update public.professionals set role_title = 'Faz-tudo', bio = 'Pequenos reparos em casa.', years_experience = 3 where id = (select id from auth.users where email = 'teste+pro@exemplo.invalid');
insert into public.professional_services select id, s from auth.users, unnest(array['encanador','eletricista']) s where email = 'teste+pro@exemplo.invalid' returning professional_id;
insert into public.addresses (user_id, label, line, area, city, state, is_default) select id, 'Casa', 'Avenida Paulista, 1000', 'Bela Vista', 'São Paulo', 'SP', true from auth.users where email = 'teste+cli@exemplo.invalid' returning id;
EOF
} > $S/e2e_users.sql
cd "$APP" && npx supabase db query --linked -f $S/e2e_users.sql >/dev/null 2>&1; rm -f $S/e2e_users.sql
npx supabase db query --linked "select id from auth.users where email = 'teste+cli@exemplo.invalid'" 2>&1 | grep '"id"' | sed 's/.*: "\(.*\)".*/\1/' > $S/.e2e_cli_id
echo "cliente: $(cat $S/.e2e_cli_id)"
