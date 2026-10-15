-- =============================================================================
-- Serviço em análise pela equipe, visível no app dos dois lados.
-- A denúncia de serviço (reports, reason = servico) só é lida por quem
-- denunciou; orders.disputed_at espelha "há uma aberta" e chega pelo Realtime.
-- =============================================================================

alter table public.orders add column disputed_at timestamptz;

comment on column public.orders.disputed_at is 'Há denúncia de serviço aberta (a equipe está analisando). Mantido pelo gatilho em reports.';

create function private.sync_order_dispute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason = 'servico' and new.order_id is not null then
    update public.orders o
    set disputed_at = case when private.order_disputed(o.id) then coalesce(o.disputed_at, now()) end
    where o.id = new.order_id;
  end if;
  return null;
end;
$$;
revoke all on function private.sync_order_dispute() from public, anon, authenticated;

create trigger reports_sync_order_dispute after insert or update of resolved_at on public.reports
  for each row execute function private.sync_order_dispute();
