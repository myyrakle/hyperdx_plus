import type { ProfilingConnection } from '@hyperdx/common-utils/dist/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hdxServer } from '@/api';

export type ProfilingConnectionInput = Omit<
  ProfilingConnection,
  'id' | 'hasSecret'
> & { secret?: string };

export function getProfilingConnectionFormState(
  input: ProfilingConnectionInput,
  connection?: ProfilingConnection,
) {
  const canReuseSecret =
    connection?.hasSecret === true && connection.authType === input.authType;
  const requiresSecret = input.authType !== 'none' && !canReuseSecret;
  const hasRequiredUsername =
    input.authType !== 'basic' || Boolean(input.username?.trim());
  const hasRequiredSecret = !requiresSecret || Boolean(input.secret);
  const canTest =
    Boolean(input.endpoint.trim()) && hasRequiredUsername && hasRequiredSecret;

  return {
    canReuseSecret,
    requiresSecret,
    canTest,
    canSubmit: Boolean(input.name.trim()) && canTest,
  };
}

export function useProfilingConnections() {
  return useQuery<ProfilingConnection[]>({
    queryKey: ['profiling-connections'],
    queryFn: () => hdxServer('profiling-connections').json(),
  });
}

export function useSaveProfilingConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: ProfilingConnectionInput;
    }) =>
      hdxServer(id ? `profiling-connections/${id}` : 'profiling-connections', {
        method: id ? 'PUT' : 'POST',
        json: input,
      }).json<ProfilingConnection>(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['profiling-connections'] }),
  });
}

export function useTestProfilingConnection() {
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id?: string;
      input: ProfilingConnectionInput;
    }) =>
      hdxServer('profiling-connections/test', {
        method: 'POST',
        json: {
          connectionId: id,
          endpoint: input.endpoint,
          tenantId: input.tenantId,
          authType: input.authType,
          username: input.username,
          secret: input.secret,
        },
      }).json<{ success: true }>(),
  });
}

export function useDeleteProfilingConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      hdxServer(`profiling-connections/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['profiling-connections'] }),
  });
}
