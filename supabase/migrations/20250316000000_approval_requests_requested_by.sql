-- Approval queue contract: who requested the approval (Plan 12B.4)
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS requested_by text DEFAULT 'scheduler';
