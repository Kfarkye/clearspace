// --- MLB Specific Betting Parameters (Tier 1) ---

// Number of recent starts to heavily evaluate starting pitchers' performance.
export const MLB_PITCHER_FORM_WEIGHT_STARTS = 5;

// Number of recent team games to assess bullpen performance and usage.
export const MLB_BULLPEN_FORM_WEIGHT_GAMES = 10;

// Minimum games played for a team/player in home/away scenarios before splits are considered reliable.
export const MLB_HOME_AWAY_SPLIT_MIN_SAMPLE_SIZE = 20;

// Minimum absolute deviation from 1.00 for a stadium's park factor to be considered significant.
export const MLB_PARK_FACTOR_IMPACT_THRESHOLD = 0.08; // e.g., 1.08 or 0.92 for offense

// Threshold in standard deviations for umpire strike-zone tendencies to be considered significantly biased.
export const MLB_UMPIRE_STRIKE_ZONE_BIAS_THRESHOLD_STD_DEV = 0.75;

// Total line threshold for a game to be classified as a "high total" game.
export const MLB_HIGH_TOTAL_GAME_THRESHOLD = 10.5;

// Minimum moneyline odds for underdog plays in high-total games.
export const MLB_UNDERDOG_HIGH_TOTAL_MIN_ODDS = 116;

// Maximum moneyline odds for underdog plays in high-total games (caps risk on heavy dogs).
export const MLB_UNDERDOG_HIGH_TOTAL_MAX_ODDS = 180;

// Fastball velocity threshold (mph) to flag a pitcher as "high-velocity" for strikeout projections.
export const MLB_HIGH_VELOCITY_PITCHER_MPH_THRESHOLD = 97;

// Minimum rest days for a high-velocity pitcher to receive a strikeout boost projection.
export const MLB_HIGH_VELOCITY_PITCHER_REST_DAYS_FOR_K_BOOST = 5;

// Master toggle for the Automated Betting System. When false, strategies output analysis only.
export const MLB_ABS_SYSTEM_ACTIVE = false;
