#!/bin/bash
# Apaga as contas de teste (e o que elas criaram, em cascata) e perfis "Conta excluída" que sobraram delas.
S=$(cd "$(dirname "$0")" && pwd)
cd "$S/../.." && npx supabase db query --linked "
  delete from auth.users where email like 'teste+%@exemplo.invalid' and raw_app_meta_data->>'e2e' = 'true';
  delete from public.profiles p where p.deleted_at is not null and not exists (select 1 from auth.users u where u.id = p.id)
    and not exists (select 1 from public.conversations c where p.id in (c.client_id, c.professional_id));" >/dev/null
rm -f "$S/.e2e_pw" "$S/.e2e_cli_id"
echo "contas de teste apagadas"
