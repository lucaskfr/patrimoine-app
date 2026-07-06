-- ============================================================
-- Migration 0003 — Abonnements / dépenses récurrentes mensuelles
-- Nouvelle table (aucune table existante modifiée en profondeur) :
-- recurring_expenses. Ajout d'une colonne nullable recurring_id sur
-- movements pour relier un mouvement généré à son abonnement.
-- ============================================================

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  label text not null,
  amount numeric(14,2) not null,          -- montant positif de la dépense mensuelle
  category text,                          -- catégorie appliquée au mouvement généré
  day_of_month integer not null check (day_of_month between 1 and 28),
  active boolean not null default true,   -- permet de mettre en pause sans supprimer
  created_at timestamptz not null default now()
);

alter table public.recurring_expenses enable row level security;

create policy "recurring_expenses_select_own"
  on public.recurring_expenses for select
  using (auth.uid() = user_id);

create policy "recurring_expenses_insert_own"
  on public.recurring_expenses for insert
  with check (auth.uid() = user_id);

create policy "recurring_expenses_update_own"
  on public.recurring_expenses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recurring_expenses_delete_own"
  on public.recurring_expenses for delete
  using (auth.uid() = user_id);

alter table public.movements add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;

create index if not exists idx_recurring_user on public.recurring_expenses(user_id);
create index if not exists idx_movements_recurring on public.movements(recurring_id);
