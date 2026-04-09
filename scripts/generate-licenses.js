const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronPkg = require('../node_modules/electron/package.json');
const electronVersion = `electron@${electronPkg.version}`;

const run = (args) =>
  JSON.parse(execSync(`npx license-checker-rseidelsohn ${args} --json`, { encoding: 'utf8' }));

const productionLicenses = run('--production --excludePrivatePackages');
const electronLicense = run(`--includePackages ${electronVersion}`);

const merged = { ...productionLicenses, ...electronLicense };
const sanitized = Object.fromEntries(
  Object.entries(merged).map(([pkg, details]) => {
    const sanitizedDetails = {
      licenses: details && details.licenses ? details.licenses : 'Unknown',
    };
    if (details && details.repository) {
      sanitizedDetails.repository = details.repository;
    }
    return [pkg, sanitizedDetails];
  })
);

fs.writeFileSync(
  path.join(__dirname, '..', 'licenses.json'),
  JSON.stringify(sanitized, null, 4)
);

console.log(`Generated licenses.json with ${Object.keys(sanitized).length} packages.`);
