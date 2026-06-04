// --- World Cup (Soccer) Specific Betting Parameters (Tier 1) ---

// Number of recent international matches to consider for team form assessment.
export const WC_TEAM_FORM_WEIGHTING_MATCHES = 6;

// Minimum Expected Goals (xG) differential per game for a significant offensive/defensive edge.
export const WC_EXPECTED_GOALS_DIFFERENCE_THRESHOLD = 0.7; // e.g., averaging 0.7 xG more than opponents

// Host nations for the 2026 World Cup — used for host-nation boost strategies.
export const WC_HOST_NATIONS = ["USA", "MEX", "CAN"];

// Number of early group stage games (before "must-win" motivation kicks in).
export const WC_GROUP_STAGE_EARLY_GAMES_COUNT = 2;

// Maximum pre-tournament odds (American format) for outright winner futures to be considered actionable.
export const WC_OUTRIGHT_WINNER_MAX_PRE_TOURNAMENT_ODDS = 1200;
