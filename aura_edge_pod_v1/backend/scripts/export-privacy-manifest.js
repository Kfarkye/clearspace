import fs from 'fs/promises';
import path from 'path';
import { getPrivacyManifest } from '../lib/compliance/privacy-manifest.js';

async function exportManifest() {
  const outDir = path.resolve(process.cwd(), 'ios_export');
  const outFile = path.join(outDir, 'PrivacyInfo.xcprivacy');
  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outFile, getPrivacyManifest(), 'utf8');
    console.log(`[export] Wrote Apple privacy manifest to: ${outFile}`);
  } catch (error) {
    console.error(`[export] Failed to write manifest:`, error);
    process.exit(1);
  }
}
exportManifest();
