-- 006_wallet_deployment.sql: Track Safe contract deployment status

alter table public.wallets
  add column if not exists deployed_at timestamptz,
  add column if not exists deployed_tx_hash text;
