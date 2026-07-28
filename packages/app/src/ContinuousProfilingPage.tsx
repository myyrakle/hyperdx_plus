import { useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  useMantineColorScheme,
} from '@mantine/core';
import { IconFlame } from '@tabler/icons-react';

import EmptyState from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { withAppNav } from '@/layout';
import { useProfilingConnections } from '@/profilingConnection';
import { useBrandDisplayName } from '@/theme/ThemeProvider';

function ContinuousProfilingPage() {
  const { t } = useTranslation('profiling');
  const brandName = useBrandDisplayName();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const profilingTheme = colorScheme === 'light' ? 'light' : 'dark';
  const { data: connections, isLoading } = useProfilingConnections();
  const enabledConnections =
    connections?.filter(connection => connection.enabled) ?? [];
  const requestedId =
    typeof router.query.connection === 'string'
      ? router.query.connection
      : undefined;
  const selected =
    enabledConnections.find(connection => connection.id === requestedId) ??
    enabledConnections[0];

  const syncProfilingTheme = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hyperdx:set-theme', theme: profilingTheme },
      window.location.origin,
    );
  }, [profilingTheme]);

  useEffect(syncProfilingTheme, [selected?.id, syncProfilingTheme]);

  return (
    <Stack gap={0} h="100%">
      <Head>
        <title>{t('page.browserTitle', { brandName })}</title>
      </Head>
      <PageHeader>
        <Group justify="space-between" w="100%">
          <Text>{t('page.title')}</Text>
          {enabledConnections.length > 1 && (
            <Select
              size="xs"
              value={selected?.id}
              data={enabledConnections.map(connection => ({
                value: connection.id,
                label: connection.name,
              }))}
              onChange={connection =>
                void router.replace(
                  { pathname: router.pathname, query: { connection } },
                  undefined,
                  { shallow: true },
                )
              }
            />
          )}
        </Group>
      </PageHeader>
      {isLoading ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : !selected ? (
        <Box p="xl">
          <EmptyState
            icon={<IconFlame size={32} />}
            title={t('page.emptyTitle')}
            description={t('page.emptyDescription')}
            variant="card"
          >
            <Text component={Link} href="/team?tab=data#profiling-connections">
              {t('page.configureConnection')}
            </Text>
          </EmptyState>
        </Box>
      ) : (
        <iframe
          ref={iframeRef}
          key={selected.id}
          title={t('page.frameTitle', { name: selected.name })}
          src={`/api/profiling-connections/${selected.id}/proxy/?hdx_theme=${profilingTheme}`}
          onLoad={syncProfilingTheme}
          referrerPolicy="no-referrer"
          style={{ border: 0, width: '100%', flex: 1, minHeight: 700 }}
        />
      )}
    </Stack>
  );
}

ContinuousProfilingPage.getLayout = withAppNav;
export default ContinuousProfilingPage;
