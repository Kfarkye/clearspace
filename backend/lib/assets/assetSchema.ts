/**
 * @file assetSchema.ts
 * @description Core discriminated unions, interfaces, and Spanner DDL for the Asset Ledger.
 */

// ----------------------------------------------------------------------
// TYPESCRIPT SCHEMA
// ----------------------------------------------------------------------

export type AssetType =
  | 'DATA_TABLE'
  | 'CHART'
  | 'BETTING_ANALYSIS'
  | 'SCOREBOARD'
  | 'LICENSING_GUIDE'
  | 'RESEARCH_MEMO'
  | 'WORKSPACE_DOC'
  | 'DEPLOYED_PAGE'
  | 'EMAIL_DRAFT'
  | 'ORDER_TICKET';

export type AssetStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'NEEDS_REVIEW'
  | 'STALE'
  | 'ARCHIVED'
  | 'FAILED';

export type SourceType = 
  | 'OFFICIAL' 
  | 'DATABASE' 
  | 'API' 
  | 'USER_UPLOAD' 
  | 'WEB' 
  | 'MODEL'
  | 'GOOGLE_SEARCH_GROUNDING'
  | 'PYTHON_TOOL';

export type RenderType = 'HTML' | 'GOOGLE_DOC' | 'EMAIL' | 'PDF' | 'CHAT_ARTIFACT';

export interface AssetSource {
  sourceId: string;
  sourceType: SourceType;
  title?: string;
  url?: string;
  publisher?: string;
  accessedAt: string;
  contentHash?: string; // SHA-256 of the source content for auditability
}

export interface AssetRender {
  renderId: string;
  renderType: RenderType;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  url?: string;
  externalId?: string; // e.g., Google Doc ID
  errorMessage?: string;
  createdAt: string;
}

export interface AssetAction {
  actionId: string;
  actionType: 'APPROVE' | 'REJECT' | 'PUBLISH' | 'ARCHIVE' | 'UPDATE';
  status: 'SUCCESS' | 'FAILED';
  approvedByUserId?: string;
  inputHash?: string;
  externalId?: string;
  result?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
}

// Discriminator payload types
export interface LicensingGuidePayload {
  state: string;
  licenseType: string;
  requirements: string[];
  fees: { amount: number; description: string }[];
  processingTimeDays: number;
}

export interface DataTablePayload {
  headers?: string[];
  columns?: string[];
  rows: any[];
  query?: string;
  title?: string;
  source?: string;
}

export interface BettingAnalysisPayload {
  sport?: string;
  eventIds?: string[];
  recommendedAngles?: { strategy: string; edge: number; pick: string }[];
  [key: string]: any;
}

export type AssetPayload = 
  | LicensingGuidePayload 
  | DataTablePayload 
  | BettingAnalysisPayload 
  | Record<string, unknown>; // Fallback for other types

export interface SpannerAsset<T extends AssetPayload = AssetPayload> {
  assetId: string;
  type: AssetType;
  status: AssetStatus;
  title: string;
  summary?: string;
  ownerUserId?: string;
  sourceSessionId?: string;
  schemaVersion: string;
  payloadHash: string;
  payload: T;
  tags: string[];
  embedding?: number[]; // Enables native Gemini Vector Search in Spanner
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  
  // Interleaved child tables
  sources?: AssetSource[];
  renders?: AssetRender[];
  actions?: AssetAction[];
}

// ----------------------------------------------------------------------
// SPANNER DDL (Google Standard SQL Dialect)
// ----------------------------------------------------------------------
export const ASSET_LEDGER_DDL = `
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
`;
