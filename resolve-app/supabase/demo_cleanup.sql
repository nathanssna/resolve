-- Apaga os profissionais de demonstração criados por seeds/demo_professionals.sql
-- (e, em cascata, profiles, fichas, serviços, conversas e pedidos ligados a eles).
-- Também remove o robô de demonstração (seeds/demo_bot.sql).
-- Rode no SQL Editor do Supabase. Antes, tire supabase/seeds/demo_professionals.sql
-- e supabase/seeds/demo_bot.sql do [db.seed] sql_paths em config.toml para eles
-- não voltarem no próximo push com seed.

drop trigger if exists demo_bot_reply on public.messages;
drop function if exists private.demo_bot_reply();
drop function if exists private.demo_parse_amount(text);
drop function if exists private.demo_quote(text);

delete from auth.users
where raw_app_meta_data ->> 'demo' = 'true'
  and email like 'demo+%@exemplo.invalid';
