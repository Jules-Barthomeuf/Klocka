import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Building2, Brain, User } from "lucide-react";

const tabs = [
  { label: "Accueil", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projets", icon: Building2, page: "MesProjets" },
  { label: "KlockAI", icon: Brain, page: "KlockAI" },
  { label: "Profil", icon: User, page: "MonCompte" },
];

export default function BottomTabs() {
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#000000]/90 backdrop-blur-xl border-t border-[#1f2228]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ label, icon: Icon, page }) => {
          const url = createPageUrl(page);
          const isActive = location.pathname === url || location.pathname === url + "/";
          return (
            <Link
              key={page}
              to={url}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? "text-[#96c0b8]" : "text-[#f2f3f5]/30"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}