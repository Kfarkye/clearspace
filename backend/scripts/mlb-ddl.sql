CREATE TABLE MlbGames (
  EventId STRING(64) NOT NULL,
  CompetitionId STRING(64),
  Venue STRING(256),
  Status STRING(64),
  HomeTeamId STRING(64),
  HomeTeamName STRING(128),
  HomeTeamAbbr STRING(16),
  AwayTeamId STRING(64),
  AwayTeamName STRING(128),
  AwayTeamAbbr STRING(16),
  HomeScore INT64,
  AwayScore INT64,
  CurrentInning STRING(64),
  SituationBalls INT64,
  SituationStrikes INT64,
  SituationOuts INT64,
  SituationRunnersOnBase JSON,
  CurrentPitcherId STRING(64),
  CurrentBatterId STRING(64),
  LastPlayId STRING(64),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId);

CREATE TABLE MlbSourceReceipts (
  EventId STRING(64) NOT NULL,
  ReceiptId STRING(64) NOT NULL,
  Url STRING(MAX),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, ReceiptId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbPlayByPlay (
  EventId STRING(64) NOT NULL,
  PlayId STRING(64) NOT NULL,
  Period STRING(64),
  PlayText STRING(MAX),
  HomeScore INT64,
  AwayScore INT64,
  Wallclock TIMESTAMP,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, PlayId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbWinProbability (
  EventId STRING(64) NOT NULL,
  PlayId STRING(64) NOT NULL,
  HomeWinPercentage FLOAT64,
  AwayWinPercentage FLOAT64,
  TiePercentage FLOAT64,
  ProbabilitySwing FLOAT64,
  PlayDescription STRING(MAX),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY(EventId, PlayId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbBoxscorePitching (
  EventId STRING(64) NOT NULL,
  AthleteId STRING(64) NOT NULL,
  TeamId STRING(64),
  Name STRING(256),
  Starter BOOL,
  InningsPitched STRING(32),
  Hits INT64,
  Runs INT64,
  EarnedRuns INT64,
  Walks INT64,
  Strikeouts INT64,
  PitchCount STRING(64),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, AthleteId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbBoxscoreBatting (
  EventId STRING(64) NOT NULL,
  AthleteId STRING(64) NOT NULL,
  TeamId STRING(64),
  Name STRING(256),
  Starter BOOL,
  AtBats INT64,
  Runs INT64,
  Hits INT64,
  RBIs INT64,
  HomeRuns INT64,
  Walks INT64,
  Strikeouts INT64,
  StolenBases INT64,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, AthleteId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbOddsHistory (
  EventId STRING(64) NOT NULL,
  Provider STRING(64) NOT NULL,
  Timestamp TIMESTAMP NOT NULL,
  TeamId STRING(64),
  Side STRING(32),
  OpenMoneyline STRING(64),
  CurrentMoneyline STRING(64),
  CloseMoneyline STRING(64),
  OpenSpread STRING(64),
  CurrentSpread STRING(64),
  CloseSpread STRING(64),
  OpenTotal STRING(64),
  CurrentTotal STRING(64),
  CloseTotal STRING(64),
  OpenJson JSON,
  CurrentJson JSON,
  CloseJson JSON,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, Provider, Timestamp),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbGameConditions (
  EventId STRING(64) NOT NULL,
  Venue STRING(256),
  City STRING(128),
  State STRING(64),
  Temperature INT64,
  Condition STRING(128),
  WindSpeed INT64,
  WindDirection STRING(64),
  Humidity INT64,
  Precipitation INT64,
  RoofType STRING(64),
  Surface STRING(64),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY(EventId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbFantasyPlayerSnapshot (
  AthleteId STRING(64) NOT NULL,
  SnapshotDate DATE NOT NULL,
  FantasyPlayerId STRING(64),
  TeamId STRING(64),
  PositionsJson JSON,
  EligiblePositionsJson JSON,
  ProjectedFantasyPoints FLOAT64,
  ActualFantasyPoints FLOAT64,
  RosteredPct FLOAT64,
  StartedPct FLOAT64,
  AvailabilityStatus STRING(64),
  InjuryStatus STRING(64),
  NewsJson JSON,
  MatchupJson JSON,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY(AthleteId, SnapshotDate);

CREATE TABLE MlbGameStandings (
  EventId STRING(64) NOT NULL,
  TeamId STRING(64) NOT NULL,
  TeamName STRING(128),
  TeamAbbr STRING(64),
  LeagueRank INT64,
  DivisionRank INT64,
  Wins INT64,
  Losses INT64,
  WinPct FLOAT64,
  GamesBack FLOAT64,
  Streak STRING(64),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY(EventId, TeamId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbSeasonSeries (
  EventId STRING(64) NOT NULL,
  SeriesId STRING(64) NOT NULL,
  HomeTeamId STRING(64),
  AwayTeamId STRING(64),
  Summary STRING(256),
  HomeWins INT64,
  AwayWins INT64,
  GamesPlayed INT64,
  GamesRemaining INT64,
  PreviousGamesJson JSON,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY(EventId, SeriesId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbInjuries (
  EventId STRING(64) NOT NULL,
  AthleteId STRING(64) NOT NULL,
  TeamId STRING(64),
  Name STRING(256),
  Status STRING(64),
  Notes STRING(MAX),
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, AthleteId),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;

CREATE TABLE MlbAthleteSeasonStats (
  EventId STRING(64) NOT NULL,
  AthleteId STRING(64) NOT NULL,
  Type STRING(32) NOT NULL,
  RawJson JSON,
  FetchedAt TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY(EventId, AthleteId, Type),
  INTERLEAVE IN PARENT MlbGames ON DELETE CASCADE;
