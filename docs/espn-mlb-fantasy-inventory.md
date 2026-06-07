# ESPN MLB Fantasy Inventory

This document maps the enrichment layer provided by ESPN Fantasy atop the raw MLB stat vocabulary. The raw stat dictionary answers **"What happened on the field?"**, whereas this fantasy inventory answers **"How does ESPN Fantasy package player value, eligibility, availability, and scoring?"**

## Fantasy Inventory

| Fantasy Field | Raw ESPN Path / Endpoint | Sample Value | Maps To AthleteId? | Useful For | Store In DB? | Suggested Table |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FantasyPlayerId** | `.id` (from `/players` api) | `38904` | Yes (1:1) | Linking Fantasy to Core Stats | Yes | `MlbFantasyPlayerSnapshot` |
| **Eligible Positions** | `.player.eligibleSlots` | `[2, 3, 12]` | Yes | Roster validation, positional scarcity | Yes | `MlbFantasyPlayerSnapshot` |
| **Rostered %** | `.ownership.percentOwned` | `98.5` | Yes | Ownership trends, waiver wire priority | Yes | `MlbFantasyPlayerSnapshot` |
| **Started %** | `.ownership.percentStarted` | `85.2` | Yes | Start/Sit analysis, lineup optimization | Yes | `MlbFantasyPlayerSnapshot` |
| **Proj Fantasy Points** | `.projections[0].appliedStatTotal` | `450.5` | Yes | Season-long & weekly point projections | Yes | `MlbFantasyPlayerSnapshot` |
| **Actual Fantasy Points** | `.stats[0].appliedStatTotal` | `12.5` | Yes | Daily fantasy performance tracking | Yes | `MlbFantasyPlayerSnapshot` |
| **Availability / Injury** | `.player.injuryStatus` | `"DAY_TO_DAY"` | Yes | Tracking active vs injured players | Yes | `MlbFantasyPlayerSnapshot` |
| **Player News** | `https://fantasy.espn.com/apis/v3/games/flb/seasons/{year}/news` | `"Pete Alonso hit a home run..."` | Yes | Form updates, context generation | Yes | `MlbFantasyPlayerSnapshot` |
| **Matchup Context** | `.player.proTeamId` -> next game | `"vs. NYM"` | Yes | Daily lineup decisions, start/sit | Yes | `MlbFantasyPlayerSnapshot` |

---

## Suggested DB Implementation

Because the Fantasy context changes independently of the raw event ledger, we capture it as an enrichment layer snapshot.

### MlbFantasyPlayerSnapshot

This table should be periodically updated (e.g., daily) to capture the current fantasy value and ownership trends of players. It is keyed primarily by `AthleteId`.

```sql
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
```

### Key Takeaways
- **No Overlap:** We do not duplicate `homeRuns` or `strikeouts` here. This layer assumes the base `MlbBoxscoreBatting` and `MlbBoxscorePitching` tables exist.
- **Enrichment Only:** This data allows TRUTH to answer queries like: "Which starting pitcher under 50% rostered has the best projected points against a righty-heavy lineup tomorrow?"
- **Normalization Strategy:** Since fantasy points rely on League Scoring Rules (Points vs. Roto/Categories), we store ESPN's default scoring calculation as baseline enrichment.
