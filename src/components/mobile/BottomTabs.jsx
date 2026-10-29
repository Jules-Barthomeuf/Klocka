import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Building2, MapPin, Folder, Menu, User } from "lucide-react";

// Au téléphone, plus de barre du haut (24 oct. 2026, Jules) : le menu prend la dernière place de la barre du bas. Chez
// le mandataire, à la place de Compte (Paramètres est dans le menu) ; le client garde Profil, absent de son menu.
const TABS_CLIENT = [
  { label: "Accueil", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projets", icon: Building2, page: "MesProjets" },
  { label: "Profil", icon: User, page: "MonCompte" },
];
// Le mandataire : ses trois pages de tous les jours, puis le menu (Paramètres
// et le reste y sont).
const TABS_MANDATAIRE = [
  { label: "Accueil", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Prospection", icon: MapPin, page: "MandataireProspection" },
  { label: "Biens", icon: Folder, page: "MandataireBiens" },
];

export default function BottomTabs({ vue = "client", onMenu = null, menuOuvert = false }) {
  const tabs = vue === "mandataire" ? TABS_MANDATAIRE : TABS_CLIENT;
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-transparent backdrop-blur-xl border-t border-trait"
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
        {onMenu && (
          <button type="button" onClick={onMenu} aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOuvert}
            className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${menuOuvert ? "text-menthe" : "text-ardoise"}`} style={{ background: "transparent" }}>
            <Menu className="w-5 h-5" />
            <span className="text-[11px] font-medium">Menu</span>
          </button>
        )}
      </div>
    </nav>
  );
}