INSERT INTO projects (id, root_path, created_at, updated_at)
VALUES ('project:fixture', '/fixture/project', '2026-01-01', '2026-01-02');
INSERT INTO files (id, project_id, path, language, content_hash, last_analyzed_hash, status, updated_at)
VALUES ('file:fixture', 'project:fixture', '/fixture/project/main.ts', 'typescript', 'hash-v010', 'hash-v010', 'valid', '2026-01-02');
INSERT INTO code_snapshots (id, project_id, file_id, content_hash, line_count, snapshot_reason, created_at)
VALUES ('snapshot:v010', 'project:fixture', 'file:fixture', 'hash-v010', 3, 'file_loaded', '2026-01-01');
INSERT INTO explanation_nodes
  (id, project_id, file_id, snapshot_id, explanation_type, code_level_meaning,
   status, schema_version, prompt_version, created_at, updated_at)
VALUES
  ('exp:fixture', 'project:fixture', 'file:fixture', 'snapshot:v010', 'file',
   'Anonymous 0.10 explanation', 'valid', 'mvp-0.1', 'code-explanation-v0.1',
   '2026-01-01', '2026-01-02');
INSERT INTO explanation_targets
  (id, project_id, explanation_id, target_type, file_id, file_path, file_hash,
   snapshot_id, status, created_at, updated_at)
VALUES
  ('target:fixture', 'project:fixture', 'exp:fixture', 'file', 'file:fixture',
   '/fixture/project/main.ts', 'hash-v010', 'snapshot:v010', 'valid',
   '2026-01-01', '2026-01-02');
INSERT INTO explanation_feedback
  (id, project_id, explanation_id, feedback_type, user_note, created_at)
VALUES ('feedback:fixture', 'project:fixture', 'exp:fixture', 'helpful', NULL, '2026-01-02');
INSERT INTO user_reading_states
  (id, project_id, explanation_id, state, note, updated_at)
VALUES ('reading:fixture', 'project:fixture', 'exp:fixture', 'understood', NULL, '2026-01-02');
INSERT INTO project_guides
  (project_id, root_path, source_fingerprint, generated_at, updated_at)
VALUES ('project:fixture', '/fixture/project', 'guide-v010', '2026-01-01', '2026-01-02');
INSERT INTO model_provider_settings
  (id, endpoint, model, timeout_seconds, updated_at)
VALUES ('default', 'https://example.invalid/v1/chat/completions', 'fixture-model-v010', 60, '2026-01-02');
