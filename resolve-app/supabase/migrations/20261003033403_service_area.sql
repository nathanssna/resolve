-- =============================================================================
-- Área de atendimento do profissional (raio em km a partir de um ponto).
--
--   * professionals.latitude/longitude: de onde o profissional sai (o app grava
--     com ~100 m de precisão). Deixam de ser legíveis pela API: podem ser a
--     casa dele.
--   * professionals.service_radius_km: até onde ele atende (padrão 10 km).
--   * professional_distances(lat, lng): distância (km inteiros) de cada
--     profissional até um ponto e se o ponto está dentro do raio dele. É o que
--     o app usa para mostrar só quem atende o endereço do cliente.
-- =============================================================================

alter table public.professionals
  add column service_radius_km smallint not null default 10 check (service_radius_km between 1 and 100);

-- Leitura pública sem as coordenadas.
revoke select on public.professionals from anon, authenticated;
grant select (
  id, role_title, bio, years_experience, reply_minutes, tags, base_area, verified,
  rating, review_count, jobs_count, service_radius_km, created_at, updated_at
) on public.professionals to anon, authenticated;

grant insert (service_radius_km) on public.professionals to authenticated;
grant update (service_radius_km) on public.professionals to authenticated;

-- Distância (fórmula de haversine) de cada profissional com área definida até o ponto.
create function public.professional_distances(p_lat double precision, p_lng double precision)
returns table (professional_id uuid, distance_km integer, in_range boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         greatest(1, round(d.km))::integer,
         d.km <= p.service_radius_km
  from public.professionals p
  cross join lateral (
    select 6371 * 2 * asin(sqrt(
      power(sin(radians(p.latitude - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - p_lng) / 2), 2)
    )) as km
  ) d
  where p.latitude is not null
    and p.longitude is not null
    and p_lat between -90 and 90
    and p_lng between -180 and 180;
$$;

revoke execute on function public.professional_distances(double precision, double precision) from public;
grant execute on function public.professional_distances(double precision, double precision) to anon, authenticated;
