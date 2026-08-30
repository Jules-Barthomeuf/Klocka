import React from "react";
import { useUser } from "@/components/providers/UserProvider";
import { motion } from "framer-motion";
import PortailLinkCard from "@/components/admin/PortailLinkCard";

const PORTAIL_URL = `${window.location.origin}/Portail`;
const PORTAIL_2X_URL = `${window.location.origin}/Portail2Fois`;

export default function AdminPortail() {
  const user = useUser();

  if (user && user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <p className="text-[#f2f3f5]/30">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5]">
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6] mb-2">Administration</p>
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">Portail client</h1>
          <p className="text-[#f2f3f5]/30 text-sm mt-3">Partagez ces liens avec vos prospects pour leur permettre d'accepter les CGV et procéder au paiement.</p>
        </motion.div>

        <div className="space-y-5">
          <PortailLinkCard
            title="Portail 1 — paiement en une fois"
            subtitle="Accessible publiquement, sans authentification"
            url={PORTAIL_URL}
            delay={0.1}
          />
          <PortailLinkCard
            title="Portail 2 — paiement en deux fois"
            subtitle="Accessible publiquement, sans authentification"
            url={PORTAIL_2X_URL}
            delay={0.15}
          />
        </div>
      </div>
    </div>
  );
}