import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Revenir sur une page déjà vue ne relance pas toutes ses requêtes pendant 15 s (21 oct. 2026, Jules :
			// « naviguer est super lent ») : les données en cache s'affichent, les mutations invalident ce qu'elles changent.
			staleTime: 15_000,
		},
	},
});