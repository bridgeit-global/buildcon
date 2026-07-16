#!/usr/bin/env node
/**
 * Copy document-scan assets into public/.
 * Run before dev/build so large vendor files are not committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function copyFiles(destRel, files) {
  const dest = path.join(root, destRel);
  fs.mkdirSync(dest, { recursive: true });
  for (const [fromRel, toName] of files) {
    const from = path.join(root, fromRel);
    if (!fs.existsSync(from)) {
      console.warn(`[copy-kyc-assets] missing ${fromRel}, skip`);
      continue;
    }
    fs.copyFileSync(from, path.join(dest, toName));
  }
}

copyFiles('public/jscanify', [
  ['node_modules/jscanify/src/opencv.js', 'opencv.js'],
  ['node_modules/jscanify/src/jscanify.js', 'jscanify.js']
]);

console.log('[copy-kyc-assets] ready: public/jscanify');
