// --- General Betting Insight System Parameters ---

// Primary sportsbook to use for fetching and comparing odds.
export const DEFAULT_ODDS_PROVIDER = "DraftKings";

// Minimum percentage an internally calculated probability must exceed the implied market probability
// to be flagged as a value bet.
export const VALUE_BETTING_THRESHOLD_PERCENTAGE = 2.5;

// Number of recent games to consider most heavily when assessing team/player form.
export const RECENT_FORM_WEIGHTING_GAMES = 7;

// Minimum deviation between public betting percentage and actual line movement
// to flag a potential Reverse Line Movement (RLM) signal.
export const RLM_MIN_PUBLIC_BETTING_DEVIATION_PERCENTAGE = 15;

// Maximum implied probability (from juice/vig) before a line is filtered out as too expensive.
export const DEFAULT_MAX_JUICE_IMPLIED_PROBABILITY = 0.60;

// When true, strategies prioritize plus-money underdogs in angle output.
export const DEFAULT_PRIORITIZE_PLUS_MONEY_UNDERDOGS = true;
