-- AURA Spanner schema.
-- Note: TrustGateLocks.CurrentStatus starts at 'PENDING' (see TrustGateService).

CREATE TABLE TrustGateLocks (
  LockId STRING(64) NOT NULL, CurrentStatus STRING(32) NOT NULL, FrozenPayloadHash STRING(64) NOT NULL,
  FrozenPayload JSON, RequestedActions JSON, ContractSnapshot JSON, UserId STRING(128),
  RouteId STRING(128), ActionType STRING(64), ExpiresAt TIMESTAMP, ApprovedBy STRING(128),
  ApprovedAt TIMESTAMP, ResultRef STRING(128), GitCommitHash STRING(64) NOT NULL,
  LastUpdated TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (LockId);

CREATE TABLE TrustGateAuditTrail (
  AuditId STRING(64) NOT NULL, LockId STRING(64) NOT NULL, PreviousStatus STRING(32) NOT NULL,
  NewStatus STRING(32) NOT NULL, TriggeredBy STRING(128) NOT NULL, GitCommitHash STRING(64) NOT NULL,
  Timestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true), Signature STRING(MAX) NOT NULL
) PRIMARY KEY (LockId, AuditId), INTERLEAVE IN PARENT TrustGateLocks ON DELETE CASCADE;

CREATE TABLE RouteContractSnapshots (
  SnapshotId STRING(64) NOT NULL, RouteId STRING(128) NOT NULL, ContractData JSON NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (SnapshotId);

CREATE TABLE GovernedJobs (
  JobId STRING(128) NOT NULL, LockId STRING(64) NOT NULL, PayloadHash STRING(64) NOT NULL,
  TaskName STRING(256), Status STRING(32) NOT NULL, CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  CompletedAt TIMESTAMP, ResultRef STRING(256)
) PRIMARY KEY (JobId);

CREATE TABLE ArtifactRegistry (
  ArtifactId STRING(64) NOT NULL, JobId STRING(128) NOT NULL, StorageRef STRING(256) NOT NULL,
  ArtifactDigest STRING(64) NOT NULL, CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (ArtifactId);

CREATE TABLE SystemTraces (
  TraceId STRING(64) NOT NULL, TraceType STRING(64) NOT NULL, Metadata JSON,
  Timestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (TraceId);

CREATE TABLE UserConsentLedger (
  UserId STRING(128) NOT NULL, ConsentId STRING(64) NOT NULL, ConsentType STRING(128) NOT NULL,
  Platform STRING(32) NOT NULL, Status STRING(32) NOT NULL, PolicyVersion STRING(64),
  GrantedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true), RevokedAt TIMESTAMP
) PRIMARY KEY (UserId, ConsentId);

CREATE TABLE AccountDeletionJobs (
  JobId STRING(128) NOT NULL, UserId STRING(128) NOT NULL, Status STRING(32) NOT NULL,
  TraceId STRING(64), RequestedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  DeadlineAt TIMESTAMP NOT NULL, CompletedAt TIMESTAMP
) PRIMARY KEY (JobId);

CREATE TABLE SourceSnapshots (
  SourceId STRING(64) NOT NULL, Url STRING(MAX), CanonicalUrl STRING(MAX), Title STRING(MAX),
  SourceType STRING(32), FetchedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  ContentHash STRING(64) NOT NULL, RawTextRef STRING(MAX), TrustStatus STRING(32), Metadata JSON
) PRIMARY KEY (SourceId);

CREATE TABLE GroundingTraces (
  GroundingId STRING(64) NOT NULL, RouteId STRING(64) NOT NULL, SourceIds ARRAY<STRING(64)>,
  Query STRING(MAX), ResultCount INT64, CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (GroundingId);

CREATE TABLE ResearchJobs (
  JobId STRING(64) NOT NULL, UserId STRING(64) NOT NULL, Query STRING(MAX) NOT NULL,
  Status STRING(32) NOT NULL, CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  UpdatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true), ErrorMessage STRING(MAX)
) PRIMARY KEY (JobId);

CREATE TABLE ResearchSourceMap (
  JobId STRING(64) NOT NULL, SourceId STRING(64) NOT NULL, RelevanceScore FLOAT64
) PRIMARY KEY (JobId, SourceId), INTERLEAVE IN PARENT ResearchJobs ON DELETE CASCADE;

CREATE TABLE ResearchFindings (
  JobId STRING(64) NOT NULL, FindingId STRING(64) NOT NULL, Claim STRING(MAX) NOT NULL,
  SourceIds ARRAY<STRING(64)>, ConfidenceScore FLOAT64
) PRIMARY KEY (JobId, FindingId), INTERLEAVE IN PARENT ResearchJobs ON DELETE CASCADE;

CREATE TABLE ResearchReports (
  JobId STRING(64) NOT NULL, ReportId STRING(64) NOT NULL, ExecutiveSynthesis JSON,
  VerificationGraph JSON, CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (JobId, ReportId), INTERLEAVE IN PARENT ResearchJobs ON DELETE CASCADE;

CREATE TABLE MediaAssets (
  VideoId STRING(64) NOT NULL, Title STRING(MAX) NOT NULL, ChannelId STRING(64) NOT NULL,
  ChannelTitle STRING(MAX) NOT NULL, PublishedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  ThumbnailUrl STRING(MAX), Duration STRING(32), ViewCount INT64, IsOfficialChannel BOOL NOT NULL
) PRIMARY KEY (VideoId);

CREATE TABLE MediaTraces (
  TraceId STRING(64) NOT NULL, RouteId STRING(64) NOT NULL, VideoId STRING(64) NOT NULL,
  RequestedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (TraceId);
