import {
  AlertSource,
  AlertThresholdType,
  WebhookService,
} from '@hyperdx/common-utils/dist/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { DBSearchPageAlertModal } from '@/DBSearchPageAlertModal';

// --- Mutation spies ------------------------------------------------------
const createAlertMutateAsync = jest.fn().mockResolvedValue({ data: {} });
const updateAlertMutateAsync = jest.fn().mockResolvedValue({ data: {} });
const deleteAlertMutateAsync = jest.fn().mockResolvedValue(undefined);

// Two alerts so the test can edit the second tab and confirm the PUT targets
// the right id.
const makeAlert = (id: string) => ({
  id,
  interval: '1m' as const,
  threshold: 1,
  thresholdType: AlertThresholdType.ABOVE,
  source: AlertSource.SAVED_SEARCH,
  savedSearchId: 'saved-search-id',
  channel: { type: 'webhook' as const, webhookId: 'webhook-id' },
  note: null,
  // Match the persisted alert shape (both stored as null), which the form
  // schema must accept.
  numConsecutiveWindows: null,
  scheduleStartAt: null,
});

const firstAlert = makeAlert('6a5163af632ecadec80ec00e');
const secondAlert = makeAlert('aaaa1111bbbb2222cccc3333');

// Reassigned per test to vary the service of the alert's destination webhook.
let webhooks: Array<{ _id: string; service: WebhookService }> = [];

const savedSearch = {
  _id: 'saved-search-id',
  name: 'My Search',
  where: 'level:error',
  whereLanguage: 'lucene',
  select: '',
  source: 'source-id',
  orderBy: '',
  tags: [],
  alerts: [firstAlert, secondAlert],
};

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useCreateAlert: () => ({
      mutateAsync: createAlertMutateAsync,
      isPending: false,
    }),
    useUpdateAlert: () => ({
      mutateAsync: updateAlertMutateAsync,
      isPending: false,
    }),
    useDeleteAlert: () => ({
      mutateAsync: deleteAlertMutateAsync,
      isPending: false,
    }),
    useAlert: (id?: string) => ({
      data: {
        data: [firstAlert, secondAlert].find(a => a.id === id) ?? firstAlert,
      },
    }),
    useWebhooks: () => ({ data: { data: webhooks }, refetch: jest.fn() }),
  },
}));

jest.mock('@/savedSearch', () => ({
  __esModule: true,
  useSavedSearch: () => ({ data: savedSearch, isLoading: false }),
  useCreateSavedSearch: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/source', () => ({
  __esModule: true,
  useSource: () => ({ data: undefined }),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  __esModule: true,
  useBrandDisplayName: () => 'HyperDX',
}));

// Heavy / visual child components are stubbed so the form still renders and
// its submit handler runs. The alert channel form must register the
// `channel.type` field so form validation passes.
jest.mock('@/components/alerts/AlertHistoryCards', () => ({
  __esModule: true,
  AlertHistoryCardList: () => <div data-testid="alert-history" />,
}));
jest.mock('@/components/alerts/AckAlert', () => ({
  __esModule: true,
  AckAlert: () => <div data-testid="ack-alert" />,
}));
jest.mock('@/components/AlertPreviewChart', () => ({
  __esModule: true,
  AlertPreviewChart: () => <div data-testid="alert-preview-chart" />,
}));
jest.mock('@/components/Alerts', () => ({
  __esModule: true,
  AlertChannelForm: () => <div data-testid="alert-channel-form" />,
}));
jest.mock('@/components/SQLEditor/SQLInlineEditor', () => ({
  __esModule: true,
  SQLInlineEditorControlled: () => <div data-testid="sql-inline-editor" />,
}));

const renderModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithMantine(
    <QueryClientProvider client={queryClient}>
      <DBSearchPageAlertModal id="saved-search-id" open onClose={jest.fn()} />
    </QueryClientProvider>,
  );
};

describe('DBSearchPageAlertModal', () => {
  beforeEach(() => {
    createAlertMutateAsync.mockClear();
    updateAlertMutateAsync.mockClear();
    deleteAlertMutateAsync.mockClear();
    webhooks = [];
  });

  describe('display fields input', () => {
    const sqlEditorCount = () =>
      screen.queryAllByTestId('sql-inline-editor').length;

    /**
     * The modal opens on the "New Alert" tab, which has no destination yet.
     * Select an existing alert so its webhook decides what the form shows.
     */
    const openExistingAlert = async () => {
      renderModal();
      fireEvent.click(await screen.findByRole('tab', { name: /Alert 1/ }));
    };

    it('is offered when the alert goes to a Slack (Advanced) webhook', async () => {
      webhooks = [{ _id: 'webhook-id', service: WebhookService.SlackAdvanced }];

      await openExistingAlert();

      // The group-by editor plus the display-fields editor.
      await waitFor(() => expect(sqlEditorCount()).toBe(2));
    });

    it('is hidden for services that ignore display fields', async () => {
      webhooks = [{ _id: 'webhook-id', service: WebhookService.Slack }];

      await openExistingAlert();

      expect(sqlEditorCount()).toBe(1);
    });

    it('is hidden while the webhook list is still empty', async () => {
      await openExistingAlert();

      expect(sqlEditorCount()).toBe(1);
    });

    it('is hidden on the new-alert tab, which has no destination yet', () => {
      webhooks = [{ _id: 'webhook-id', service: WebhookService.SlackAdvanced }];

      renderModal();

      expect(sqlEditorCount()).toBe(1);
    });
  });

  it('dispatches an update (PUT) with the id resolved from the selected alert tab', async () => {
    renderModal();

    // Modal opens on the "New Alert" tab; select the second existing alert so
    // it renders in edit mode. Using the second (not first) tab confirms the
    // update id is resolved by tab index.
    const alertTab = await screen.findByRole('tab', { name: /Alert 2/ });
    fireEvent.click(alertTab);

    const saveButton = await screen.findByText('Save Alert');
    fireEvent.click(saveButton.closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(updateAlertMutateAsync).toHaveBeenCalledTimes(1);
    });

    // The id must come from the selected alert so the PUT targets it.
    expect(updateAlertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: secondAlert.id,
        source: AlertSource.SAVED_SEARCH,
        savedSearchId: 'saved-search-id',
      }),
    );
    expect(createAlertMutateAsync).not.toHaveBeenCalled();
  });
});
