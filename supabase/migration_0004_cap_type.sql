-- ============================================================
-- Migration 0004 — Comptes personnalisés par l'utilisateur
-- Ajoute une colonne cap_type sur accounts pour découpler le plafond
-- réglementé (Livret A / LDD / PEA) du nom du compte, désormais libre.
-- Rétro-remplit les comptes existants de l'utilisateur d'après leur nom
-- actuel, pour que les jauges de plafond continuent de fonctionner.
-- ============================================================

alter table public.accounts add column if not exists cap_type text check (cap_type in ('livret_a', 'ldd', 'pea') or cap_type is null);

update public.accounts set cap_type = 'livret_a' where name = 'Livret A' and cap_type is null;
update public.accounts set cap_type = 'ldd' where name = 'LDD' and cap_type is null;
update public.accounts set cap_type = 'pea' where name = 'PEA' and cap_type is null;
