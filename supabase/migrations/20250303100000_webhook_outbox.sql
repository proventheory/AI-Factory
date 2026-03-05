-- Webhook outbox: delivery status, retries, idempotency. Used for monitoring + retry/inspect (System branch).
-- See docs/MENU_AND_NAV_IMPLEMENTATION_PLAN.md and NAV_ARCHITECTURE_TRAPS_AND_FIXES.md.

BEGIN;

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  next_retry_at   timestamptz,
  idempotency_key text,
  destination     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON webhook_outbox (status);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_created_at ON webhook_outbox (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_next_retry ON webhook_outbox (next_retry_at) WHERE status = 'pending';

COMMENT ON TABLE webhook_outbox IS 'Outbox for webhook delivery; supports retries and idempotency';

COMMIT;
