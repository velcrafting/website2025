CREATE INDEX IF NOT EXISTS ix_approvals_bundle_fk
  ON approvals (bundle_id);

CREATE INDEX IF NOT EXISTS ix_content_revisions_parent_fk
  ON content_revisions (parent_revision_id);

CREATE INDEX IF NOT EXISTS ix_publication_intents_approval_fk
  ON publication_intents (approval_id);

CREATE INDEX IF NOT EXISTS ix_publication_intents_revision_fk
  ON publication_intents (revision_id);
