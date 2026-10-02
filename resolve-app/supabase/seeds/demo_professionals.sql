-- =============================================================================
-- Profissionais de DEMONSTRAÇÃO (os mesmos do antigo src/data/catalog.ts).
--
-- Servem para testar as listas até existir o modo profissional (etapa F).
-- São contas sem senha com e-mail @exemplo.invalid: ninguém consegue entrar
-- nelas. Todas têm raw_app_meta_data.demo = true.
--
-- Pode rodar de novo (ids fixos, sem duplicar).
-- Para apagar tudo: supabase/demo_cleanup.sql
-- =============================================================================

create temporary table _demo_pros (
  slug text,
  full_name text,
  role_title text,
  rating numeric,
  review_count integer,
  years_experience integer,
  reply_minutes integer,
  jobs_count integer,
  tags text[],
  verified boolean,
  service_ids text[],
  id uuid generated always as (md5('resolve-demo:' || slug)::uuid) stored
);

insert into _demo_pros (slug, full_name, role_title, rating, review_count, years_experience, reply_minutes, jobs_count, tags, verified, service_ids)
values
  ('lucas', 'Lucas Ferreira', 'Técnico em informática', 4.9, 128, 5, 5, 312, array['Formatação', 'Limpeza', 'Suporte remoto'], true, array['informatica']),
  ('gabriel', 'Gabriel Souza', 'Técnico em informática', 4.8, 96, 4, 15, 201, array['Manutenção', 'Instalação', 'Redes'], true, array['informatica']),
  ('rafael', 'Rafael Costa', 'Técnico em informática', 4.7, 74, 3, 10, 140, array['Formatação', 'Programas', 'Suporte remoto'], false, array['informatica']),
  ('diego', 'Diego Lima', 'Técnico em informática', 4.6, 61, 2, 30, 88, array['Limpeza', 'Manutenção', 'Redes'], true, array['informatica']),
  ('marcos', 'Marcos Oliveira', 'Encanador', 4.9, 210, 12, 10, 640, array['Vazamentos', 'Desentupimento', 'Chuveiros'], true, array['encanador']),
  ('paulo', 'Paulo Santos', 'Encanador', 4.7, 133, 8, 20, 390, array['Caixa d’água', 'Registros'], true, array['encanador']),
  ('andre', 'André Nunes', 'Eletricista', 4.8, 187, 10, 10, 520, array['Quadro de energia', 'Iluminação'], true, array['eletricista']),
  ('felipe', 'Felipe Rocha', 'Eletricista', 4.6, 92, 5, 25, 230, array['Tomadas', 'Disjuntores'], false, array['eletricista']),
  ('jorge', 'Jorge Almeida', 'Montador de móveis', 4.9, 256, 9, 10, 710, array['Guarda-roupas', 'Painéis de TV'], true, array['montagem-moveis']),
  ('renata', 'Renata Prado', 'Pintora', 4.8, 88, 7, 15, 180, array['Interna', 'Textura', 'Correções'], true, array['pintor']),
  ('claudia', 'Cláudia Mendes', 'Diarista', 4.9, 340, 11, 5, 980, array['Faxina', 'Pós-obra', 'Vidros'], true, array['limpeza']),
  ('thiago', 'Thiago Barros', 'Técnico em climatização', 4.8, 74, 6, 15, 160, array['Split', 'Higienização'], true, array['ar-condicionado']),
  ('sergio', 'Sérgio Lopes', 'Chaveiro', 4.6, 120, 15, 5, 870, array['Aberturas', 'Fechadura digital'], true, array['chaveiro']);

-- 1. Contas (o trigger on_auth_user_created cria o profile e a ficha de profissional).
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  d.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo+' || d.slug || '@exemplo.invalid',
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'demo', true),
  jsonb_build_object('full_name', d.full_name, 'role', 'profissional'),
  now(),
  now()
from _demo_pros d
on conflict (id) do nothing;

-- 2. Nome e ficha (também atualiza quem já existia).
update public.profiles p
set full_name = d.full_name, role = 'profissional'
from _demo_pros d
where p.id = d.id;

insert into public.professionals (id)
select d.id from _demo_pros d
on conflict (id) do nothing;

update public.professionals p
set role_title = d.role_title,
    years_experience = d.years_experience,
    reply_minutes = d.reply_minutes,
    jobs_count = d.jobs_count,
    tags = d.tags,
    verified = d.verified,
    rating = d.rating,
    review_count = d.review_count
from _demo_pros d
where p.id = d.id;

-- 3. Serviços que cada um atende.
insert into public.professional_services (professional_id, service_id)
select d.id, s.service_id
from _demo_pros d, unnest(d.service_ids) as s(service_id)
on conflict do nothing;

drop table _demo_pros;
