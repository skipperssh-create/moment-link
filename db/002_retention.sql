ALTER TABLE moment_link.consultations ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE moment_link.consultations SET expires_at=created_at+make_interval(days=>COALESCE((consent->>'retentionDays')::integer,30)) WHERE expires_at IS NULL;
ALTER TABLE moment_link.consultations ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS consultations_expiry ON moment_link.consultations(expires_at);
INSERT INTO moment_link.migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
