import { QueryCache, QueryClient, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const queryClient: QueryClient = new QueryClient({
  // An expired admin session on any admin query sends the user back to the login screen.
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (err instanceof ApiError && err.status === 401 && query.queryKey[0] === 'admin' && query.queryKey[1] !== 'me') {
        queryClient.setQueryData(keys.me, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const keys = {
  services: ['services'] as const,
  doctors: ['doctors'] as const,
  me: ['admin', 'me'] as const,
  admin: ['admin'] as const,
};

export const useServices = () => useQuery({ queryKey: keys.services, queryFn: api.services, staleTime: 5 * 60_000 });
export const useDoctors = () => useQuery({ queryKey: keys.doctors, queryFn: api.doctors, staleTime: 5 * 60_000 });

export function useAdminSession() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.admin.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
