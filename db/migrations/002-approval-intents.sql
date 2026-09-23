-- Gate B / S04b: render bundles, approvals, publication intents, results, outbox.
--
-- DIALECT: SQLite (local milestone — see GATE_B_PREP_REVIEW.md correction 1).
-- NOT host qualification. Forward-only.

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
  CHECK (environment IN ('local_test')),
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
  CHECK (environment IN ('local_test')),
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
