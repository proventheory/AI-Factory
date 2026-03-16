-- Ensure worker_registry exists (runner needs it to register and heartbeat).
-- Idempotent: safe to run if 001_core_schema or 20250303000000_ai_factory_core already created it.
CREATE TABLE IF NOT EXISTS worker_registry (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id         text        NOT NULL UNIQUE,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  runner_version    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
