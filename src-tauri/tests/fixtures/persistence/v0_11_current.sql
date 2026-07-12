INSERT INTO projects (id, root_path, created_at, updated_at)
VALUES ('project:fixture', '/fixture/project', '2026-03-01', '2026-03-02');
INSERT INTO files (id, project_id, path, language, content_hash, last_analyzed_hash, status, updated_at)
VALUES ('file:fixture', 'project:fixture', '/fixture/project/query.sql', 'sql', 'hash-v011-current', 'hash-v011-current', 'valid', '2026-03-02');
INSERT INTO code_snapshots (id, project_id, file_id, content_hash, line_count, snapshot_reason, created_at)
VALUES ('snapshot:v011-current', 'project:fixture', 'file:fixture', 'hash-v011-current', 5, 'file_loaded', '2026-03-01');
INSERT INTO explanation_nodes
  (id, project_id, file_id, snapshot_id, explanation_type, code_level_meaning,
   status, schema_version, prompt_version, created_at, updated_at)
VALUES
  ('exp:fixture', 'project:fixture', 'file:fixture', 'snapshot:v011-current', 'statement',
   'Anonymous current 0.11 explanation', 'valid', 'mvp-0.1', 'current-canary',
   '2026-03-01', '2026-03-02');
INSERT INTO explanation_targets
  (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
   snapshot_id, status, created_at, updated_at)
VALUES
  ('target:fixture', 'project:fixture', 'exp:fixture', 'statement', 'file:fixture',
   '/fixture/project/query.sql', 'hash-v011-current', 'snapshot:v011-current', 'valid',
   '2026-03-01', '2026-03-02');
INSERT INTO user_reading_states
  (id, project_id, explanation_id, state, note, updated_at)
VALUES ('reading:fixture', 'project:fixture', 'exp:fixture', 'understood', NULL, '2026-03-02');
INSERT INTO project_guides
  (project_id, root_path, source_fingerprint, generated_at, updated_at)
VALUES ('project:fixture', '/fixture/project', 'guide-v011-current', '2026-03-01', '2026-03-02');
INSERT INTO model_provider_settings
  (id, endpoint, model, timeout_seconds, updated_at)
VALUES ('default', 'https://example.invalid/v1/responses', 'fixture-model-v011-current', 90, '2026-03-02');
INSERT INTO prompt_versions
  (version, status, rollout_percent, rollback_from, notes,
   system_prompt_template, user_prompt_template, created_at, updated_at)
VALUES
  ('current-canary', 'canary', 40, NULL, 'Anonymous current 0.11 canary',
   'You are a fixture.', 'Explain {payload}', '2026-03-01', '2026-03-02');
