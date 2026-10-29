import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, LocateFixed, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import { FichePoint } from "@/components/mandataire/TableauListe";
import { JL } from "@/design/jetons";
import { passeAujourdhui } from "@/lib/terrain";

// Le mode terrain (25 oct. 2026, Jules) : la carte en plein écran, les commerces de toutes ses listes (ou d'une seule),
// la position du mandataire qui le suit ; un point touché ouvre la fiche du commerce au centre de l'écran. Une croix
// en haut à gauche referme. Les commerces où il est déjà passé aujourd'hui sont grisés.

const SORTIES = ["rdv_pris", "mandat_signe", "pas_vendeur"];
const aVoir = (l) => (l.fiches || []).filter((p) => p.position && !SORTIES.includes(p.statut)).length;

/**
 * Le choix de la liste montrée (25 oct. 2026, Jules : « le bon design ») : une pilule comme la croix et le recentrage,
 * qui ouvre un menu de l'application (pas le menu du système) : « Toutes mes listes » puis chaque liste, avec le nombre
 * de commerces à voir sur la carte, la liste choisie cochée en menthe.
 */
function ChoixListe({ listes, valeur, onChoisir }) {
  const [ouvert, setOuvert] = useState(false);
  const courante = listes.find((l) => l.id === valeur);
  const lignes = [{ id: "toutes", nom: "Toutes mes listes", n: listes.reduce((t, l) => t + aVoir(l), 0) }, ...listes.map((l) => ({ id: l.id, nom: l.nom, n: aVoir(l) }))];
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert} aria-label="Liste montrée"
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-full border border-bord-doux bg-rail pl-4 pr-3 text-[14px] text-encre shadow-[0_4px_14px_rgb(0_0_0/0.18)]">
        <span className="truncate">{courante ? courante.nom : "Toutes mes listes"}</span>
        <ChevronDown className={`h-4 w-4 flex-none text-ardoise transition-transform duration-300 ${ouvert ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {ouvert && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
            <motion.ul role="listbox" aria-label="Listes"
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute left-0 top-full z-20 m-0 mt-2 max-h-[60vh] w-[280px] max-w-[calc(100vw-1.5rem)] origin-top-left list-none overflow-y-auto rounded-[16px] border border-bord-doux bg-rail p-1.5 shadow-[0_20px_50px_rgb(0_0_0/0.28)]">
              {lignes.map((l) => {
                const sel = l.id === valeur;
                return (
                  <li key={l.id}>
                    <button type="button" role="option" aria-selected={sel} onClick={() => { onChoisir(l.id); setOuvert(false); }}
                      className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-encre/[0.05] ${sel ? "text-encre" : "text-craie"}`} style={{ background: "transparent" }}>
                      <span className="min-w-0 flex-1 truncate text-[14px]">{l.nom}</span>
                      <span className="flex-none text-[12.5px] tabular-nums text-brume">{l.n}</span>
                      <Check className={`h-4 w-4 flex-none text-menthe ${sel ? "" : "invisible"}`} />
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ModeTerrain({ listes = [], libelles = {}, onFermer }) {
  const [laquelle, setLaquelle] = useState("toutes");
  const [moi, setMoi] = useState(null);
  const [suivre, setSuivre] = useState(true);
  const [choisi, setChoisi] = useState(null);

  // La position suivie dès l'ouverture, arrêtée en refermant.
  useEffect(() => {
    if (!navigator.geolocation) { toast.error("La localisation n'est pas disponible sur cet appareil."); return undefined; }
    const id = navigator.geolocation.watchPosition(
      (p) => setMoi({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => toast.error(e?.code === 1 ? "Autorisez la localisation dans le navigateur pour vous voir sur la carte." : "Position introuvable pour l'instant."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  // Centrée une fois sur la position, puis la carte laisse la main (le bouton la recentre).
  useEffect(() => { if (suivre && moi) { const t = setTimeout(() => setSuivre(false), 0); return () => clearTimeout(t); } return undefined; }, [suivre, moi]);
  // Échap referme la fiche, puis la carte.
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { if (choisi) setChoisi(null); else onFermer?.(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [choisi, onFermer]);

  const fiches = useMemo(() => listes
    .filter((l) => laquelle === "toutes" || l.id === laquelle)
    .flatMap((l) => (l.fiches || []).map((p) => ({ ...p, liste_nom: l.nom })))
    .filter((p) => p.position && !SORTIES.includes(p.statut)), [listes, laquelle]);
  const jour = new Date().toISOString().slice(0, 10);
  const marqueurs = useMemo(() => fiches.map((p) => ({
    id: p.id, lat: p.position.lat, lon: p.position.lon,
    titre: [p.commerce || p.nom, libelles[p.statut] || null].filter(Boolean).join(" · "),
    couleur: passeAujourdhui(p, jour) ? JL.brume : JL.menthe,
  })), [fiches, libelles, jour]);
  const fiche = fiches.find((p) => p.id === choisi) || null;

  return createPortal(
    <motion.div className="fixed inset-0 z-[90] bg-fond" role="dialog" aria-label="Mode terrain"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
      <CarteGoogleSecteurs secteurs={[]} marqueurs={marqueurs} marqueurActif={choisi} onMarqueur={setChoisi} moi={moi} suivreMoi={suivre} />

      {/* En haut : la croix, la liste montrée (toutes par défaut), le recentrage. */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-center gap-2" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <button type="button" onClick={onFermer} aria-label="Fermer le mode terrain" title="Fermer"
          className="grid h-10 w-10 flex-none place-items-center rounded-full border border-bord-doux bg-rail text-ardoise shadow-[0_4px_14px_rgb(0_0_0/0.18)] hover:text-encre">
          <X className="h-4 w-4" />
        </button>
        <ChoixListe listes={listes} valeur={laquelle} onChoisir={setLaquelle} />
        <span className="flex-1" />
        <button type="button" onClick={() => setSuivre(true)} aria-label="Me recentrer" title="Me recentrer"
          className={`grid h-10 w-10 flex-none place-items-center rounded-full border bg-rail shadow-[0_4px_14px_rgb(0_0_0/0.18)] ${moi ? "border-pervenche text-pervenche" : "border-bord-doux text-craie"}`}>
          <LocateFixed className="h-[18px] w-[18px]" />
        </button>
      </div>
      {!fiches.length && (
        <p className="absolute inset-x-3 bottom-6 z-10 m-0 rounded-[16px] border border-bord-doux bg-rail px-4 py-3 text-center text-[13.5px] text-ardoise">Aucun commerce avec une position dans {laquelle === "toutes" ? "vos listes" : "cette liste"}.</p>
      )}

      {/* La fiche du commerce touché, au centre de l'écran, sur ordinateur comme au téléphone. */}
      <AnimatePresence>{fiche && <FichePoint key={fiche.id} fiche={fiche} centre onFermer={() => setChoisi(null)} />}</AnimatePresence>
    </motion.div>,
    document.body,
  );
}
