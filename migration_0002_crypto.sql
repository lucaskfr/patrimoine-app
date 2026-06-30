-- ============================================================
-- Migration 0002 — Cours crypto en temps réel
-- Étend la table accounts (aucune table existante modifiée en profondeur,
-- aucune donnée existante perdue : toutes les colonnes sont nullable).
-- ============================================================

alter table public.accounts add column if not exists crypto_coin_id text;            -- ex: 'bitcoin', 'ethereum' (identifiant CoinGecko)
alter table public.accounts add column if not exists crypto_quantity numeric(20,8);   -- quantité détenue, saisie manuellement
alter table public.accounts add column if not exists crypto_price_eur numeric(14,2);  -- dernier cours connu en EUR (mis en cache)
alter table public.accounts add column if not exists crypto_price_updated_at timestamptz; -- horodatage de la dernière mise à jour du cours
