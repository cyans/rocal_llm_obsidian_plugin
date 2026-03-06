import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'release');

fs.mkdirSync(distDir, { recursive: true });

for (const file of ['main.js', 'manifest.json', 'styles.css', 'versions.json']) {
  fs.copyFileSync(path.join(root, file), path.join(distDir, file));
}

console.log(`Release assets copied to ${distDir}`);
