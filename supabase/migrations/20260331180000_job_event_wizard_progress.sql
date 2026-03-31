-- Allow runner to append fine-grained wizard progress (PDF/blog counts) without failing inserts.
DO $$ BEGIN
  ALTER TYPE job_event_type ADD VALUE 'wizard_progress';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
