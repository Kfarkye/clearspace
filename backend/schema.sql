-- ============================================================================
-- Clearspace Persistent Data Layer — Cloud Spanner DDL
-- Project: gen-lang-client-0281999829
-- Instance: clearspace (regional-us-central1)
-- Database: clearspace-db
--
-- Tables use Spanner interleaving for data co-locality:
--   Users → UserPreferences (1:1)
--   Users → Conversations → Messages (1:N:N)
--   Users → Artifacts (1:N)
--
-- Design decisions:
--   - Auth-only persistence (Google OAuth sub as user_id)
--   - 30-day default retention for conversations, forever for artifacts
--   - Interleaved tables ensure per-user data is physically co-located
--   - Composite PKs enable efficient range scans per-user/per-conversation
--   - Soft delete on conversations for potential undo
--
-- Apply with:
--   gcloud spanner databases ddl update clearspace-db \
--     --instance=clearspace --ddl-file=schema.sql
-- ============================================================================

-- Users: identity from Google OAuth
CREATE TABLE Users (
  user_id        STRING(128) NOT NULL,
  email          STRING(256),
  display_name   STRING(256),
  avatar_url     STRING(2048),
  created_at     TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  updated_at     TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  last_active_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id);

-- User preferences: persisted UI state
CREATE TABLE UserPreferences (
  user_id        STRING(128) NOT NULL,
  chat_mode      STRING(16) NOT NULL DEFAULT ('standard'),
  thinking_mode  STRING(16) NOT NULL DEFAULT ('fast'),
  theme          STRING(16) NOT NULL DEFAULT ('light'),
  updated_at     TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

-- Conversations: each chat session
-- TTL: Spanner automatically deletes rows where updated_at > 30 days ago.
-- Cascading interleave ensures Messages are purged with their parent.
CREATE TABLE Conversations (
  user_id          STRING(128) NOT NULL,
  conversation_id  STRING(36) NOT NULL,
  title            STRING(512) DEFAULT ('New Conversation'),
  chat_mode        STRING(16) NOT NULL,
  message_count    INT64 NOT NULL DEFAULT (0),
  is_deleted       BOOL NOT NULL DEFAULT (false),
  is_pinned        BOOL NOT NULL DEFAULT (false),
  created_at       TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  updated_at       TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, conversation_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE,
  ROW DELETION POLICY (OLDER_THAN(updated_at, INTERVAL 30 DAY));

-- Index: list conversations by most recent first
CREATE INDEX ConversationsByRecency
  ON Conversations (user_id, updated_at DESC)
  STORING (title, chat_mode, is_deleted, is_pinned, message_count);

-- Messages: individual chat turns
CREATE TABLE Messages (
  user_id          STRING(128) NOT NULL,
  conversation_id  STRING(36) NOT NULL,
  message_id       STRING(36) NOT NULL,
  role             STRING(8) NOT NULL,
  content          STRING(MAX),
  has_image        BOOL NOT NULL DEFAULT (false),
  created_at       TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, conversation_id, message_id),
  INTERLEAVE IN PARENT Conversations ON DELETE CASCADE;

-- Artifacts: deployed documents, analyses, scoreboards
CREATE TABLE Artifacts (
  user_id          STRING(128) NOT NULL,
  artifact_id      STRING(36) NOT NULL,
  conversation_id  STRING(36),
  artifact_type    STRING(32) NOT NULL,
  title            STRING(512),
  url              STRING(2048),
  metadata         JSON,
  created_at       TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, artifact_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;

-- Index: artifacts by recency for a given user
CREATE INDEX ArtifactsByRecency
  ON Artifacts (user_id, created_at DESC)
  STORING (artifact_type, title, url);
