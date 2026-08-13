import { screen } from '@testing-library/react';

const mockConfig = {
  IS_LOCAL_MODE: false,
  IS_CLOUD_BANNER_ENABLED: false,
};

jest.mock('@/config', () => mockConfig);

// Imported after the mock so the factory's `mockConfig` binding is initialized.
import { AppNavCloudBanner } from './AppNav.components';

describe('AppNavCloudBanner', () => {
  afterEach(() => {
    mockConfig.IS_CLOUD_BANNER_ENABLED = false;
  });

  it('renders nothing by default', () => {
    renderWithMantine(<AppNavCloudBanner />);

    expect(
      screen.queryByText('Ready to deploy on ClickHouse Cloud?'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the banner when the cloud banner flag is enabled', () => {
    mockConfig.IS_CLOUD_BANNER_ENABLED = true;

    renderWithMantine(<AppNavCloudBanner />);

    expect(
      screen.getByText('Ready to deploy on ClickHouse Cloud?'),
    ).toBeInTheDocument();
  });
});
