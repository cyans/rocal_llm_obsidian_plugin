import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

const version = packageJson.version;
manifestJson.version = version;

const versionsPath = 'versions.json';
const versions = fs.existsSync(versionsPath)
  ? JSON.parse(fs.readFileSync(versionsPath, 'utf8'))
  : {};

versions[version] = manifestJson.minAppVersion;

fs.writeFileSync('manifest.json', `${JSON.stringify(manifestJson, null, 2)}\n`);
fs.writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);

console.log(`Synced manifest.json and versions.json to version ${version}`);
