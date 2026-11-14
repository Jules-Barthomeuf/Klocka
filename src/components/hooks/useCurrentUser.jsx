import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export function useCurrentUser() {
  return useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    // Une page que Jules cache à un collègue quitte sa barre dans la minute, sans qu'il recharge (14 nov. 2026).
    refetchInterval: 60000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: false,
    suspense: false
  });
}