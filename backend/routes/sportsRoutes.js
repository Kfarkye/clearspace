import express from 'express';
import * as sportsController from '../controllers/sportsController.js';

const router = express.Router();

// --- ESPN Proxy Routes ---
router.get('/api-proxy/espn/:sport', sportsController.espnScoreboard);
router.get('/api-proxy/espn/:sport/event/:eventId', sportsController.espnEventDetail);
router.get('/api-proxy/espn/:sport/event/:eventId/plays', sportsController.espnEventPlays);
router.get('/api-proxy/espn/:sport/news', sportsController.espnNews);

// --- Odds Proxy Routes ---
router.get('/api-proxy/odds/:sport', sportsController.oddsApiOdds);

// --- Unified Intelligence Routes ---
router.post('/api/intelligence/sports/query', sportsController.intelligenceSportsQuery);
router.post('/api/intelligence/sports/win-probability', sportsController.intelligenceWinProbability);
router.post('/api/intelligence/sports/player-props', sportsController.intelligencePlayerProps);
router.post('/api/intelligence/sports/data-table', sportsController.intelligenceDataTable);

// --- Unified Sports & Leagues Data API ---
router.get('/api/sports/leagues', sportsController.getLeagues);
router.get('/api/sports/:league/schedule', sportsController.getSchedule);
router.get('/api/sports/:league/teams', sportsController.getTeams);
router.get('/api/sports/:league/teams/:code', sportsController.getTeam);
router.get('/api/sports/venues', sportsController.getVenues); // Note: global path
router.get('/api/sports/:league/matches', sportsController.getMatches);
router.get('/api/sports/:league/matches/:id', sportsController.getMatchDetail);
router.get('/api/sports/:league/edges', sportsController.getEdges);
router.get('/api/sports/:league/odds', sportsController.getOdds);
router.get('/api/sports/:league/groups/:letter', sportsController.getGroupSnapshot);
router.get('/api/sports/:league/teams/:code/power-ratings', sportsController.getTeamPowerRatings);
router.get('/api/sports/:league/teams/:code/trends', sportsController.getTeamTrends);
router.get('/api/sports/:league/teams/:code/historical', sportsController.getHistoricalMatches);
router.get('/api/sports/:league/teams/:code/injuries', sportsController.getInjuryNews);
router.get('/api/sports/:league/matches/:id/lineups', sportsController.getLineupProjections);

export default router;
