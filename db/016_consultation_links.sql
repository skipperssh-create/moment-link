-- Archive duplicate intakes without changing reservation rows or external jobs.
CREATE TABLE IF NOT EXISTS moment_link.consultation_links(
 source_id uuid PRIMARY KEY REFERENCES moment_link.consultations(id) ON DELETE CASCADE,
 target_id uuid REFERENCES moment_link.consultations(id) ON DELETE SET NULL,
 linked_by uuid REFERENCES moment_link.admin_users(id) ON DELETE SET NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 source_version integer NOT NULL,
 target_version integer NOT NULL,
 request_id uuid UNIQUE NOT NULL,
 CHECK(source_id<>target_id)
);
CREATE INDEX IF NOT EXISTS consultation_links_target_idx ON moment_link.consultation_links(target_id);
ALTER TABLE moment_link.finance_booking_facts ADD COLUMN IF NOT EXISTS merged_into uuid;
