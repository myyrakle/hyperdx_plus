import { WebhookService } from '@hyperdx/common-utils/dist/types';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import api from '@/api';
import { WebhookForm } from '@/components/TeamSettings/WebhookForm';

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useSaveWebhook: jest.fn(),
    useUpdateWebhook: jest.fn(),
    useTestWebhook: jest.fn(),
  },
}));

jest.mock('@/utils', () => ({
  ...jest.requireActual('@/utils'),
  useBrandDisplayName: () => 'HyperDX',
}));

const saveMutate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  saveMutate.mockResolvedValue({ _id: 'w1' });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  jest.mocked(api.useSaveWebhook).mockReturnValue({
    mutateAsync: saveMutate,
    isPending: false,
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  jest.mocked(api.useUpdateWebhook).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  jest.mocked(api.useTestWebhook).mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: false,
  } as any);
});

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <WebhookForm onClose={jest.fn()} onSuccess={jest.fn()} />
      </MantineProvider>
    </QueryClientProvider>,
  );

const errorServiceRadio = () =>
  screen.getByRole('radio', { name: /Slack \(Error\)/i });

describe('WebhookForm Slack (Error) service', () => {
  it('offers the service as a choice', () => {
    renderForm();

    expect(errorServiceRadio()).toBeInTheDocument();
  });

  it('saves the selected service', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(errorServiceRadio());
    await user.type(screen.getByTestId('webhook-name-input'), 'errors');
    await user.type(
      screen.getByTestId('webhook-url-input'),
      'https://hooks.slack.com/services/T0/B0/XXXX',
    );
    await user.click(screen.getByTestId('add-webhook-button'));

    await waitFor(() => expect(saveMutate).toHaveBeenCalled());
    expect(saveMutate.mock.calls[0][0]).toMatchObject({
      service: WebhookService.SlackError,
    });
  });

  it('rejects a URL that is not a Slack webhook', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(errorServiceRadio());
    await user.type(screen.getByTestId('webhook-name-input'), 'errors');
    await user.type(
      screen.getByTestId('webhook-url-input'),
      'https://evil.example.com/webhook',
    );
    await user.click(screen.getByTestId('add-webhook-button'));

    await waitFor(() =>
      expect(screen.getByTestId('webhook-url-input')).toBeInvalid(),
    );
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it('suggests a Slack incoming webhook URL', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(errorServiceRadio());

    expect(screen.getByTestId('webhook-url-input')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('hooks.slack.com'),
    );
  });

  it('does not offer a request body, which this service does not use', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(errorServiceRadio());

    expect(screen.queryByText(/headers/i)).not.toBeInTheDocument();
  });
});
