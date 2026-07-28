import type { profiling as englishProfiling } from '@/i18n/locales/en/profiling';
import type { DeepPartial } from '@/i18n/types';

export const profiling = {
  page: {
    browserTitle: '연속 프로파일링 - {{brandName}}',
    title: '연속 프로파일링',
    emptyTitle: '프로파일링 연결이 구성되지 않았습니다',
    emptyDescription:
      'Pyroscope 저장소를 연결하면 HyperDX 세션에서 연속 프로파일을 조회할 수 있습니다.',
    configureConnection: '프로파일링 연결 구성',
    frameTitle: 'Pyroscope - {{name}}',
  },
} satisfies DeepPartial<typeof englishProfiling>;
