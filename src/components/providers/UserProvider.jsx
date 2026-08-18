import React, { createContext, useContext } from 'react';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0c0c] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#35a79b]"></div>
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