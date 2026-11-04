-- Extend the existing constraint in place so repeated migrations preserve these states.
DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='moment_link.consultations'::regclass
   AND conname='consultations_status_workflow_check'
   AND position('initial_unreachable' in pg_get_constraintdef(oid))>0
 ) THEN
  ALTER TABLE moment_link.consultations DROP CONSTRAINT IF EXISTS consultations_status_workflow_check;
  ALTER TABLE moment_link.consultations ADD CONSTRAINT consultations_status_workflow_check
   CHECK (status IN ('new','initial_unreachable','consulting','no_response','awaiting_payment','confirmed','hold','closed','cancelled'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS consultation_notes_latest_idx
 ON moment_link.consultation_notes(consultation_id,created_at DESC,id DESC);
