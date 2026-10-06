import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Building2, MapPin, User, Folder, CircleUser } from "lucide-react";

const TABS_CLIENT = [
  { label: "Accueil", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projets", icon: Building2, page: "MesProjets" },
  { label: "Profil", icon: User, page: "MonCompte" },
];
// Le mandataire : ses trois pages de tous les jours, et Compte, la page que
// sa barre latérale ouvre (pas « Mon compte », qui est celle du client). Le
// reste est dans le menu du haut.
const TABS_MANDATAIRE = [
  { label: "Accueil", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Prospection", icon: MapPin, page: "MandataireProspection" },
  { label: "Dossiers", icon: Folder, page: "MandataireDossier" },
  { label: "Compte", icon: CircleUser, page: "Personnalisation" },
];

export default function BottomTabs({ vue = "client" }) {
  const tabs = vue === "mandataire" ? TABS_MANDATAIRE : TABS_CLIENT;
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-fond/90 backdrop-blur-xl border-t border-trait"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ label, icon: Icon, page }) => {
          const url = createPageUrl(page);
          const ici = location.pathname.toLowerCase();
          const isActive = ici === url.toLowerCase() || ici === url.toLowerCase() + "/";
          return (
            <Link
              key={page}
              to={url}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? "text-menthe" : "text-ardoise"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}