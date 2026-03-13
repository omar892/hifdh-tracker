import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetSession, useLogin, useLogout } from "@workspace/api-client-react";

export function useAuth() {
  const [, setLocation] = useLocation();
  const { data: session, isLoading, error, refetch } = useGetSession({
    query: {
      retry: false,
      staleTime: 5 * 60 * 1000,
    }
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/");
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/login");
      }
    }
  });

  const isAuthenticated = !!session?.authenticated;

  return {
    session,
    isAuthenticated,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}

export function useProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  return { isAuthenticated, isLoading };
}
