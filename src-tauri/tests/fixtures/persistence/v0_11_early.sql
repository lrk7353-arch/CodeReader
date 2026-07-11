INSERT INTO projects (id, root_path, created_at, updated_at)
VALUES ('project:fixture', '/fixture/project', '2026-02-01', '2026-02-02');
INSERT INTO files (id, project_id, path, language, content_hash, last_analyzed_hash, status, updated_at)
VALUES ('file:fixture', 'project:fixture', '/fixture/project/main.py', 'python', 'hash-v011-early', 'hash-v011-early', 'valid', '2026-02-02');
INSERT INTO code_snapshots (id, project_id, file_id, content_hash, line_count, snapshot_reason, created_at)
VALUES ('snapshot:v011-early', 'project:fixture', 'file:fixture', 'hash-v011-early', 4, 'file_loaded', '2026-02-01');
INSERT INTO explanation_nodes
  (id, project_id, file_id, snapshot_id, explanation_type, code_level_meaning,
   status, schema_version, prompt_version, created_at, updated_at)
VALUES
  ('exp:fixture', 'project:fixture', 'file:fixture', 'snapshot:v011-early', 'function',
   'Anonymous early 0.11 explanation', 'valid', 'mvp-0.1', 'legacy-canary',
   '2026-02-01', '2026-02-02');
INSERT INTO explanation_targets
  (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
   snapshot_id, status, created_at, updated_at)
VALUES
  ('target:fixture', 'project:fixture', 'exp:fixture', 'function', 'file:fixture',
   '/fixture/project/main.py', 'hash-v011-early', 'snapshot:v011-early', 'valid',
   '2026-02-01', '2026-02-02');
INSERT INTO user_reading_states
  (id, project_id, explanation_id, state, note, updated_at)
VALUES ('reading:fixture', 'project:fixture', 'exp:fixture', 'read', NULL, '2026-02-02');
INSERT INTO project_guides
  (project_id, root_path, source_fingerprint, generated_at, updated_at)
VALUES ('project:fixture', '/fixture/project', 'guide-v011-early', '2026-02-01', '2026-02-02');
INSERT INTO model_provider_settings
  (id, endpoint, model, timeout_seconds, updated_at)
VALUES ('default', 'https://example.invalid/v1/chat/completions', 'fixture-model-v011-early', 75, '2026-02-02');
INSERT INTO prompt_versions
  (version, status, rollout_percent, rollback_from, notes, created_at, updated_at)
VALUES ('legacy-canary', 'canary', 25, NULL, 'Anonymous early 0.11 canary', '2026-02-01', '2026-02-02');
