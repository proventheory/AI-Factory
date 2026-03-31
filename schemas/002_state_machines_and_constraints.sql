-- State Machine Contract (Section 5B) + additional constraints
-- Enforces allowed status transitions and invariants.

BEGIN;

-- ============================================================
-- State transition guards via trigger functions
-- ============================================================

-- runs.status allowed transitions
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

CREATE TRIGGER trg_run_status_transition
  BEFORE UPDATE OF status ON runs
  FOR EACH ROW
  EXECUTE FUNCTION check_run_status_transition();

-- job_runs.status allowed transitions
CREATE OR REPLACE FUNCTION check_job_run_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'queued'  AND NEW.status = 'running')
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid job_run status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_run_status_transition
  BEFORE UPDATE OF status ON job_runs
  FOR EACH ROW
  EXECUTE FUNCTION check_job_run_status_transition();

-- tool_calls.status allowed transitions
CREATE OR REPLACE FUNCTION check_tool_call_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('running', 'failed'))
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid tool_call status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tool_call_status_transition
  BEFORE UPDATE OF status ON tool_calls
  FOR EACH ROW
  EXECUTE FUNCTION check_tool_call_status_transition();

-- ============================================================
-- Artifact immutability (Section 5D)
-- Prevent updates to uri, sha256 once written
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_artifact_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.uri IS NOT NULL AND NEW.uri IS DISTINCT FROM OLD.uri THEN
    RAISE EXCEPTION 'Artifact uri is immutable once set';
  END IF;
  IF OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    RAISE EXCEPTION 'Artifact sha256 is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artifact_immutability
  BEFORE UPDATE ON artifacts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_artifact_immutability();

-- ============================================================
-- Prevent terminal job_runs from being modified (except metadata)
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_job_run_terminal_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('succeeded', 'failed') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'Cannot change status of terminal job_run (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_run_terminal
  BEFORE UPDATE ON job_runs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_job_run_terminal_immutability();

COMMIT;
