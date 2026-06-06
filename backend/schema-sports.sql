-- ============================================================================
-- Clearspace Sports Persistent Layer — Multi-League Cloud Spanner DDL
-- Project: gen-lang-client-0281999829
-- Instance: aura-governance-instance
-- Database: world-cup-db
-- ============================================================================

-- Leagues registry
CREATE TABLE leagues (
  league_id      STRING(32) NOT NULL,
  sport_type     STRING(32) NOT NULL,
  display_name   STRING(128) NOT NULL,
  current_season STRING(16) NOT NULL,
  created_at     TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(league_id);

-- Venues (Shared globally across leagues)
CREATE TABLE venues (
  venue_id    STRING(36) NOT NULL,
  name        STRING(256) NOT NULL,
  city        STRING(256) NOT NULL,
  state       STRING(128),
  country     STRING(256) NOT NULL,
  capacity    INT64,
  latitude    NUMERIC,
  longitude   NUMERIC,
  timezone    STRING(128),
  created_at  TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  provenance  JSON,
) PRIMARY KEY(venue_id);

-- Teams: Interleaved under Leagues
CREATE TABLE teams (
  league_id          STRING(32) NOT NULL,
  team_code          STRING(10) NOT NULL,
  name               STRING(256) NOT NULL,
  group_letter       STRING(1) NOT NULL,
  fifa_ranking       INT64,
  confederation      STRING(128),
  flag_emoji         STRING(10),
  created_at         TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  manager            STRING(256),
  formation          STRING(32),
  playing_style      STRING(512),
  key_players        JSON,
  world_cup_history  STRING(512),
  nickname           STRING(256),
  logo_url           STRING(512),
  group_winner_odds  INT64,
  implied_probability NUMERIC,
  tournament_odds    STRING(32),
  updated_at         TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  provenance         JSON,
  is_placeholder     BOOL,
) PRIMARY KEY(league_id, team_code),
  INTERLEAVE IN PARENT leagues ON DELETE CASCADE;

-- Matches: Interleaved under Leagues
CREATE TABLE matches (
  league_id      STRING(32) NOT NULL,
  match_id       STRING(36) NOT NULL,
  group_letter   STRING(1) NOT NULL,
  match_number   INT64,
  home_team_code STRING(10) NOT NULL,
  away_team_code STRING(10) NOT NULL,
  venue_id       STRING(36),
  kickoff        TIMESTAMP NOT NULL,
  stage          STRING(64),
  status         STRING(64),
  home_score     INT64,
  away_score     INT64,
  created_at     TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  updated_at     TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  provenance     JSON,
) PRIMARY KEY(league_id, match_id),
  INTERLEAVE IN PARENT leagues ON DELETE CASCADE;

ALTER TABLE matches ADD CONSTRAINT fk_matches_venue FOREIGN KEY(venue_id) REFERENCES venues(venue_id);
ALTER TABLE matches ADD CONSTRAINT fk_matches_home_team FOREIGN KEY(league_id, home_team_code) REFERENCES teams(league_id, team_code);
ALTER TABLE matches ADD CONSTRAINT fk_matches_away_team FOREIGN KEY(league_id, away_team_code) REFERENCES teams(league_id, team_code);

-- Players: Interleaved under Teams
CREATE TABLE players (
  league_id     STRING(32) NOT NULL,
  team_code     STRING(10) NOT NULL,
  player_id     STRING(36) NOT NULL,
  name          STRING(256) NOT NULL,
  jersey_number INT64,
  position      STRING(64),
  age           INT64,
  club          STRING(256),
  is_captain    BOOL,
  provenance    JSON,
  created_at    TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(league_id, team_code, player_id),
  INTERLEAVE IN PARENT teams ON DELETE CASCADE;

-- Odds: Interleaved under Matches
CREATE TABLE odds (
  league_id           STRING(32) NOT NULL,
  match_id            STRING(36) NOT NULL,
  odds_id             STRING(36) NOT NULL,
  market_type         STRING(128) NOT NULL,
  team_code           STRING(10),
  source              STRING(128) NOT NULL,
  american_odds       INT64,
  implied_probability NUMERIC,
  fetched_at          TIMESTAMP,
  line                NUMERIC,
  source_url          STRING(MAX),
  created_at          TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  provenance          JSON,
) PRIMARY KEY(league_id, match_id, odds_id),
  INTERLEAVE IN PARENT matches ON DELETE CASCADE;

-- Edges: Interleaved under Matches
CREATE TABLE edges (
  league_id          STRING(32) NOT NULL,
  match_id           STRING(36) NOT NULL,
  edge_id            STRING(36) NOT NULL,
  team_code          STRING(10),
  market_type        STRING(128) NOT NULL,
  sportsbook_implied NUMERIC,
  prediction_implied NUMERIC,
  edge_pct           NUMERIC,
  sportsbook_source  STRING(128),
  prediction_source  STRING(128),
  direction          STRING(64),
  calculated_at      TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(league_id, match_id, edge_id),
  INTERLEAVE IN PARENT matches ON DELETE CASCADE;

-- Prediction Prices: Interleaved under Matches
CREATE TABLE prediction_prices (
  league_id           STRING(32) NOT NULL,
  match_id            STRING(36) NOT NULL,
  price_id            STRING(36) NOT NULL,
  market_type         STRING(128) NOT NULL,
  team_code           STRING(10),
  source              STRING(128) NOT NULL,
  price_cents         INT64,
  implied_probability NUMERIC,
  volume_usd          NUMERIC,
  fetched_at          TIMESTAMP,
  created_at          TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(league_id, match_id, price_id),
  INTERLEAVE IN PARENT matches ON DELETE CASCADE;

-- Scrape Runs: flat metadata
CREATE TABLE scrape_runs (
  run_id       STRING(36) NOT NULL,
  started_at   TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
  completed_at TIMESTAMP OPTIONS (allow_commit_timestamp = true),
  status       STRING(64) NOT NULL,
  summary      JSON,
) PRIMARY KEY(run_id);

-- Fan Guides: flat info
CREATE TABLE fan_guides (
  city                STRING(256) NOT NULL,
  guide_id            STRING(36) NOT NULL,
  fan_zone_details    STRING(MAX),
  tourist_attractions STRING(MAX),
  local_tips          STRING(MAX),
  provenance          JSON,
  created_at          TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(city, guide_id);

-- Travel Context: flat info
CREATE TABLE travel_context (
  city               STRING(256) NOT NULL,
  context_id         STRING(36) NOT NULL,
  airport_code       STRING(10),
  transit_info       STRING(MAX),
  hotel_availability STRING(MAX),
  weather_forecast   STRING(MAX),
  provenance         JSON,
  created_at         TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(city, context_id);

-- Team Power Ratings: Interleaved under Teams
CREATE TABLE team_power_ratings (
  league_id   STRING(32) NOT NULL,
  team_code   STRING(10) NOT NULL,
  rating_id   STRING(36) NOT NULL,
  rating      NUMERIC NOT NULL,
  source      STRING(128),
  updated_at  TIMESTAMP,
  created_at  TIMESTAMP OPTIONS (allow_commit_timestamp = true),
) PRIMARY KEY(league_id, team_code, rating_id),
  INTERLEAVE IN PARENT teams ON DELETE CASCADE;

-- Team Trends: Interleaved under Teams
CREATE TABLE team_trends (
  league_id   STRING(32) NOT NULL,
  team_code   STRING(10) NOT NULL,
  trend_id    STRING(36) NOT NULL,
  trend_type  STRING(128) NOT NULL,
  wins        INT64,
  losses      INT64,
  pushes      INT64,
  percentage  NUMERIC,
  source      STRING(128),
  updated_at  TIMESTAMP,
) PRIMARY KEY(league_id, team_code, trend_id),
  INTERLEAVE IN PARENT teams ON DELETE CASCADE;

-- Injury News: Interleaved under Teams
CREATE TABLE injury_news (
  league_id   STRING(32) NOT NULL,
  team_code   STRING(10) NOT NULL,
  injury_id   STRING(36) NOT NULL,
  player_name STRING(256) NOT NULL,
  position    STRING(64),
  status      STRING(64) NOT NULL,
  description STRING(MAX),
  updated_at  TIMESTAMP,
) PRIMARY KEY(league_id, team_code, injury_id),
  INTERLEAVE IN PARENT teams ON DELETE CASCADE;

-- Lineup Projections: Interleaved under Matches
CREATE TABLE lineup_projections (
  league_id            STRING(32) NOT NULL,
  match_id             STRING(36) NOT NULL,
  lineup_id            STRING(36) NOT NULL,
  team_code            STRING(10) NOT NULL,
  player_name          STRING(256) NOT NULL,
  position             STRING(64),
  is_projected_starter BOOL,
  updated_at           TIMESTAMP,
) PRIMARY KEY(league_id, match_id, lineup_id),
  INTERLEAVE IN PARENT matches ON DELETE CASCADE;

-- Live Snapshots: Interleaved under Matches for chronological locality
CREATE TABLE live_snapshots (
  league_id          STRING(32) NOT NULL,
  match_id           STRING(36) NOT NULL,
  captured_at        TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp = true),
  
  -- Game State (Normalized for ML)
  state_timestamp    TIMESTAMP,
  inning_number      INT64 NOT NULL,
  inning_half        STRING(6) NOT NULL,  -- 'top' or 'bottom'
  outs               INT64 NOT NULL,
  balls              INT64 NOT NULL,
  strikes            INT64 NOT NULL,
  home_score         INT64 NOT NULL,
  away_score         INT64 NOT NULL,
  
  -- Bases (Explicit booleans for indexing/feature extraction)
  on_first           BOOL NOT NULL,
  on_second          BOOL NOT NULL,
  on_third           BOOL NOT NULL,
  
  -- Matchup Context
  pitcher_id         STRING(36),
  pitcher_name       STRING(128),
  pitcher_throws     STRING(1),           -- 'R' or 'L'
  batter_id          STRING(36),
  batter_name        STRING(128),
  batter_stance      STRING(1),           -- 'R', 'L', 'S'
  
  -- Market Data
  market_timestamp   TIMESTAMP,
  is_suspended       BOOL NOT NULL,       -- TRUE if book lines are locked
  home_ml_dk         INT64,               -- American Odds (e.g. -150, +130)
  away_ml_dk         INT64,
  dk_implied_no_vig  NUMERIC,             -- De-vigged sportsbook probability
  home_prob_poly     NUMERIC,             -- Polymarket implied %
  away_prob_poly     NUMERIC,
  edge_pct_home      NUMERIC,             -- (Prediction_Market_Prob - dk_implied_no_vig)
  edge_pct_away      NUMERIC
) PRIMARY KEY(league_id, match_id, captured_at),
  INTERLEAVE IN PARENT matches ON DELETE CASCADE;
