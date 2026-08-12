const send = jest.fn().mockResolvedValue({ text: 'ok' });

jest.mock('@slack/webhook', () => ({
  IncomingWebhook: jest.fn().mockImplementation(() => ({ send })),
}));

// jest.setup.ts replaces postMessageToWebhook with a spy for every suite, so
// reach for the real implementation here.
const { postMessageToWebhook } =
  jest.requireActual<typeof import('@/utils/slack')>('@/utils/slack');

const URL = 'https://hooks.slack.com/services/T0/B0/XXXX';

beforeEach(() => {
  send.mockClear();
});

describe('postMessageToWebhook', () => {
  it('forwards the fallback text', async () => {
    await postMessageToWebhook(URL, { text: 'hello' });

    expect(send.mock.calls[0][0]).toMatchObject({ text: 'hello' });
  });

  it('forwards top-level blocks', async () => {
    const blocks = [
      {
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: 'x' },
      },
    ];

    await postMessageToWebhook(URL, { blocks });

    expect(send.mock.calls[0][0].blocks).toEqual(blocks);
  });

  it('forwards attachments, which carry the coloured state bar', async () => {
    // Slack only draws the left colour bar on attachments. Dropping them here
    // would silently strip the alert/resolved colour from every message.
    const attachments = [
      {
        color: 'danger',
        blocks: [
          {
            type: 'section' as const,
            text: { type: 'mrkdwn' as const, text: 'x' },
          },
        ],
      },
    ];

    await postMessageToWebhook(URL, { text: 't', attachments });

    expect(send.mock.calls[0][0].attachments).toEqual(attachments);
  });
});
