import { useForm } from 'react-hook-form';
import { WebhookService } from '@hyperdx/common-utils/dist/types';
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';

import api from '@/api';
import { AlertChannelForm } from '@/components/Alerts';

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useWebhooks: jest.fn(),
  },
}));

const Harness = () => {
  const { control } = useForm<{ channel: { webhookId: string } }>({
    defaultValues: { channel: { webhookId: '' } },
  });
  return <AlertChannelForm control={control} type="webhook" />;
};

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  jest.mocked(api.useWebhooks).mockReturnValue({
    data: { data: [] },
    refetch: jest.fn(),
  } as any);
});

describe('AlertChannelForm', () => {
  it('offers every webhook service as an alert destination', () => {
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );

    // A service missing from this list cannot be picked as an alert channel at
    // all, so the whole feature would be unreachable from the UI.
    expect(jest.mocked(api.useWebhooks).mock.calls[0][0]).toEqual(
      expect.arrayContaining(Object.values(WebhookService)),
    );
  });
});
