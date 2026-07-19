import { ObjectId } from 'mongodb';

import { getAgent, getLoggedInAgent, getServer } from '@/fixtures';
import ProfilingConnection from '@/models/profilingConnection';

const mockFetch = global.fetch as jest.Mock;

function fakeUpstreamResponse(
  payload: unknown,
  contentType = 'application/json',
  status = 200,
) {
  const body =
    contentType === 'text/html' && typeof payload === 'string'
      ? payload
      : JSON.stringify(payload);
  const encoded = new TextEncoder().encode(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: jest.fn().mockResolvedValue(encoded.buffer),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  };
}

describe('profiling connections', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  afterEach(async () => {
    await server.clearDBs();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(fakeUpstreamResponse({}) as any);
  });

  afterAll(async () => {
    await server.stop();
  });

  it('requires a HyperDX session', async () => {
    await getAgent(server).get('/profiling-connections').expect(401);
  });

  it('scopes connections to the authenticated team and never returns secrets', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    await ProfilingConnection.create({
      team: team._id,
      name: 'Production profiles',
      endpoint: 'http://pyroscope:4040',
      tenantId: 'production',
      authType: 'bearer',
      secret: 'do-not-return',
    });
    await ProfilingConnection.create({
      team: new ObjectId(),
      name: 'Other team',
      endpoint: 'http://other-pyroscope:4040',
      tenantId: 'other',
      authType: 'none',
    });

    const response = await agent.get('/profiling-connections').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: 'Production profiles',
      authType: 'bearer',
      hasSecret: true,
    });
    expect(response.body[0]).not.toHaveProperty('secret');
  });

  it('uses HyperDX authentication to inject the configured Pyroscope tenant', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse({ labelsSet: [] }) as any,
    );
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Secured profiles',
      endpoint: 'http://pyroscope:4040',
      tenantId: 'team-profiles',
      authType: 'bearer',
      secret: 'server-only-token',
    });

    await agent
      .post(
        `/profiling-connections/${connection._id.toString()}/proxy/querier.v1.QuerierService/Series`,
      )
      .set('Authorization', 'Bearer browser-supplied-token')
      .set('X-Scope-OrgID', 'other-team')
      .send({ matchers: [] })
      .expect(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url.toString()).toBe(
      'http://pyroscope:4040/querier.v1.QuerierService/Series',
    );
    expect(options.headers).toMatchObject({
      authorization: 'Bearer server-only-token',
      'x-scope-orgid': 'team-profiles',
    });
  });

  it('tests unsaved Pyroscope settings with server-side authentication', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse({ status: 'success' }) as any,
    );
    const { agent } = await getLoggedInAgent(server);

    await agent
      .post('/profiling-connections/test')
      .send({
        endpoint: 'http://pyroscope:4040',
        tenantId: 'team-profiles',
        authType: 'basic',
        username: '  hyperdx  ',
        secret: 'server-only-password',
      })
      .expect(200, { success: true });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url.toString()).toBe(
      'http://pyroscope:4040/api/v1/status/buildinfo',
    );
    expect(options.headers).toMatchObject({
      authorization: `Basic ${Buffer.from(
        'hyperdx:server-only-password',
      ).toString('base64')}`,
      'x-scope-orgid': 'team-profiles',
    });
  });

  it('rejects whitespace-only basic authentication usernames', async () => {
    const { agent } = await getLoggedInAgent(server);

    await agent
      .post('/profiling-connections')
      .send({
        name: 'Invalid basic auth',
        endpoint: 'http://pyroscope:4040',
        authType: 'basic',
        username: '   ',
        secret: 'password',
      })
      .expect(400);
  });

  it('does not persist credentials when authentication is disabled', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    const response = await agent
      .post('/profiling-connections')
      .send({
        name: 'Anonymous profiles',
        endpoint: 'http://pyroscope:4040',
        authType: 'none',
        username: 'accidental-user',
        secret: 'accidental-secret',
      })
      .expect(201);

    const connection = await ProfilingConnection.findOne({
      _id: response.body.id,
      team: team._id,
    }).select('+secret');
    expect(connection?.username).toBeUndefined();
    expect(connection?.secret).toBeUndefined();
  });

  it('reuses an existing team connection secret when testing an edit', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse({ status: 'success' }) as any,
    );
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://old-pyroscope:4040',
      authType: 'bearer',
      secret: 'saved-token',
    });

    await agent
      .post('/profiling-connections/test')
      .send({
        connectionId: connection._id.toString(),
        endpoint: 'http://new-pyroscope:4040',
        authType: 'bearer',
      })
      .expect(200, { success: true });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url.toString()).toBe(
      'http://new-pyroscope:4040/api/v1/status/buildinfo',
    );
    expect(options.headers.authorization).toBe('Bearer saved-token');
  });

  it('reports an unsuccessful Pyroscope connection test', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse(
        { message: 'unauthorized' },
        'application/json',
        401,
      ) as any,
    );
    const { agent } = await getLoggedInAgent(server);

    await agent
      .post('/profiling-connections/test')
      .send({
        endpoint: 'http://pyroscope:4040',
        authType: 'bearer',
        secret: 'wrong-token',
      })
      .expect(502, {
        success: false,
        error: 'Pyroscope returned HTTP 401',
      });
  });

  it('rewrites the Pyroscope UI base and inherits the HyperDX theme', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse(
        '<html><head><base href="/" /></head><body></body></html>',
        'text/html',
      ) as any,
    );
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles UI',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    const response = await agent
      .get(`/profiling-connections/${connection._id}/proxy/?hdx_theme=light`)
      .expect(200);

    expect(response.text).toContain(
      `<base href="/api/profiling-connections/${connection._id}/proxy/" />`,
    );
    expect(response.text).toContain('<html data-theme="light">');
    expect(response.text).toContain('hyperdx:set-theme');
    expect(response.text).toContain('.navbar > :last-child');
    expect(response.text).not.toContain('new MutationObserver');
    expect(mockFetch.mock.calls[0][0].toString()).toBe(
      'http://pyroscope:4040/',
    );
  });

  it('rewrites attributed Pyroscope head tags without dropping attributes', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeUpstreamResponse(
        '<html><HEAD data-app="pyroscope"><title>Profiles</title></HEAD></html>',
        'text/html',
      ) as any,
    );
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles UI',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    const response = await agent
      .get(`/profiling-connections/${connection._id}/proxy/`)
      .expect(200);

    expect(response.text).toContain('<HEAD data-app="pyroscope">');
    expect(response.text).toContain(
      `<base href="/api/profiling-connections/${connection._id}/proxy/" />`,
    );
    expect(response.text).toContain('hyperdx:set-theme');
    expect(response.text).toContain('.navbar > :last-child');
  });

  it('rejects normalized traversal paths before calling Pyroscope', async () => {
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    await agent
      .get(`/profiling-connections/${connection._id}/proxy/assets/%2e%2e/admin`)
      .expect(405);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows canonical static asset paths', async () => {
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    await agent
      .get(`/profiling-connections/${connection._id}/proxy/assets/app.js`)
      .expect(200);

    expect(mockFetch.mock.calls[0][0].toString()).toBe(
      'http://pyroscope:4040/assets/app.js',
    );
  });

  it.each([
    ['application/json', '{ "query": "cpu" }'],
    ['application/octet-stream', 'raw-profile-bytes'],
  ])('forwards %s POST bodies byte-for-byte', async (contentType, body) => {
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    await agent
      .post(
        `/profiling-connections/${connection._id}/proxy/querier.v1.QuerierService/Series`,
      )
      .set('content-type', contentType)
      .send(body)
      .expect(200);

    expect(Buffer.from(mockFetch.mock.calls[0][1].body)).toEqual(
      Buffer.from(body),
    );
  });

  it('does not invent a body for a bodyless POST', async () => {
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://pyroscope:4040',
      authType: 'none',
    });

    await agent
      .post(
        `/profiling-connections/${connection._id}/proxy/querier.v1.QuerierService/Series`,
      )
      .expect(200);

    expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('rejects invalid profiling connection IDs before proxying', async () => {
    const { agent } = await getLoggedInAgent(server);

    await agent
      .get('/profiling-connections/not-an-object-id/proxy/')
      .expect(400);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects Pyroscope ingestion paths', async () => {
    const { agent, team } = await getLoggedInAgent(server);
    const connection = await ProfilingConnection.create({
      team: team._id,
      name: 'Profiles',
      endpoint: 'http://pyroscope:4040',
      tenantId: 'team-profiles',
      authType: 'none',
    });

    await agent
      .post(`/profiling-connections/${connection._id}/proxy/ingest`)
      .send({ profile: 'data' })
      .expect(405);
  });
});
