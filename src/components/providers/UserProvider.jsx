import React, { createContext, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { allerAuBonDomaine, apercuInitial } from '@/lib/vue';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const { data: user, isLoading } = useCurrentUser();
  // Le bon domaine dès la connexion, quelle que soit la page (12 nov. 2026) : un mandataire sur app.kpartners.immo.
  useEffect(() => {
    if (!user) return;
    // apercuInitial retire aussi le « ?vue= » laissé par un passage.
    const apercu = apercuInitial();
    allerAuBonDomaine(user, user.role === 'admin' ? apercu : user.role === 'mandataire' ? 'mandataire' : 'client', (...a) => base44.request(...a));
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-fond flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-menthe"></div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}