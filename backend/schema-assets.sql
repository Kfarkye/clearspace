-- ----------------------------------------------------------------------
-- SPANNER DDL (Google Standard SQL Dialect)
-- Core Asset Engine Tables
-- ----------------------------------------------------------------------

CREATE TABLE assets (
  asset_id STRING(36) NOT NULL,
  type STRING(32) NOT NULL,
  status STRING(32) NOT NULL,
  title STRING(256) NOT NULL,
  summary STRING(MAX),
  owner_user_id STRING(128),
  source_session_id STRING(128),
  schema_version STRING(32) NOT NULL,
  payload_hash STRING(64),
  payload JSON,
  tags ARRAY<STRING(MAX)>,
  embedding ARRAY<FLOAT64>, -- For Gemini Vector/Semantic Search
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
  updated_at TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  expires_at TIMESTAMP,
) PRIMARY KEY(asset_id);

CREATE TABLE asset_sources (
  asset_id STRING(36) NOT NULL,
  source_id STRING(36) NOT NULL,
  source_type STRING(64) NOT NULL,
  title STRING(512),
  url STRING(MAX),
  publisher STRING(256),
  accessed_at TIMESTAMP,
  content_hash STRING(64),
) PRIMARY KEY(asset_id, source_id),
  INTERLEAVE IN PARENT assets ON DELETE CASCADE;

CREATE TABLE asset_renders (
  asset_id STRING(36) NOT NULL,
  render_id STRING(36) NOT NULL,
  render_type STRING(32) NOT NULL,
  status STRING(32) NOT NULL,
  url STRING(MAX),
  external_id STRING(256),
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
  error_message STRING(MAX),
) PRIMARY KEY(asset_id, render_id),
  INTERLEAVE IN PARENT assets ON DELETE CASCADE;

CREATE TABLE asset_actions (
  asset_id STRING(36) NOT NULL,
  action_id STRING(36) NOT NULL,
  action_type STRING(32) NOT NULL,
  status STRING(32) NOT NULL,
  approved_by_user_id STRING(128),
  input_hash STRING(64),
  external_id STRING(256),
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
  result JSON,
  error_message STRING(MAX),
) PRIMARY KEY(asset_id, action_id),
  INTERLEAVE IN PARENT assets ON DELETE CASCADE;
