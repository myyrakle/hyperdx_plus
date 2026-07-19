import type { ProfilingConnection } from '@hyperdx/common-utils/dist/types';

import {
  getProfilingConnectionFormState,
  ProfilingConnectionInput,
} from '@/profilingConnection';

const existingConnection: ProfilingConnection = {
  id: 'connection-id',
  name: 'Profiles',
  endpoint: 'http://pyroscope:4040',
  authType: 'bearer',
  enabled: true,
  hasSecret: true,
};

const input: ProfilingConnectionInput = {
  name: 'Profiles',
  endpoint: 'http://pyroscope:4040',
  authType: 'bearer',
  enabled: true,
};

describe('getProfilingConnectionFormState', () => {
  it('reuses an existing secret only when the authentication type is unchanged', () => {
    expect(
      getProfilingConnectionFormState(input, existingConnection),
    ).toMatchObject({ canReuseSecret: true, canSubmit: true });

    expect(
      getProfilingConnectionFormState(
        { ...input, authType: 'basic', username: 'user' },
        existingConnection,
      ),
    ).toMatchObject({
      canReuseSecret: false,
      requiresSecret: true,
      canSubmit: false,
    });
  });

  it('requires a non-whitespace username for basic authentication', () => {
    expect(
      getProfilingConnectionFormState({
        ...input,
        authType: 'basic',
        username: '   ',
        secret: 'password',
      }).canSubmit,
    ).toBe(false);
  });

  it('allows complete new authentication settings', () => {
    expect(
      getProfilingConnectionFormState({
        ...input,
        authType: 'basic',
        username: 'user',
        secret: 'password',
      }),
    ).toMatchObject({ requiresSecret: true, canSubmit: true });
  });
});
