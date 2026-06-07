#!/bin/bash

# AURA - Full Season MLB Backfill Script
# Segment 1: Start of season to June 5th (before the completed June 6-7 segment)
echo "Starting Segment 1: 20260320 to 20260605"
node backfill-mlb-season-ledger.js --start 20260320 --end 20260605

# Segment 2: June 8th to September 25th (before the completed Sept 26-27 segment)
echo "Starting Segment 2: 20260608 to 20260925"
node backfill-mlb-season-ledger.js --start 20260608 --end 20260925

echo "Full Season Backfill Complete."
