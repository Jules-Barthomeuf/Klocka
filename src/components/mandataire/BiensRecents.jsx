import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, ChevronDown } from "lucide-react";
import { createPageUrl } from "@/utils";

// Sous « Biens » dans le menu du mandataire (25 oct. 2026, Jules) : les trois derniers biens ouverts, le plus récent
// en tête, pour y revenir d'un clic. Gardés dans le navigateur : c'est une commodité de cet appareil. Au dessin des
// « Projets récents » de l'équipe (DossiersRecents) : un titre « Biens récents » repliable, puis les biens.

const CLE = "klocka.biens.recents";
const EVENEMENT = "klocka:biens-recents";
const MAX = 3;

const lire = () => { try { const x = JSON.parse(localStorage.getItem(CLE) || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };

/** Retient un bien ouvert (sa clé « type:id » et son nom). */
export function retenirBien(cle, titre) {
  if (!cle || cle === "nouveau") return;
  try {
    const liste = [{ cle, titre: titre || "Bien" }, ...lire().filter((b) => b.cle !== cle)].slice(0, MAX);
    localStorage.setItem(CLE, JSON.stringify(liste));
  } catch { /* navigation privée */ }
  window.dispatchEvent(new Event(EVENEMENT));
}

export default function BiensRecents({ onNaviguer }) {
  const { search, pathname } = useLocation();
  const [liste, setListe] = useState(lire);
  useEffect(() => {
    const maj = () => setListe(lire());
    window.addEventListener(EVENEMENT, maj);
    window.addEventListener("storage", maj);
    return () => { window.removeEventListener(EVENEMENT, maj); window.removeEventListener("storage", maj); };
  }, []);
  const [ouvert, setOuvert] = useState(() => { try { return localStorage.getItem("klocka.biens.recents.ouvert") !== "0"; } catch { return true; } });
  if (!liste.length) return null;
  const base = createPageUrl("MandataireBiens");
  const actuel = pathname === base ? new URLSearchParams(search).get("bien") : null;
  const basculer = () => setOuvert((o) => { try { localStorage.setItem("klocka.biens.recents.ouvert", o ? "0" : "1"); } catch { /* navigation privée */ } return !o; });
  return (
    <div className="mb-1 mt-1">
      <button type="button" onClick={basculer} aria-expanded={ouvert}
        className="flex items-center gap-1.5 rounded-[10px] px-3 py-[5px] text-[13px] text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
        Biens récents<ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${ouvert ? "" : "-rotate-90"}`} />
      </button>
      {ouvert && (
        <div className="flex flex-col gap-0.5 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          {liste.map((b) => (
            <Link key={b.cle} to={`${base}?bien=${encodeURIComponent(b.cle)}`} onClick={onNaviguer} title={b.titre}
              className={`ml-4 flex items-center gap-2 rounded-[10px] px-3 py-[5px] transition-colors ${actuel === b.cle ? "bg-rail-actif text-encre" : "text-ardoise hover:bg-rail-actif hover:text-encre"}`}>
              <Building2 className="h-[14px] w-[14px] flex-none" strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{b.titre}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
