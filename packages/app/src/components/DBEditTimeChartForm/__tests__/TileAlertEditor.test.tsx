import { useForm } from 'react-hook-form';
import { WebhookService } from '@hyperdx/common-utils/dist/types';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';

import api from '@/api';
import { TileAlertEditor } from '@/components/DBEditTimeChartForm/TileAlertEditor';

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useWebhooks: jest.fn(),
    useAlert: () => ({ data: undefined }),
  },
}));

jest.mock('@/components/Alerts', () => ({
  __esModule: true,
  AlertChannelForm: () => <div data-testid="alert-channel-form" />,
}));

jest.mock('@/components/SQLEditor/SQLInlineEditor', () => ({
  __esModule: true,
  SQLInlineEditorControlled: () => <div data-testid="sql-inline-editor" />,
}));

let webhooks: Array<{ _id: string; service: WebhookService }> = [];

const alert: any = {
  interval: '5m',
  threshold: 1,
  thresholdType: 'above',
  channel: { type: 'webhook', webhookId: 'webhook-id' },
};

const Harness = () => {
  const { control, setValue } = useForm<any>({ defaultValues: { alert } });
  return (
    <TileAlertEditor
      control={control}
      setValue={setValue}
      alert={alert}
      onRemove={jest.fn()}
      tableConnection={
        { databaseName: 'default', tableName: 'otel_traces' } as any
      }
    />
  );
};

const renderEditor = () =>
  render(
    <MantineProvider>
      <Harness />
    </MantineProvider>,
  );

beforeEach(() => {
  webhooks = [];

  jest
    .mocked(api.useWebhooks)
    .mockImplementation(
      () => ({ data: { data: webhooks }, refetch: jest.fn() }) as any,
    );
});

describe('TileAlertEditor mention', () => {
  const mentionSelect = () => screen.queryByTestId('alert-mention-select');

  it('is offered when the alert goes to a Slack (Error) webhook', () => {
    webhooks = [{ _id: 'webhook-id', service: WebhookService.SlackError }];

    renderEditor();

    expect(mentionSelect()).toBeInTheDocument();
  });

  it('offers no mention, here and channel', () => {
    webhooks = [{ _id: 'webhook-id', service: WebhookService.SlackError }];

    renderEditor();

    expect(
      Array.from(mentionSelect()!.querySelectorAll('option')).map(
        o => (o as HTMLOptionElement).value,
      ),
    ).toEqual(['', 'here', 'channel']);
  });

  it('is hidden for services that ignore mentions', () => {
    webhooks = [{ _id: 'webhook-id', service: WebhookService.Slack }];

    renderEditor();

    expect(mentionSelect()).not.toBeInTheDocument();
  });
});

describe('TileAlertEditor display fields', () => {
  // The list starts empty, so the add button — not a row — is what proves the
  // control is offered.
  const addButton = () => screen.queryByTestId('add-display-field');

  it('offers the input when the alert goes to a Slack (Error) webhook', () => {
    webhooks = [{ _id: 'webhook-id', service: WebhookService.SlackError }];

    renderEditor();

    expect(addButton()).toBeInTheDocument();
  });

  it('is hidden for services that ignore display fields', () => {
    webhooks = [{ _id: 'webhook-id', service: WebhookService.Slack }];

    renderEditor();

    expect(addButton()).not.toBeInTheDocument();
  });

  it('is hidden while the webhook list is still empty', () => {
    renderEditor();

    expect(addButton()).not.toBeInTheDocument();
  });
});
