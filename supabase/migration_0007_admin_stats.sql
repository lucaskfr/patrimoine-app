-- ============================================================
-- Migration 0007 — Statistiques admin (anonymisées, agrégées)
-- Fonction Postgres "security definer" : tourne avec des droits élevés
-- (bypass RLS) mais vérifie elle-même que l'appelant est bien le compte
-- admin (Lucas) avant de renvoyer quoi que ce soit. Ne renvoie jamais de
-- ligne individuelle, uniquement des agrégats (comptages, moyennes...).
-- ============================================================

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid := '187b2101-a354-4063-985f-72c5c8cf0cd0';
  result jsonb;
begin
  if auth.uid() is distinct from admin_id then
    raise exception 'Accès refusé';
  end if;

  with account_balances as (
    select
      a.id as account_id,
      a.user_id,
      a.type,
      a.cap_type,
      case
        when a.type = 'crypto' and a.crypto_quantity is not null and a.crypto_price_eur is not null
          then a.crypto_quantity * a.crypto_price_eur
        else coalesce((select sum(m.amount) from public.movements m where m.account_id = a.id), 0)
      end as balance
    from public.accounts a
  ),
  user_totals as (
    select user_id, sum(balance) as total_patrimoine
    from account_balances
    group by user_id
  )
  select jsonb_build_object(
    'total_inscrits', (select count(*) from auth.users),
    'utilisateurs_actifs', (select count(distinct user_id) from public.accounts),
    'patrimoine_moyen', (select round(avg(total_patrimoine)::numeric, 2) from user_totals),
    'patrimoine_median', (select round((percentile_cont(0.5) within group (order by total_patrimoine))::numeric, 2) from user_totals),
    'nb_comptes_epargne', (select count(*) from account_balances where type = 'epargne_reglementee'),
    'nb_comptes_investissement', (select count(*) from account_balances where type = 'investissement'),
    'nb_comptes_crypto', (select count(*) from account_balances where type = 'crypto'),
    'nb_utilisateurs_pea', (select count(distinct user_id) from account_balances where cap_type = 'pea'),
    'valeur_moyenne_pea', (select round(avg(balance)::numeric, 2) from account_balances where cap_type = 'pea'),
    'nb_utilisateurs_livret_a', (select count(distinct user_id) from account_balances where cap_type = 'livret_a'),
    'nb_utilisateurs_crypto', (select count(distinct user_id) from account_balances where type = 'crypto' and balance > 0),
    'nb_utilisateurs_investissement', (select count(distinct user_id) from account_balances where type = 'investissement')
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;
