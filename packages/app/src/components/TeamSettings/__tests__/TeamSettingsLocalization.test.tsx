import { act, screen } from '@testing-library/react';

import ProfilingConnectionsSection from '@/components/TeamSettings/ProfilingConnectionsSection';
import i18n from '@/i18n';
import { restoreKoreanCatalog, setKoreanFixture } from '@/i18n/testing';
import { useProfilingConnections } from '@/profilingConnection';

jest.mock('@/profilingConnection', () => ({
  getProfilingConnectionFormState: jest.fn(),
  useDeleteProfilingConnection: jest.fn(),
  useProfilingConnections: jest.fn(),
  useSaveProfilingConnection: jest.fn(),
  useTestProfilingConnection: jest.fn(),
}));

const asMock = (fn: unknown) => fn as jest.Mock;

describe('team settings localization boundaries', () => {
  beforeEach(() => {
    asMock(useProfilingConnections).mockReturnValue({ data: [] });
  });

  afterEach(async () => {
    restoreKoreanCatalog('settings');
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('renders English settings copy by default', () => {
    renderWithMantine(<ProfilingConnectionsSection />);

    expect(screen.getByText('Profiling Connections')).toBeInTheDocument();
    expect(screen.getByText('Add Profiling Connection')).toBeInTheDocument();
  });

  it('translates settings copy from the catalog while falling back to English', async () => {
    setKoreanFixture('settings', {
      'sections.profilingConnections': '프로파일링 연결',
    });
    await act(async () => {
      await i18n.changeLanguage('ko');
    });

    renderWithMantine(<ProfilingConnectionsSection />);

    // Reviewed Korean entry is consumed from the catalog.
    expect(screen.getByText('프로파일링 연결')).toBeInTheDocument();

    // Untranslated entries fall back to English rather than showing a key.
    expect(screen.getByText('Add Profiling Connection')).toBeInTheDocument();
  });
});
