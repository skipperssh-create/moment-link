-- Accounting survives consultation retention/deletion; no pasted text or plaintext phone is retained here.
CREATE TABLE IF NOT EXISTS moment_link.lovehunter_referrals (
 id uuid PRIMARY KEY,
 phone_hash text NOT NULL UNIQUE,
 consultation_id uuid REFERENCES moment_link.consultations(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('general','visit')),
 amount integer NOT NULL CHECK((kind='general' AND amount=50000) OR (kind='visit' AND amount=40000)),
 received_date date NOT NULL,
 created_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lovehunter_referrals_month ON moment_link.lovehunter_referrals(received_date);
