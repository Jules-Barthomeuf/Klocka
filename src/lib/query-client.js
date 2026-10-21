import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Pas de staleTime global (21 oct. 2026) : trente requêtes partent d'un initialData ([]), qu'un staleTime
			// rendrait « frais » ; elles ne chargeraient plus (l'éditeur de projet ne s'ouvrait plus par ?id=).
		},
	},
});