-- =============================================================================
-- As fotos do "serviço feito" ficam guardadas quando o cliente diz que não foi
-- feito (e quando a equipe não confirma): são a prova que a equipe olha numa
-- disputa. Só um novo "serviço feito" (depois de remarcar) as substitui.
-- =============================================================================

create or replace function public.confirm_order_done(p_order_id uuid, p_done boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders := private.lock_order(p_order_id);
begin
  if auth.uid() <> v_order.client_id then
    raise exception 'Só o cliente confirma o serviço' using errcode = '42501';
  end if;
  if v_order.done_at is null then
    raise exception 'O profissional ainda não marcou o serviço como feito' using errcode = 'P0001';
  end if;

  if p_done then
    return private.finish_order(v_order, 'cliente', 'Serviço concluído');
  end if;

  update public.orders
  set done_at = null, done_contested_at = now(), done_blocked = true, confirm_reminders = 0, help_requested_at = null
  where id = v_order.id
  returning * into v_order;

  perform private.order_note(v_order, format(
    '%s disse que o serviço não foi feito. Remarquem ou cancelem.', private.first_name(v_order.client_id)
  ));
  return v_order;
end;
$$;

create or replace function public.admin_resolve_service(p_report_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_report public.reports;
  v_order public.orders;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.reason <> 'servico' or v_report.order_id is null then
    raise exception 'Denúncia de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_report.resolved_at is not null then
    raise exception 'Esta denúncia já foi resolvida' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = v_report.order_id for update;

  update public.reports
  set resolved_at = now(), resolved_by = v_admin,
      resolution = case when p_done then 'Serviço feito: concluído pela equipe' else 'Serviço não confirmado pela equipe' end
  where id = p_report_id;

  if v_order.status = 'combinado' then
    if p_done then
      if v_order.done_contested_at is not null and v_order.done_at is null then
        update public.orders set client_contest_wrong = true where id = v_order.id;
      end if;
      perform private.finish_order(v_order, 'equipe', 'A equipe do Resolve confirmou que o serviço foi feito. Serviço concluído.');
    else
      update public.orders
      set done_at = null, done_blocked = true, help_requested_at = null
      where id = v_order.id
      returning * into v_order;
      perform private.order_note(v_order, 'A equipe do Resolve não confirmou que o serviço foi feito. Remarquem ou cancelem.');
    end if;
  end if;

  perform private.admin_audit(v_admin, 'resolver_servico', p_report_id, jsonb_build_object('order', v_order.id, 'done', p_done));
end;
$$;
