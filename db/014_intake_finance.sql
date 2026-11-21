CREATE TABLE IF NOT EXISTS moment_link.consultation_sources (
 consultation_id uuid PRIMARY KEY REFERENCES moment_link.consultations(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('lovehunter','seollem','other')),
 source_label text NOT NULL DEFAULT '',
 received_date date NOT NULL,
 created_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.intake_requests (
 request_key text PRIMARY KEY, payload_hash text NOT NULL,
 consultation_id uuid REFERENCES moment_link.consultations(id) ON DELETE SET NULL,
 charged boolean NOT NULL, amount integer NOT NULL CHECK(amount>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_link.finance_months (
 month text PRIMARY KEY CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 advertising_amount bigint CHECK(advertising_amount BETWEEN 0 AND 10000000000),
 advertising_paid bigint CHECK(advertising_paid BETWEEN 0 AND advertising_amount),
 referral_paid bigint CHECK(referral_paid BETWEEN 0 AND 10000000000),
 note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(advertising_paid IS NULL OR advertising_amount IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS moment_link.finance_costs (
 id uuid PRIMARY KEY, month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 category text NOT NULL CHECK(category IN ('materials','labor','travel','venue','other')),
 source text NOT NULL CHECK(source IN ('lovehunter','seollem','other','shared')),
 vendor text NOT NULL DEFAULT '', amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 10000000000),
 paid bigint CHECK(paid BETWEEN 0 AND amount),
 vat bigint CHECK(vat BETWEEN 0 AND amount), evidence text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 voided boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 created_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_costs_month_idx ON moment_link.finance_costs(month);
CREATE TABLE IF NOT EXISTS moment_link.finance_history (
 id uuid PRIMARY KEY, month text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
 before_value jsonb, after_value jsonb NOT NULL, actor_id uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_history_month_idx ON moment_link.finance_history(month,created_at);

-- Anonymous management facts survive consultation retention; no names, phones or notes are copied.
CREATE TABLE IF NOT EXISTS moment_link.finance_booking_facts(
 id uuid PRIMARY KEY, consultation_id uuid UNIQUE REFERENCES moment_link.consultations(id) ON DELETE SET NULL,
 received_date date NOT NULL, event_date text NOT NULL DEFAULT '', source text NOT NULL DEFAULT 'unknown',
 source_label text NOT NULL DEFAULT '', category text NOT NULL, status text NOT NULL,
 reserved boolean NOT NULL, financial jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION moment_link.capture_finance_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src record; b jsonb; a jsonb; financial jsonb;
BEGIN
 SELECT source,source_label,received_date INTO src FROM moment_link.consultation_sources WHERE consultation_id=NEW.id;
 b=COALESCE(NEW.communication->'booking','{}'::jsonb);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('reduction',v->'reduction','refund',v->'refund','at',v->'at')),'[]'::jsonb) INTO a
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.communication->'adjustments')='array' THEN NEW.communication->'adjustments' ELSE '[]'::jsonb END) v;
 financial=jsonb_build_object('amount',b->'amount','receivedAmount',b->'receivedAmount','refundedAmount',b->'refundedAmount','adjustments',a);
 INSERT INTO moment_link.finance_booking_facts(id,consultation_id,received_date,event_date,source,source_label,category,status,reserved,financial)
 VALUES(NEW.id,NEW.id,COALESCE(src.received_date,(NEW.created_at AT TIME ZONE 'Asia/Seoul')::date),
 COALESCE(b->>'date',''),COALESCE(src.source,CASE WHEN NEW.communication->'entry'->>'source' IN ('lovehunter','seollem','other') THEN NEW.communication->'entry'->>'source' ELSE 'unknown' END),
 COALESCE(src.source_label,''),NEW.category,NEW.status,NEW.communication ? 'reservation',financial)
 ON CONFLICT(id) DO UPDATE SET event_date=EXCLUDED.event_date,source=EXCLUDED.source,source_label=EXCLUDED.source_label,
 received_date=EXCLUDED.received_date,category=EXCLUDED.category,status=EXCLUDED.status,reserved=EXCLUDED.reserved,financial=EXCLUDED.financial,updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_booking_capture ON moment_link.consultations;
CREATE TRIGGER finance_booking_capture AFTER INSERT OR UPDATE ON moment_link.consultations FOR EACH ROW EXECUTE FUNCTION moment_link.capture_finance_booking();
CREATE OR REPLACE FUNCTION moment_link.capture_finance_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE moment_link.finance_booking_facts SET source=NEW.source,source_label=NEW.source_label,received_date=NEW.received_date,updated_at=now() WHERE id=NEW.consultation_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS finance_source_capture ON moment_link.consultation_sources;
CREATE TRIGGER finance_source_capture AFTER INSERT ON moment_link.consultation_sources FOR EACH ROW EXECUTE FUNCTION moment_link.capture_finance_source();
-- Read-only projection of existing bookings. No consultation or OPS row is updated.
INSERT INTO moment_link.finance_booking_facts(id,consultation_id,received_date,event_date,source,source_label,category,status,reserved,financial)
SELECT c.id,c.id,COALESCE(s.received_date,(c.created_at AT TIME ZONE 'Asia/Seoul')::date),COALESCE(c.communication->'booking'->>'date',''),
COALESCE(s.source,CASE WHEN c.communication->'entry'->>'source' IN ('lovehunter','seollem','other') THEN c.communication->'entry'->>'source' ELSE 'unknown' END),
COALESCE(s.source_label,''),c.category,c.status,c.communication ? 'reservation',
jsonb_build_object('amount',c.communication->'booking'->'amount','receivedAmount',c.communication->'booking'->'receivedAmount',
'refundedAmount',c.communication->'booking'->'refundedAmount','adjustments',COALESCE((
SELECT jsonb_agg(jsonb_build_object('reduction',v->'reduction','refund',v->'refund','at',v->'at')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.communication->'adjustments')='array' THEN c.communication->'adjustments' ELSE '[]'::jsonb END) v),'[]'::jsonb))
FROM moment_link.consultations c LEFT JOIN moment_link.consultation_sources s ON s.consultation_id=c.id
ON CONFLICT(id) DO NOTHING;
