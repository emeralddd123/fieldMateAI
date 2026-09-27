import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCurrentSession,
  login as loginRequest,
  logout as logoutRequest,
  type AuthSession,
  type UserRole,
} from './api';

interface AuthContextValue {
  session: AuthSession | null;
  isPending: boolean;
  isError: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  logout: (all?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchCurrentSession,
    staleTime: 60_000,
    retry: false,
  });

  const value: AuthContextValue = {
    session: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    login: async (email, password) => {
      const session = await loginRequest(email, password);
      queryClient.setQueryData(['auth-session'], session);
      return session;
    },
    logout: async (all = false) => {
      await logoutRequest(all);
      queryClient.setQueryData(['auth-session'], null);
      queryClient.removeQueries({
        predicate: (item) => item.queryKey[0] !== 'auth-session',
      });
    },
    refresh: async () => {
      await query.refetch();
    },
    hasRole: (...roles) =>
      Boolean(
        query.data?.memberships.some((membership) =>
          roles.includes(membership.role),
        ),
      ),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
