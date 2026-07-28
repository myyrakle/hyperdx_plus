import { useState } from 'react';
import { HTTPError } from 'ky';
import { useTranslation } from 'react-i18next';
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
  getProfilingConnectionFormState,
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
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
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
  const { canReuseSecret, requiresSecret, canTest, canSubmit } =
    getProfilingConnectionFormState(value, connection);

  const update = <K extends keyof ProfilingConnectionInput>(
    key: K,
    nextValue: ProfilingConnectionInput[K],
  ) => setValue(current => ({ ...current, [key]: nextValue }));

  return (
    <Stack gap="sm" mt="md">
      <TextInput
        label={t('profilingConnections.name')}
        value={value.name}
        onChange={event => update('name', event.currentTarget.value)}
        required
      />
      <TextInput
        label={t('profilingConnections.endpoint')}
        description={t('profilingConnections.endpointDescription')}
        value={value.endpoint}
        onChange={event => update('endpoint', event.currentTarget.value)}
        required
      />
      <TextInput
        label={t('profilingConnections.tenantId')}
        description={t('profilingConnections.tenantIdDescription')}
        value={value.tenantId ?? ''}
        onChange={event => update('tenantId', event.currentTarget.value)}
      />
      <Select
        label={t('profilingConnections.authType')}
        value={value.authType}
        data={[
          { value: 'none', label: t('profilingConnections.authNone') },
          { value: 'basic', label: t('profilingConnections.authBasic') },
          { value: 'bearer', label: t('profilingConnections.authBearer') },
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
          label={t('profilingConnections.username')}
          value={value.username ?? ''}
          onChange={event => update('username', event.currentTarget.value)}
          required
        />
      )}
      {value.authType !== 'none' && (
        <PasswordInput
          label={
            canReuseSecret
              ? t('profilingConnections.replaceSecret')
              : t('profilingConnections.secret')
          }
          description={
            canReuseSecret
              ? t('profilingConnections.replaceSecretDescription')
              : undefined
          }
          value={value.secret ?? ''}
          onChange={event => update('secret', event.currentTarget.value)}
          required={requiresSecret}
        />
      )}
      <Switch
        label={t('profilingConnections.enabled')}
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
                      message: t('profilingConnections.deleteFailed'),
                    }),
                })
              }
            >
              {tCommon('actions.delete')}
            </Button>
          )}
        </div>
        <Group gap="xs">
          <Button variant="secondary" onClick={onClose}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="secondary"
            loading={testConnection.isPending}
            disabled={!canTest}
            onClick={async () => {
              try {
                await testConnection.mutateAsync({
                  id: connection?.id,
                  input: value,
                });
                notifications.show({
                  color: 'green',
                  message: t('profilingConnections.testSuccess'),
                });
              } catch (error) {
                let message: string = t('profilingConnections.testFailure');
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
            {t('profilingConnections.test')}
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!canSubmit}
            onClick={() =>
              save.mutate(
                { id: connection?.id, input: value },
                {
                  onSuccess: () => {
                    notifications.show({
                      color: 'green',
                      message: t('profilingConnections.saved'),
                    });
                    onClose();
                  },
                  onError: () =>
                    notifications.show({
                      color: 'red',
                      message: t('profilingConnections.saveFailed'),
                    }),
                },
              )
            }
          >
            {tCommon('actions.save')}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

export default function ProfilingConnectionsSection() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { data: connections } = useProfilingConnections();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Box id="profiling-connections">
      <Text size="md">{t('sections.profilingConnections')}</Text>
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
                    {t('profilingConnections.tenant', {
                      tenantId:
                        connection.tenantId ||
                        t('profilingConnections.anonymousTenant'),
                      authType: connection.authType,
                    })}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  onClick={() => setEditingId(connection.id)}
                >
                  {tCommon('actions.edit')}
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
              {t('profilingConnections.add')}
            </Button>
          )}
        </Stack>
      </Card>
    </Box>
  );
}
