-- Gate B / S04a: sources and immutable content revisions.
--
-- DIALECT: SQLite (local milestone decision — see hermes-handoff/GATE_B_PREP.md
-- section 5 and GATE_B_PREP_REVIEW.md correction 1). This is NOT host
-- qualification: concurrency, locking, permissions and transaction behaviour
-- must be requalified against Postgres before any hosted editorial use.
-- Hand-written in a portable subset so that requalification is a review, not a
-- rewrite: TEXT/INTEGER only, app-generated ids, UTC ISO-8601 TEXT timestamps,
-- booleans as INTEGER 0/1, no dialect-specific functions.
--
-- Forward-only. There is no down migration; the disposable local database is
-- removed as a file instead.

CREATE TABLE IF NOT EXISTS sources (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL,
  provider           TEXT NOT NULL,
  upstream_id        TEXT,
  canonical_url      TEXT NOT NULL,
  original_url       TEXT NOT NULL,
  title              TEXT NOT NULL,
  authors            TEXT,
  published_at       TEXT,
  updated_at         TEXT,
  retrieved_at       TEXT NOT NULL,
  access_level       TEXT NOT NULL,
  retrieval_state    TEXT NOT NULL,
  current_version_id TEXT,
  privacy_flags      TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL,
  CHECK (access_level IN ('metadata_only','abstract_only','partial','full_verified','unavailable','blocked')),
  CHECK (retrieval_state IN ('queued','fetching','metadata_only','abstract_only','partial','full_verified','unavailable','blocked','retry_wait'))
);

-- A source is identified by its provider identity when one exists. Absent
-- upstream identity is stored as NULL and never invented, so the unique index
-- is partial rather than a fake sentinel value.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sources_provider_upstream
  ON sources (provider, upstream_id)
  WHERE upstream_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS capture_events (
  id                 TEXT PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES sources(id),
  adapter            TEXT NOT NULL,
  captured_at        TEXT NOT NULL,
  origin             TEXT NOT NULL,
  note               TEXT,
  referring_url      TEXT,
  upstream_id        TEXT,
  CHECK (origin IN ('human','fixture'))
);

CREATE INDEX IF NOT EXISTS ix_capture_events_source ON capture_events (source_id);

CREATE TABLE IF NOT EXISTS source_versions (
  id                 TEXT PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES sources(id),
  fingerprint        TEXT NOT NULL,
  version_label      TEXT,
  retrieved_url      TEXT NOT NULL,
  retrieved_at       TEXT NOT NULL,
  source_updated_at  TEXT,
  access_level       TEXT NOT NULL,
  outcome            TEXT NOT NULL,
  content_sha256     TEXT,
  metadata           TEXT NOT NULL DEFAULT '{}',
  extract_locators   TEXT NOT NULL DEFAULT '[]',
  backend            TEXT,
  created_at         TEXT NOT NULL,
  CHECK (access_level IN ('metadata_only','abstract_only','partial','full_verified','unavailable','blocked')),
  CHECK (outcome IN ('queued','fetching','metadata_only','abstract_only','partial','full_verified','unavailable','blocked','retry_wait'))
);

-- Immutability: one row per (source, fingerprint). A changed source produces a
-- new version row; it never mutates history.
CREATE UNIQUE INDEX IF NOT EXISTS ux_source_versions_source_fingerprint
  ON source_versions (source_id, fingerprint);

CREATE TABLE IF NOT EXISTS content_items (
  id                    TEXT PRIMARY KEY,
  type                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  visibility            TEXT NOT NULL,
  current_revision_id   TEXT,
  published_revision_id TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  CHECK (type IN ('article','project','issue')),
  CHECK (visibility IN ('private','review','public'))
);

-- Slugs are unique per content type. A single published_revision_id column is
-- what enforces "at most one active publish pointer per content item".
CREATE UNIQUE INDEX IF NOT EXISTS ux_content_items_type_slug
  ON content_items (type, slug);

CREATE TABLE IF NOT EXISTS content_revisions (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL REFERENCES content_items(id),
  parent_revision_id TEXT REFERENCES content_revisions(id),
  revision_number    INTEGER NOT NULL,
  origin             TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  title              TEXT NOT NULL,
  summary            TEXT,
  byline             TEXT,
  blocks             TEXT NOT NULL,
  source_version_ids TEXT NOT NULL DEFAULT '[]',
  asset_ids          TEXT NOT NULL DEFAULT '[]',
  content_sha256     TEXT NOT NULL,
  editorial_state    TEXT NOT NULL,
  unresolved_questions TEXT NOT NULL DEFAULT '[]',
  CHECK (origin IN ('human','model','fixture')),
  CHECK (editorial_state IN ('draft','in_review','approved','published','superseded'))
);

-- Immutable revisions: identical content cannot be stored twice for one item,
-- and revision numbers cannot collide.
CREATE UNIQUE INDEX IF NOT EXISTS ux_content_revisions_item_hash
  ON content_revisions (item_id, content_sha256);

CREATE UNIQUE INDEX IF NOT EXISTS ux_content_revisions_item_number
  ON content_revisions (item_id, revision_number);

CREATE INDEX IF NOT EXISTS ix_content_revisions_item ON content_revisions (item_id);
