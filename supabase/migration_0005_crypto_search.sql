-- ============================================================
-- Migration 0005 — Recherche de cryptos (liste complète CoinGecko)
-- Ajoute une colonne pour mémoriser le libellé affiché de la crypto
-- choisie via la recherche (id CoinGecko déjà stocké dans crypto_coin_id).
-- ============================================================

alter table public.accounts add column if not exists crypto_coin_label text;

update public.accounts set crypto_coin_label = 'Bitcoin (BTC)' where crypto_coin_id = 'bitcoin' and crypto_coin_label is null;
update public.accounts set crypto_coin_label = 'Ethereum (ETH)' where crypto_coin_id = 'ethereum' and crypto_coin_label is null;
