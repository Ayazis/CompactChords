// Fetches every link in urls/*.txt once and stores the parsed sheet in
// urls/cache, so the dev server can open saved songs without contacting
// Ultimate Guitar. Also writes urls/cache/library.json: import it with
// "Import file" on the deployed site to get the songs there.
// Usage: npm run precompute [-- --force]

import { relative } from 'node:path';
import { labelFromUrl } from '../src/core/importers/ultimate-guitar';
import { libraryExportPath, precompute, writeLibraryExport } from '../server/saved-songs';

const root = process.cwd();
const force = process.argv.includes('--force');
const results = await precompute(root, {
  force,
  onResult: ({ url, status, error }) =>
    console.log(`${status.padEnd(7)} ${labelFromUrl(url)}${error ? `  (${error})` : ''}`),
});

const failed = results.filter((result) => result.status === 'failed').length;
console.log(`\n${results.length - failed} of ${results.length} saved songs are pre-computed in urls/cache.`);

const exported = await writeLibraryExport(root);
console.log(
  `Wrote ${exported} songs to ${relative(root, libraryExportPath(root))}. ` +
    'Load it in the app with Import & backup → Import file.',
);
process.exitCode = failed > 0 ? 1 : 0;
