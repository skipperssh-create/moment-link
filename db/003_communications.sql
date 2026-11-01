-- Additive, private per-consultation guidance; removed with the consultation at retention expiry.
ALTER TABLE moment_link.consultations ADD COLUMN IF NOT EXISTS communication jsonb NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO moment_link.migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
