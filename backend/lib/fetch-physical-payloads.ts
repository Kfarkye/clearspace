// ============================================================================
// PHYSICAL PAYLOAD INGESTION (DECOUPLED)
// File: src/pipelines/fetch-physical-payloads.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ManifestEntry {
  ref_url: string;
  payload_type: string;
  http_status: number | null;
  file_path: string | null;
  fetched_at: string;
  sha256_hash: string | null;
  byte_length: number;
  json_valid: boolean;
  error?: string;
}

export class WorldCupPayloadFetcher {
  private readonly BASE_DIR = path.join(__dirname, '../../data/raw/espn_core');
  private readonly MANIFEST_PATH = path.join(this.BASE_DIR, 'fetch_manifest.json');
  private readonly REQUIRED_PATH = '/sports/soccer/leagues/fifa.world/';

  constructor() {
    if (!fs.existsSync(this.BASE_DIR)) {
      fs.mkdirSync(this.BASE_DIR, { recursive: true });
    }
  }

  /**
   * Extracts the payload type from the ESPN Core URL (e.g., 'athletes', 'teams').
   */
  private getPayloadType(url: string): string {
    const match = url.match(/\/fifa\.world\/([^/?]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Generates a deterministic, safe ID from the URL to prevent filesystem collisions.
   */
  private getSafeId(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  /**
   * Executes an HTTPS GET request and returns the raw string data and status code.
   */
  private makeRequest(url: string): Promise<{ data: string, status: number }> {
    const httpsUrl = url.replace('http://', 'https://');
    return new Promise((resolve, reject) => {
      https.get(httpsUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ data, status: res.statusCode || 500 }));
      }).on('error', (err) => reject(err));
    });
  }

  /**
   * Fetches an array of verified WORLD_CUP refs, saves them immutably, and updates the manifest.
   */
  public async fetchRefs(refs: string[]): Promise<void> {
    console.log(`[SYSTEM] Initiating immutable fetch for ${refs.length} WORLD_CUP refs...`);
    
    const manifestUpdates: ManifestEntry[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const ref of refs) {
      const entry: ManifestEntry = {
        ref_url: ref,
        payload_type: 'unknown',
        http_status: null,
        file_path: null,
        fetched_at: new Date().toISOString(),
        sha256_hash: null,
        byte_length: 0,
        json_valid: false
      };

      try {
        // 1. Strict Domain Validation
        if (!ref.includes(this.REQUIRED_PATH)) {
          throw new Error(`Domain violation: Ref does not contain ${this.REQUIRED_PATH}`);
        }

        entry.payload_type = this.getPayloadType(ref);
        const typeDir = path.join(this.BASE_DIR, entry.payload_type);
        if (!fs.existsSync(typeDir)) {
          fs.mkdirSync(typeDir, { recursive: true });
        }

        // 2. Fetch Payload
        const { data, status } = await this.makeRequest(ref);
        entry.http_status = status;
        entry.byte_length = Buffer.byteLength(data, 'utf8');

        if (status !== 200) {
          throw new Error(`HTTP Status ${status}`);
        }

        // 3. Validate JSON
        try {
          JSON.parse(data);
          entry.json_valid = true;
        } catch (e) {
          entry.json_valid = false;
          throw new Error('Invalid JSON payload');
        }

        // 4. Cryptographic Hashing & Immutable Write
        entry.sha256_hash = crypto.createHash('sha256').update(data).digest('hex');
        
        const timestamp = Date.now();
        const safeId = this.getSafeId(ref);
        const filename = `${timestamp}_${safeId}.json`;
        const filePath = path.join(typeDir, filename);
        
        fs.writeFileSync(filePath, data, 'utf-8');
        entry.file_path = filePath;
        
        successCount++;
        console.log(`[SUCCESS] Fetched ${entry.payload_type} -> ${filename}`);

      } catch (error: any) {
        failureCount++;
        entry.error = error.message;
        console.error(`[FAILED] ${ref} - ${error.message}`);
      }

      manifestUpdates.push(entry);
    }

    // 5. Append to Manifest
    let existingManifest: ManifestEntry[] = [];
    if (fs.existsSync(this.MANIFEST_PATH)) {
      try {
        existingManifest = JSON.parse(fs.readFileSync(this.MANIFEST_PATH, 'utf-8'));
      } catch (e) {
        console.warn('[WARNING] Existing manifest corrupted. Starting fresh.');
      }
    }
    
    const updatedManifest = existingManifest.concat(manifestUpdates);
    fs.writeFileSync(this.MANIFEST_PATH, JSON.stringify(updatedManifest, null, 2), 'utf-8');

    // 6. Execution Summary
    console.log('\n==================================================');
    console.log('[SYSTEM] FETCH OPERATION COMPLETE');
    console.log(`Refs Attempted : ${refs.length}`);
    console.log(`Success Count  : ${successCount}`);
    console.log(`Failure Count  : ${failureCount}`);
    console.log(`Manifest Path  : ${this.MANIFEST_PATH}`);
    console.log('==================================================\n');
  }
}

// ============================================================================
// EXECUTION ENTRY POINT (Awaiting Manual Trigger)
// ============================================================================
// const fetcher = new WorldCupPayloadFetcher();
// fetcher.fetchRefs([
//   'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/teams/594/athletes/104328',
//   'https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/injuries'
// ]).catch(console.error);
