import React from 'react';
import { base44 } from '@/api/base44Client';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050807]">
      <div className="max-w-md w-full px-8 py-12 text-center">
        {/* Logo */}
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
          alt="Klocka"
          className="h-8 w-auto object-contain mx-auto mb-12"
        />

        {/* Icône horloge/attente */}
        <div className="w-16 h-16 rounded-full bg-[#33d6c0]/10 border border-[#33d6c0]/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#33d6c0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-light text-white mb-3 tracking-tight">
          Compte en attente d'activation
        </h1>
        <p className="text-white/40 text-sm leading-relaxed mb-8">
          Votre compte a bien été créé. Un conseiller Klocka va activer votre accès très prochainement. Vous recevrez une notification par email.
        </p>

        <div className="w-full h-px bg-white/[0.06] mb-8" />

        <p className="text-white/20 text-xs mb-4">
          Connecté avec un autre compte ?
        </p>
        <button
          onClick={() => base44.auth.logout(window.location.origin)}
          className="text-[#33d6c0] text-sm hover:text-[#33d6c0]/80 transition-colors underline underline-offset-4"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;