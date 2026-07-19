import type { RequestHandler } from 'express';
import { performance } from 'perf_hooks';

import { CODE_VERSION } from '@/config';
import { getProfilingConnectionById } from '@/controllers/profilingConnection';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { recordOperationOutcome } from '@/utils/instrumentation';

const QUERY_OPERATION = 'pyroscope_proxy.query';
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

const READ_PROCEDURES = new Set([
  'AnalyzeQuery',
  'Diff',
  'GetProfileStats',
  'LabelNames',
  'LabelValues',
  'ProfileTypes',
  'Query',
  'QueryMetadata',
  'SelectHeatmap',
  'SelectMergeProfile',
  'SelectMergeSpanProfile',
  'SelectMergeStacktraces',
  'SelectSeries',
  'Series',
]);

function isAllowedRequest(method: string, path: string) {
  if (method === 'GET') {
    return (
      ['/', '/explore', '/comparison', '/comparison-diff'].includes(path) ||
      ['/assets/', '/icons/', '/public/'].some(prefix =>
        path.startsWith(prefix),
      ) ||
      path === '/favicon.svg' ||
      path === '/api/v1/status/buildinfo' ||
      [
        '/pyroscope/render',
        '/pyroscope/render-diff',
        '/pyroscope/label-values',
      ].includes(path)
    );
  }

  if (method !== 'POST') return false;
  const prefix = '/querier.v1.QuerierService/';
  return (
    path.startsWith(prefix) && READ_PROCEDURES.has(path.slice(prefix.length))
  );
}

export function buildProfilingAuthorization(
  authType: 'none' | 'basic' | 'bearer',
  username?: string,
  secret?: string,
) {
  if (authType === 'bearer' && secret) return `Bearer ${secret}`;
  if (authType === 'basic' && secret) {
    return `Basic ${Buffer.from(`${username ?? ''}:${secret}`).toString('base64')}`;
  }
  return undefined;
}

// Reads an upstream body while enforcing a hard byte cap. Unlike buffering the
// entire response first and checking its size afterwards, this aborts as soon as
// the accumulated chunks exceed `maxBytes`, so a Pyroscope instance that streams
// an oversized response without a `content-length` header cannot exhaust memory.
// Returns null when the cap is exceeded.
async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

type ProfilingTheme = 'dark' | 'light';

function rewriteUiBase(
  html: string,
  connectionId: string,
  theme: ProfilingTheme,
) {
  const base = `/api/profiling-connections/${connectionId}/proxy/`;
  const headOpeningTag = /<head\b[^>]*>/i;
  const withBase = /<base\s/i.test(html)
    ? html.replace(
        /<base\s+href=["'][^"']*["']\s*\/?>/i,
        `<base href="${base}" />`,
      )
    : html.replace(
        headOpeningTag,
        openingTag => `${openingTag}<base href="${base}" />`,
      );
  const withInitialTheme = withBase.replace(
    /<html([^>]*)>/i,
    (_match, attributes: string) => {
      const withoutTheme = attributes.replace(
        /\sdata-theme=["'][^"']*["']/i,
        '',
      );
      return `<html${withoutTheme}${
        theme === 'light' ? ' data-theme="light"' : ''
      }>`;
    },
  );
  const themeBridge = `<style>.navbar > :last-child { display: none !important; }</style>
<script>
(() => {
  let inheritedTheme = ${JSON.stringify(theme)};
  const applyTheme = () => {
    if (inheritedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };
  window.addEventListener('message', event => {
    if (
      event.origin === window.location.origin &&
      event.data?.type === 'hyperdx:set-theme' &&
      (event.data.theme === 'dark' || event.data.theme === 'light')
    ) {
      inheritedTheme = event.data.theme;
      applyTheme();
    }
  });
  applyTheme();
})();
</script>`;
  return withInitialTheme.replace(
    headOpeningTag,
    openingTag => `${openingTag}${themeBridge}`,
  );
}

export const profilingProxyHandler: RequestHandler = async (req, res, next) => {
  const startedAt = performance.now();
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const connection = await getProfilingConnectionById(
      teamId.toString(),
      req.params.id,
      true,
    );
    if (!connection || !connection.enabled) {
      res.status(404).send('Profiling connection not found');
      return;
    }

    const path = new URL(req.path || '/', 'http://hyperdx.local').pathname;
    if (!isAllowedRequest(req.method, path)) {
      res
        .status(405)
        .json({ error: 'Pyroscope write or admin APIs are not allowed' });
      return;
    }

    const endpoint = connection.endpoint.endsWith('/')
      ? connection.endpoint
      : `${connection.endpoint}/`;
    const upstreamUrl = new URL(path.replace(/^\//, ''), endpoint);
    const requestUrl = new URL(req.originalUrl, 'http://hyperdx.local');
    const requestedTheme = requestUrl.searchParams.get('hdx_theme');
    const inheritedTheme: ProfilingTheme =
      requestedTheme === 'light' ? 'light' : 'dark';
    requestUrl.searchParams.delete('hdx_theme');
    upstreamUrl.search = requestUrl.search;

    const headers: Record<string, string> = {
      accept: req.headers.accept ?? '*/*',
      'user-agent': `hyperdx ${CODE_VERSION}`,
    };
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string') headers['content-type'] = contentType;
    if (connection.tenantId) headers['x-scope-orgid'] = connection.tenantId;
    const authorization = buildProfilingAuthorization(
      connection.authType,
      connection.username,
      connection.secret,
    );
    if (authorization) headers.authorization = authorization;

    const body =
      req.method === 'POST' && Buffer.isBuffer(req.body) && req.body.length > 0
        ? new Uint8Array(req.body)
        : undefined;
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    });

    const contentLength = Number(upstream.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      res.status(502).json({ error: 'Pyroscope response is too large' });
      return;
    }
    const responseBuffer = await readBodyCapped(
      upstream.body,
      MAX_RESPONSE_BYTES,
    );
    if (responseBuffer === null) {
      res.status(502).json({ error: 'Pyroscope response is too large' });
      return;
    }

    const upstreamContentType = upstream.headers.get('content-type');
    if (upstreamContentType) res.setHeader('content-type', upstreamContentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('cache-control', cacheControl);
    res.setHeader('content-security-policy', "frame-ancestors 'self'");
    res.status(upstream.status);

    const isHtml = upstreamContentType?.includes('text/html');
    res.send(
      isHtml
        ? rewriteUiBase(
            responseBuffer.toString('utf8'),
            connection._id.toString(),
            inheritedTheme,
          )
        : responseBuffer,
    );
    recordOperationOutcome({
      operation: QUERY_OPERATION,
      outcome: upstream.ok ? 'success' : 'error',
      durationMs: performance.now() - startedAt,
    });
  } catch (error) {
    recordOperationOutcome({
      operation: QUERY_OPERATION,
      outcome: 'error',
      durationMs: performance.now() - startedAt,
    });
    next(error);
  }
};
