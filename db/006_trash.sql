ALTER TABLE moment_link.consultations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE moment_link.consultations ADD COLUMN IF NOT EXISTS delete_after timestamptz;
CREATE INDEX IF NOT EXISTS consultations_trash_expiry ON moment_link.consultations(delete_after) WHERE deleted_at IS NOT NULL;
INSERT INTO moment_link.migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
