// Fetches every link in urls/*.txt once and stores the parsed sheet in
// urls/cache, so the app can open saved songs without contacting the tab site.
// Usage: npm run precompute [-- --force]

import { labelFromUrl } from '../src/core/importers/tab-site';
import { precompute } from '../server/saved-songs';

const force = process.argv.includes('--force');
const results = await precompute(process.cwd(), {
  force,
  onResult: ({ url, status, error }) =>
    console.log(`${status.padEnd(7)} ${labelFromUrl(url)}${error ? `  (${error})` : ''}`),
});

const failed = results.filter((result) => result.status === 'failed').length;
console.log(`\n${results.length - failed} of ${results.length} saved songs are pre-computed in urls/cache.`);
process.exitCode = failed > 0 ? 1 : 0;
