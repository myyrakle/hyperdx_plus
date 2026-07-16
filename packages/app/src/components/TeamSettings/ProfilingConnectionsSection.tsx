import { useState } from 'react';
import { HTTPError } from 'ky';
import type { ProfilingConnection } from '@hyperdx/common-utils/dist/types';
import {
  Box,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import {
  ProfilingConnectionInput,
  useDeleteProfilingConnection,
  useProfilingConnections,
  useSaveProfilingConnection,
  useTestProfilingConnection,
} from '@/profilingConnection';

const EMPTY_CONNECTION: ProfilingConnectionInput = {
  name: '',
  endpoint: 'http://localhost:4040',
  tenantId: '',
  authType: 'none',
  username: '',
  enabled: true,
};

function ProfilingConnectionForm({
  connection,
  onClose,
}: {
  connection?: ProfilingConnection;
  onClose: () => void;
}) {
  const [value, setValue] = useState<ProfilingConnectionInput>(
    connection
      ? {
          name: connection.name,
          endpoint: connection.endpoint,
          tenantId: connection.tenantId,
          authType: connection.authType,
          username: connection.username,
          enabled: connection.enabled,
        }
      : EMPTY_CONNECTION,
  );
  const save = useSaveProfilingConnection();
  const testConnection = useTestProfilingConnection();
  const remove = useDeleteProfilingConnection();

  const update = <K extends keyof ProfilingConnectionInput>(
    key: K,
    nextValue: ProfilingConnectionInput[K],
  ) => setValue(current => ({ ...current, [key]: nextValue }));

  return (
    <Stack gap="sm" mt="md">
      <TextInput
        label="Connection name"
        value={value.name}
        onChange={event => update('name', event.currentTarget.value)}
        required
      />
      <TextInput
        label="Pyroscope endpoint"
        description="The HyperDX API server must be able to reach this URL."
        value={value.endpoint}
        onChange={event => update('endpoint', event.currentTarget.value)}
        required
      />
      <TextInput
        label="Pyroscope tenant ID"
        description="HyperDX sends this value as X-Scope-OrgID."
        value={value.tenantId ?? ''}
        onChange={event => update('tenantId', event.currentTarget.value)}
      />
      <Select
        label="Upstream authentication"
        value={value.authType}
        data={[
          { value: 'none', label: 'None' },
          { value: 'basic', label: 'Basic authentication' },
          { value: 'bearer', label: 'Bearer token' },
        ]}
        onChange={next =>
          update(
            'authType',
            (next ?? 'none') as ProfilingConnectionInput['authType'],
          )
        }
      />
      {value.authType === 'basic' && (
        <TextInput
          label="Username"
          value={value.username ?? ''}
          onChange={event => update('username', event.currentTarget.value)}
          required
        />
      )}
      {value.authType !== 'none' && (
        <PasswordInput
          label={connection?.hasSecret ? 'Replace secret' : 'Secret'}
          description={
            connection?.hasSecret
              ? 'Leave blank to keep the currently configured secret.'
              : undefined
          }
          value={value.secret ?? ''}
          onChange={event => update('secret', event.currentTarget.value)}
          required={!connection?.hasSecret}
        />
      )}
      <Switch
        label="Enabled"
        checked={value.enabled}
        onChange={event => update('enabled', event.currentTarget.checked)}
      />
      <Group justify="space-between">
        <div>
          {connection && (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(connection.id, {
                  onSuccess: onClose,
                  onError: () =>
                    notifications.show({
                      color: 'red',
                      message: 'Failed to delete profiling connection',
                    }),
                })
              }
            >
              Delete
            </Button>
          )}
        </div>
        <Group gap="xs">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={testConnection.isPending}
            disabled={!value.endpoint}
            onClick={async () => {
              try {
                await testConnection.mutateAsync({
                  id: connection?.id,
                  input: value,
                });
                notifications.show({
                  color: 'green',
                  message: 'Successfully connected to Pyroscope',
                });
              } catch (error) {
                let message = 'Unable to connect to Pyroscope';
                if (error instanceof HTTPError) {
                  try {
                    const body: { error?: string } =
                      await error.response.json();
                    message = body.error ?? message;
                  } catch {
                    // Keep the fallback message for non-JSON responses.
                  }
                }
                notifications.show({
                  color: 'red',
                  message,
                });
              }
            }}
          >
            Test Connection
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!value.name || !value.endpoint}
            onClick={() =>
              save.mutate(
                { id: connection?.id, input: value },
                {
                  onSuccess: () => {
                    notifications.show({
                      color: 'green',
                      message: 'Profiling connection saved',
                    });
                    onClose();
                  },
                  onError: () =>
                    notifications.show({
                      color: 'red',
                      message: 'Failed to save profiling connection',
                    }),
                },
              )
            }
          >
            Save
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

export default function ProfilingConnectionsSection() {
  const { data: connections } = useProfilingConnections();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Box id="profiling-connections">
      <Text size="md">Profiling Connections</Text>
      <Divider my="md" />
      <Card>
        <Stack gap="md">
          {connections?.map(connection => (
            <Box key={connection.id}>
              <Group justify="space-between">
                <div>
                  <Text fw={500}>{connection.name}</Text>
                  <Text size="sm" c="dimmed">
                    {connection.endpoint}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Tenant: {connection.tenantId || 'anonymous'} ·{' '}
                    {connection.authType}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  onClick={() => setEditingId(connection.id)}
                >
                  Edit
                </Button>
              </Group>
              {editingId === connection.id && (
                <ProfilingConnectionForm
                  connection={connection}
                  onClose={() => setEditingId(null)}
                />
              )}
              <Divider mt="md" />
            </Box>
          ))}
          {editingId === 'new' ? (
            <ProfilingConnectionForm onClose={() => setEditingId(null)} />
          ) : (
            <Button
              variant="primary"
              onClick={() => setEditingId('new')}
              w="fit-content"
            >
              Add Profiling Connection
            </Button>
          )}
        </Stack>
      </Card>
    </Box>
  );
}
