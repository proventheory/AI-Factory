-- Partial run completion: when parallel plan branches mix success and failure (e.g. WP→Shopify
-- PDF path succeeds while content path fails), surface `partial` instead of lumping with full `failed`.

BEGIN;

ALTER TYPE run_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE run_event_type ADD VALUE IF NOT EXISTS 'partial';

CREATE OR REPLACE FUNCTION check_run_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'queued'   AND NEW.status IN ('running', 'failed'))
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed', 'rolled_back', 'partial'))
    OR (OLD.status = 'failed'  AND NEW.status = 'rolled_back')
    OR (OLD.status = 'partial' AND NEW.status = 'rolled_back')
  ) THEN
    RAISE EXCEPTION 'Invalid run status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
