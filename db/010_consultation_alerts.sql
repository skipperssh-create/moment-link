-- Notification state only. Existing reservations and integration jobs are untouched.
CREATE TABLE IF NOT EXISTS moment_link.consultation_alerts (
 consultation_id uuid PRIMARY KEY REFERENCES moment_link.consultations(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_at timestamptz,
 acknowledged_by uuid REFERENCES moment_link.admin_users(id)
);
CREATE TABLE IF NOT EXISTS moment_link.push_alert_deliveries (
 consultation_id uuid NOT NULL REFERENCES moment_link.consultation_alerts(consultation_id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES moment_link.push_subscriptions(id) ON DELETE CASCADE,
 next_at timestamptz NOT NULL DEFAULT now(),
 last_sent_at timestamptz,
 failures integer NOT NULL DEFAULT 0,
 sent_count integer NOT NULL DEFAULT 0,
 error_code text,
 PRIMARY KEY (consultation_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS push_alerts_due ON moment_link.push_alert_deliveries(next_at) WHERE failures<2;
INSERT INTO moment_link.migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
