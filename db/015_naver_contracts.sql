CREATE TABLE IF NOT EXISTS moment_link.naver_contracts(
 id uuid PRIMARY KEY,
 consultation_id uuid UNIQUE REFERENCES moment_link.consultations(id) ON DELETE SET NULL,
 fact_id uuid NOT NULL UNIQUE,
 gross bigint NOT NULL CHECK(gross>0 AND gross<=10000000000),
 fee bigint NOT NULL CHECK(fee>=0),
 expected_net bigint NOT NULL CHECK(expected_net=gross-fee),
 remitted bigint CHECK(remitted>=0 AND remitted<=expected_net),
 paid_date date NOT NULL,
 remitted_date date,
 status text NOT NULL CHECK(status IN ('active','cancelled')),
 booking_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 review_text text NOT NULL DEFAULT '',
 fireworks_units integer NOT NULL DEFAULT 0 CHECK(fireworks_units BETWEEN 0 AND 1000),
 version integer NOT NULL DEFAULT 1,
 digest text NOT NULL,
 sync_state text NOT NULL DEFAULT 'waiting',
 sync_attempts integer NOT NULL DEFAULT 0,
 sync_error text,
 sync_request uuid NOT NULL,
 created_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.naver_contract_history(
 id uuid PRIMARY KEY,contract_id uuid NOT NULL REFERENCES moment_link.naver_contracts(id),
 revision integer NOT NULL, action text NOT NULL, data jsonb NOT NULL,
 actor_id uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contract_id,revision)
);
CREATE INDEX IF NOT EXISTS naver_contract_sync_idx ON moment_link.naver_contracts(sync_state,updated_at);

CREATE TABLE IF NOT EXISTS moment_link.release_history(id text PRIMARY KEY,data jsonb NOT NULL,first_seen_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION moment_link.scrub_detached_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.consultation_id IS NULL AND OLD.consultation_id IS NOT NULL THEN
  NEW.review_text:=''; NEW.sync_state:='retained'; NEW.sync_error:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS naver_contract_detach ON moment_link.naver_contracts;
CREATE TRIGGER naver_contract_detach BEFORE UPDATE OF consultation_id ON moment_link.naver_contracts FOR EACH ROW EXECUTE FUNCTION moment_link.scrub_detached_contract();
