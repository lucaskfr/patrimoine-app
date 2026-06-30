-- ============================================================
-- Patrimoine App - Schéma de données Supabase
-- A exécuter dans : Dashboard Supabase > SQL Editor > New query
-- ============================================================

-- Extension pour générer des UUID
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------
-- Table des comptes (Compte Courant, Livret A, LDD, PEL, PEA, Kraken, Bitstack)
-- ----------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('courant', 'epargne_reglementee', 'investissement', 'crypto')),
  color text not null default '#0a2540',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

create policy "accounts_select_own"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "accounts_insert_own"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "accounts_update_own"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "accounts_delete_own"
  on public.accounts for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------
-- Table des mouvements (versements, retraits, dépenses)
-- ----------------------------------------------------------
create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  date date not null default current_date,
  amount numeric(14,2) not null, -- positif = entrée/versement, négatif = dépense/retrait
  category text, -- uniquement pour le compte courant : Logement, Alimentation, Transport, Loisirs, Abonnements, Santé, Autre
  note text,
  is_initial boolean not null default false, -- true pour le solde de départ saisi à l'onboarding
  created_at timestamptz not null default now()
);

alter table public.movements enable row level security;

create policy "movements_select_own"
  on public.movements for select
  using (auth.uid() = user_id);

create policy "movements_insert_own"
  on public.movements for insert
  with check (auth.uid() = user_id);

create policy "movements_update_own"
  on public.movements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "movements_delete_own"
  on public.movements for delete
  using (auth.uid() = user_id);

-- Index utiles
create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_movements_user on public.movements(user_id);
create index if not exists idx_movements_account on public.movements(account_id);
create index if not exists idx_movements_date on public.movements(date);
