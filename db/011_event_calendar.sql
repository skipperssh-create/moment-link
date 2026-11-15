-- Calendar links are separate from OPS jobs and from reservation source records.
CREATE TABLE IF NOT EXISTS moment_link.event_calendar_jobs (
 consultation_id uuid PRIMARY KEY REFERENCES moment_link.consultations(id) ON DELETE CASCADE,
 desired jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 synced_revision integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','synced','failed','conflict')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),
 event_id text,
 remote_snapshot jsonb,
 lease_token uuid,
 lease_until timestamptz,
 error_code text,
 synced_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_calendar_pending ON moment_link.event_calendar_jobs(state,updated_at);
CREATE OR REPLACE FUNCTION moment_link.event_calendar_payload(c moment_link.consultations) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',c.id,'receipt',c.receipt,'category',c.category,'person',c.person,'phone',c.phone,'status',CASE WHEN c.deleted_at IS NOT NULL THEN 'cancelled' ELSE c.status END,'booking',c.communication->'booking','snapshot',c.snapshot,'notes',c.notes)
$$;
CREATE OR REPLACE FUNCTION moment_link.queue_event_calendar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; payload jsonb;
BEGIN
 SELECT desired INTO previous FROM moment_link.event_calendar_jobs WHERE consultation_id=NEW.id;
 IF previous IS NULL AND (NEW.category NOT IN ('visit','trunk') OR NEW.status<>'confirmed' OR NOT (NEW.communication ? 'reservation') OR NEW.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
 IF previous IS NOT NULL AND (NEW.category NOT IN ('visit','trunk') OR NEW.status<>'confirmed') THEN
  -- Reopening a consultation keeps the last confirmed schedule. Only the label changes.
  payload=jsonb_set(previous,'{status}',to_jsonb(CASE WHEN NEW.deleted_at IS NOT NULL OR NEW.category NOT IN ('visit','trunk') THEN 'cancelled' ELSE NEW.status END));
 ELSE payload=moment_link.event_calendar_payload(NEW);
 END IF;
 IF COALESCE(payload->'booking'->>'date','')='' OR COALESCE(payload->'booking'->>'time','')='' THEN RETURN NEW; END IF;
 INSERT INTO moment_link.event_calendar_jobs(consultation_id,desired) VALUES(NEW.id,payload)
 ON CONFLICT(consultation_id) DO UPDATE SET desired=excluded.desired,revision=event_calendar_jobs.revision+1,state='pending',attempts=0,error_code=NULL,updated_at=now()
 WHERE event_calendar_jobs.desired IS DISTINCT FROM excluded.desired;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER queue_event_calendar AFTER INSERT OR UPDATE ON moment_link.consultations
 FOR EACH ROW EXECUTE FUNCTION moment_link.queue_event_calendar();
