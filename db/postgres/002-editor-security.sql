-- PostgreSQL approval, publication intent, result and outbox schema.

CREATE TABLE IF NOT EXISTS render_bundles (
  id               TEXT PRIMARY KEY,
  revision_id      TEXT NOT NULL REFERENCES content_revisions(id),
  revision_sha256  TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  manifest_sha256  TEXT NOT NULL,
  outputs          TEXT NOT NULL,
  asset_sha256s    TEXT NOT NULL DEFAULT '[]',
  validation       TEXT NOT NULL DEFAULT '{}',
  created_at       TEXT NOT NULL
);

-- One revision renders to exactly one bundle, so an approval can name it
-- unambiguously and a re-render cannot silently become a different artifact.
CREATE UNIQUE INDEX IF NOT EXISTS ux_render_bundles_revision
  ON render_bundles (revision_id);

CREATE TABLE IF NOT EXISTS approvals (
  id                TEXT PRIMARY KEY,
  human_subject_id  TEXT NOT NULL,
  revision_id       TEXT NOT NULL REFERENCES content_revisions(id),
  revision_sha256   TEXT NOT NULL,
  bundle_id         TEXT NOT NULL REFERENCES render_bundles(id),
  manifest_sha256   TEXT NOT NULL,
  environment       TEXT NOT NULL,
  channels          TEXT NOT NULL,
  target_ref        TEXT NOT NULL,
  approved_at       TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  state             TEXT NOT NULL,
  invalidated_at    TEXT,
  invalidated_reason TEXT,
  CHECK (environment IN ('local_test','hosted_preview','production')),
  CHECK (state IN ('approved','invalidated','consumed'))
);

CREATE INDEX IF NOT EXISTS ix_approvals_revision_state
  ON approvals (revision_id, state);

CREATE TABLE IF NOT EXISTS publication_intents (
  id                TEXT PRIMARY KEY,
  approval_id       TEXT NOT NULL REFERENCES approvals(id),
  revision_id       TEXT NOT NULL REFERENCES content_revisions(id),
  item_id           TEXT NOT NULL REFERENCES content_items(id),
  channel           TEXT NOT NULL,
  environment       TEXT NOT NULL,
  operation_key     TEXT NOT NULL,
  payload_sha256    TEXT NOT NULL,
  target_ref        TEXT NOT NULL,
  state             TEXT NOT NULL,
  provider_record_id TEXT,
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  lease_token       TEXT,
  lease_expires_at  TEXT,
  verified_at       TEXT,
  last_error_code   TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (channel IN ('website')),
  CHECK (environment IN ('local_test','hosted_preview','production')),
  CHECK (state IN ('intent_recorded','committing','stored','verification_pending','verified','failed','unknown'))
);

-- One logical publication per operation key. A retry reads this row; it never
-- creates a second logical send.
CREATE UNIQUE INDEX IF NOT EXISTS ux_publication_intents_operation
  ON publication_intents (operation_key);

CREATE INDEX IF NOT EXISTS ix_publication_intents_item
  ON publication_intents (item_id, revision_id);

CREATE TABLE IF NOT EXISTS publication_results (
  id               TEXT PRIMARY KEY,
  intent_id        TEXT NOT NULL REFERENCES publication_intents(id),
  observed_at      TEXT NOT NULL,
  state            TEXT NOT NULL,
  http_status      INTEGER,
  response_sha256  TEXT,
  revision_marker  TEXT,
  canonical_url    TEXT,
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS ix_publication_results_intent
  ON publication_results (intent_id, observed_at);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id               TEXT PRIMARY KEY,
  intent_id        TEXT NOT NULL REFERENCES publication_intents(id),
  operation_key    TEXT NOT NULL,
  state            TEXT NOT NULL,
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  lease_token      TEXT,
  lease_expires_at TEXT,
  last_error_code  TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (state IN ('intent_recorded','committing','stored','verification_pending','verified','failed','unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_jobs_intent
  ON outbox_jobs (intent_id);


-- The app connects with this bounded role; set a password through the secure operator workflow.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'website_editor') THEN
    CREATE ROLE website_editor NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO website_editor;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.schema_migrations TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.schema_migrations;
CREATE POLICY website_editor_access ON public.schema_migrations FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sources FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sources TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.sources;
CREATE POLICY website_editor_access ON public.sources FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.capture_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capture_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_events TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.capture_events;
CREATE POLICY website_editor_access ON public.capture_events FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.source_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.source_versions TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.source_versions;
CREATE POLICY website_editor_access ON public.source_versions FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.content_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_items TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.content_items;
CREATE POLICY website_editor_access ON public.content_items FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.content_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_revisions TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.content_revisions;
CREATE POLICY website_editor_access ON public.content_revisions FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.render_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_bundles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.render_bundles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.render_bundles TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.render_bundles;
CREATE POLICY website_editor_access ON public.render_bundles FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.approvals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.approvals TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.approvals;
CREATE POLICY website_editor_access ON public.approvals FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.publication_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_intents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_intents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.publication_intents TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.publication_intents;
CREATE POLICY website_editor_access ON public.publication_intents FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.publication_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_results FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.publication_results TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.publication_results;
CREATE POLICY website_editor_access ON public.publication_results FOR ALL TO website_editor USING (true) WITH CHECK (true);

ALTER TABLE public.outbox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.outbox_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outbox_jobs TO website_editor;
DROP POLICY IF EXISTS website_editor_access ON public.outbox_jobs;
CREATE POLICY website_editor_access ON public.outbox_jobs FOR ALL TO website_editor USING (true) WITH CHECK (true);
