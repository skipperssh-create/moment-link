-- Add payment waiting without changing any existing consultation or reservation.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='moment_link.consultations'::regclass AND conname='consultations_status_workflow_check') THEN
  ALTER TABLE moment_link.consultations DROP CONSTRAINT IF EXISTS consultations_status_check;
  ALTER TABLE moment_link.consultations ADD CONSTRAINT consultations_status_workflow_check
   CHECK (status IN ('new','consulting','awaiting_payment','confirmed','hold','closed','cancelled'));
 END IF;
END $$;
