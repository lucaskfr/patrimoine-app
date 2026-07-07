-- ============================================================
-- Migration 0006 — Revenus récurrents mensuels + date de fin des abonnements
-- Nouvelle table recurring_incomes (miroir de recurring_expenses, montant
-- positif généré automatiquement le jour de réception indiqué).
-- Ajout d'une colonne end_date (nullable) sur recurring_expenses pour
-- arrêter automatiquement la génération d'un abonnement à une date donnée.
-- ============================================================

alter table public.recurring_expenses add column if not exists end_date date;

create table if not exists public.recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null,          -- montant positif du revenu mensuel
  day_of_month integer not null check (day_of_month between 1 and 28),
  active boolean not null default true,   -- permet de mettre en pause sans supprimer
  created_at timestamptz not null default now()
);

alter table public.recurring_incomes enable row level security;

create policy "recurring_incomes_select_own"
  on public.recurring_incomes for select
  using (auth.uid() = user_id);

create policy "recurring_incomes_insert_own"
  on public.recurring_incomes for insert
  with check (auth.uid() = user_id);

create policy "recurring_incomes_update_own"
  on public.recurring_incomes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recurring_incomes_delete_own"
  on public.recurring_incomes for delete
  using (auth.uid() = user_id);

alter table public.movements add column if not exists recurring_income_id uuid references public.recurring_incomes(id) on delete set null;

create index if not exists idx_recurring_incomes_user on public.recurring_incomes(user_id);
create index if not exists idx_movements_recurring_income on public.movements(recurring_income_id);
