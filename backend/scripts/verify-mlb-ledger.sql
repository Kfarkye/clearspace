SELECT 'MlbGames' AS TableName, COUNT(*) AS RowCount FROM MlbGames;
SELECT 'MlbSourceReceipts' AS TableName, COUNT(*) AS RowCount FROM MlbSourceReceipts;
SELECT 'MlbPlayByPlay' AS TableName, COUNT(*) AS RowCount FROM MlbPlayByPlay;
SELECT 'MlbWinProbability' AS TableName, COUNT(*) AS RowCount FROM MlbWinProbability;
SELECT 'MlbBoxscorePitching' AS TableName, COUNT(*) AS RowCount FROM MlbBoxscorePitching;
SELECT 'MlbBoxscoreBatting' AS TableName, COUNT(*) AS RowCount FROM MlbBoxscoreBatting;
SELECT 'MlbOddsHistory' AS TableName, COUNT(*) AS RowCount FROM MlbOddsHistory;
SELECT 'MlbInjuries' AS TableName, COUNT(*) AS RowCount FROM MlbInjuries;
SELECT 'MlbAthleteSeasonStats' AS TableName, COUNT(*) AS RowCount FROM MlbAthleteSeasonStats;

SELECT EventId, HomeTeamName, AwayTeamName, SituationBalls, SituationStrikes, SituationOuts, LastPlayId FROM MlbGames LIMIT 1;
SELECT Provider, Side, CurrentMoneyline, OpenMoneyline FROM MlbOddsHistory LIMIT 4;
SELECT Name, InningsPitched, PitchCount FROM MlbBoxscorePitching LIMIT 4;
