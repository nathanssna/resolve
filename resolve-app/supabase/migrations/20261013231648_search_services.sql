-- =============================================================================
-- Busca por frase: "preciso instalar um chuveiro" → Encanador e Eletricista.
--
-- Cada palavra vira radical em português e perde o acento ("instalação",
-- "instalar" → instal); palavras vazias ("um", "meu") não contam. O serviço
-- pontua por palavra encontrada, com peso pelo campo (título e palavras-chave >
-- itens e exemplos > descrição) e pela raridade (chuveiro, que só dois serviços
-- têm, vale mais que instalar, que quase todos têm). Também casa o começo da
-- palavra (quem ainda está digitando, ou digitou sem acento) e erro de
-- digitação (pg_trgm). Voltam os serviços com pelo menos metade da nota do
-- primeiro, do mais ao menos relevante.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.services add column keywords text[] not null default '{}';

comment on column public.services.keywords is 'Palavras do dia a dia que levam ao serviço na busca (ex.: privada, disjuntor). Mantidas no seed.sql.';

create function public.search_services(p_query text)
returns table (service_id text, score real)
language sql
stable
set search_path = ''
as $$
  with
  terms as (
    select distinct extensions.unaccent('extensions.unaccent', q.lexeme) as term
    from unnest(to_tsvector('pg_catalog.portuguese', left(coalesce(p_query, ''), 200))) as q
  ),
  docs as (
    select s.id, extensions.unaccent('extensions.unaccent', d.lexeme) as lexeme,
      max(case w.weight when 'A' then 1.0 when 'B' then 0.6 else 0.3 end) as weight
    from public.services s
    cross join lateral unnest(
      setweight(to_tsvector('pg_catalog.portuguese', s.title || ' ' || array_to_string(s.keywords, ' ')), 'A')
      || setweight(to_tsvector('pg_catalog.portuguese', s.subtitle || ' ' || array_to_string(s.includes, ' ') || ' ' || array_to_string(s.examples, ' ')), 'B')
      || setweight(to_tsvector('pg_catalog.portuguese', s.description || ' ' || s.area), 'C')
    ) as d
    cross join lateral unnest(d.weights) as w(weight)
    group by 1, 2
  ),
  hits as (
    select d.id, t.term, max(d.weight * m.quality) as points
    from docs d
    cross join terms t
    cross join lateral (
      select case
        when d.lexeme = t.term then 1.0
        -- começo de palavra: "chuv" → chuveiro; "instalacao" (sem acento) → instal
        when least(length(d.lexeme), length(t.term)) >= 4
          and (left(d.lexeme, length(t.term)) = t.term or left(t.term, length(d.lexeme)) = d.lexeme) then 0.8
        -- erro de digitação: "chuvero" → chuveiro
        when least(length(d.lexeme), length(t.term)) >= 4 and extensions.similarity(d.lexeme, t.term) >= 0.5 then 0.6
        else 0
      end as quality
    ) m
    where m.quality > 0
    group by d.id, t.term
  ),
  rarity as (
    select h.term, ln(1 + (select count(*) from public.services)::numeric / count(*)) as idf
    from hits h
    group by h.term
  ),
  scored as (
    select h.id, sum(h.points * r.idf) as score
    from hits h
    join rarity r on r.term = h.term
    group by h.id
  )
  select sc.id, sc.score::real
  from scored sc
  join public.services s on s.id = sc.id
  where sc.score >= 0.5 * (select max(score) from scored)
  order by sc.score desc, s.sort_order;
$$;

revoke execute on function public.search_services(text) from public;
grant execute on function public.search_services(text) to anon, authenticated;
