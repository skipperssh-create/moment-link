-- Forward-only enrollment. No backfill, reservation UPDATE or BOATN job writes.
CREATE TABLE IF NOT EXISTS moment_link.seollem_booking_jobs (
 consultation_id uuid PRIMARY KEY REFERENCES moment_link.consultations(id) ON DELETE CASCADE,
 desired jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, synced_revision integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','synced','failed','conflict')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
 external_id text, delivery jsonb, lease_token uuid, lease_until timestamptz, error_code text, synced_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION moment_link.queue_seollem_booking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; payload jsonb;
BEGIN
 SELECT desired INTO previous FROM moment_link.seollem_booking_jobs WHERE consultation_id=NEW.id;
 IF previous IS NULL THEN
  IF NEW.category NOT IN ('visit','trunk') OR NEW.status<>'confirmed' OR NOT(NEW.communication ? 'reservation') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Existing confirmed/reopened/cancelled reservations never enroll retroactively.
  IF TG_OP='UPDATE' AND (OLD.communication ? 'reservation') THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM moment_link.integration_jobs WHERE consultation_id=NEW.id) THEN RETURN NEW; END IF;
 END IF;
 IF previous IS NOT NULL AND (NEW.category NOT IN ('visit','trunk') OR NEW.status<>'confirmed' OR NEW.deleted_at IS NOT NULL) THEN
  payload=jsonb_set(previous,'{status}',to_jsonb(CASE WHEN NEW.deleted_at IS NOT NULL OR NEW.category NOT IN ('visit','trunk') THEN 'cancelled' ELSE NEW.status END));
 ELSE
  payload=moment_link.event_calendar_payload(NEW)||jsonb_build_object('productId',NEW.product_id,'packageId',NEW.package_id,'consent',NEW.consent);
 END IF;
 IF COALESCE(payload->'booking'->>'date','')='' OR COALESCE(payload->'booking'->>'time','')='' THEN RETURN NEW; END IF;
 INSERT INTO moment_link.seollem_booking_jobs(consultation_id,desired) VALUES(NEW.id,payload)
 ON CONFLICT(consultation_id) DO UPDATE SET desired=excluded.desired,revision=seollem_booking_jobs.revision+1,
  state=CASE WHEN seollem_booking_jobs.state='conflict' THEN 'conflict' ELSE 'pending' END,
  attempts=CASE WHEN seollem_booking_jobs.state='conflict' THEN seollem_booking_jobs.attempts ELSE 0 END,
  error_code=CASE WHEN seollem_booking_jobs.state='conflict' THEN seollem_booking_jobs.error_code ELSE NULL END,updated_at=now()
 WHERE seollem_booking_jobs.desired IS DISTINCT FROM excluded.desired;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER queue_seollem_booking AFTER INSERT OR UPDATE ON moment_link.consultations
 FOR EACH ROW EXECUTE FUNCTION moment_link.queue_seollem_booking();
