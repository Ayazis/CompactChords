// Optional helpers served by the local dev/preview server. The app works
// without them (static hosting); they only add:
// - GET /api/import?url=… — the chord sheet for a tab-site link, from
//   urls/cache when pre-computed, otherwise fetched here (browsers cannot
//   fetch the page directly because of CORS).
// - GET /api/lists — the links saved in urls/*.txt.

import type { Connect, Plugin } from 'vite';
import { extractSheet, ImportError, isSupportedUrl } from '../src/core/importers/tab-site';
import { fetchSheetHtml, listedSongs, readCached } from './saved-songs';

type Response = Parameters<Connect.NextHandleFunction>[1];

function send(res: Response, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function importSheet(root: string, target: string, res: Response) {
  if (!isSupportedUrl(target)) {
    return send(res, 400, { error: 'Only links from the supported tab site can be imported.' });
  }

  const cached = await readCached(root, target);
  if (cached) return send(res, 200, cached);

  try {
    send(res, 200, extractSheet(await fetchSheetHtml(target)));
  } catch (error) {
    if (error instanceof ImportError) return send(res, 422, { error: error.message });
    send(res, 502, { error: `Could not load the page: ${(error as Error).message}` });
  }
}

function handler(root: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/import') return importSheet(root, url.searchParams.get('url') ?? '', res);
    if (url.pathname === '/api/lists') return send(res, 200, await listedSongs(root));
    next();
  };
}

export function importPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'compact-chords-import',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(handler(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(root));
    },
  };
}
