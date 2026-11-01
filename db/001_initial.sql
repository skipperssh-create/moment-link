CREATE SCHEMA IF NOT EXISTS moment_link;
CREATE TABLE IF NOT EXISTS moment_link.migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS moment_link.admin_users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','counselor')), active boolean NOT NULL DEFAULT true,
 must_change_password boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES moment_link.admin_users(id),
 csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.config (
 id text PRIMARY KEY, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.catalog_versions (
 version integer PRIMARY KEY, products jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(), actor_id uuid
);
CREATE TABLE IF NOT EXISTS moment_link.consultations (
 id uuid PRIMARY KEY, receipt text UNIQUE NOT NULL, idempotency_hash text UNIQUE NOT NULL, payload_hash text NOT NULL,
 person text NOT NULL, phone text NOT NULL, category text NOT NULL, product_id text NOT NULL, package_id text NOT NULL,
 snapshot jsonb NOT NULL, preferences jsonb NOT NULL, place text NOT NULL, notes text NOT NULL,
 consent jsonb NOT NULL, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','consulting','hold','confirmed','closed','cancelled')),
 assignee uuid REFERENCES moment_link.admin_users(id), contacted boolean NOT NULL DEFAULT false, read_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultations_created ON moment_link.consultations(created_at DESC);
CREATE TABLE IF NOT EXISTS moment_link.consultation_notes (
 id uuid PRIMARY KEY, consultation_id uuid NOT NULL REFERENCES moment_link.consultations(id), actor_id uuid NOT NULL,
 body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.audit_logs (
 id uuid PRIMARY KEY, actor_id uuid, action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS moment_link.media (
 id uuid PRIMARY KEY, mime text NOT NULL, bytes bytea NOT NULL, alt text NOT NULL,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.push_subscriptions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES moment_link.admin_users(id), endpoint_hash text UNIQUE NOT NULL,
 subscription jsonb NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.outbox (
 id uuid PRIMARY KEY, event_key text UNIQUE NOT NULL, consultation_id uuid NOT NULL REFERENCES moment_link.consultations(id),
 channel text NOT NULL CHECK(channel IN ('sms_customer','sms_admin','push')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','blocked','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0, provider_id text, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.integration_jobs (
 id uuid PRIMARY KEY, consultation_id uuid NOT NULL REFERENCES moment_link.consultations(id), target text NOT NULL,
 external_ref text UNIQUE NOT NULL, approved_by uuid NOT NULL, booking jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','checking','succeeded','conflict','failed','uncertain','blocked')),
 attempts integer NOT NULL DEFAULT 0, external_id text, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(consultation_id)
);
INSERT INTO moment_link.migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
