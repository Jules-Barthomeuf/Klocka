import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { CLASSE_TABLEAU, CLASSE_TABLE, CLASSE_TH, CLASSE_TD } from "@/components/mandataire/elements";
import { CLASSES_STATUT } from "@/lib/couleur-statut";
import { motType, adresseLisible } from "@/lib/vacance-signaux";
import { nomDeRue } from "@/components/outils/PanneauRue";

// La colonne de droite de K-Vacance (10 nov. 2026, Jules, version 5 de la planche) : à côté de la carte, les chiffres
// en tête (le rayon, la rue de l'adresse, les signaux récents), puis les locaux en tableaux groupés. Seul le titre du
// groupe porte la couleur (« pas de lignes de gauche colorées, juste le titre du tableau ») ; le tableau est celui
// des Acquéreurs (`CLASSE_TABLE`). Les règles du taux restent côté serveur (server/outils/vacance-taux.js).

const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const metres = (m) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const mois = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "");
const DOUZE_MOIS = 365 * 86400000;
// Une rue se compare sans accents, sans casse ni article : « Rue de la République » = « RUE DE LA REPUBLIQUE ».
const cleVoie = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\b(DE|DU|DES|LA|LE|LES|L|D)\b/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();
const couleurSignal = (t) => (["liquidation", "redressement"].includes(t) ? "corail" : ["sauvegarde", "dissolution", "transfert_siege"].includes(t) ? "ambre" : "gris");

/** Un groupe : son titre en couleur (chevron, nom, compte), puis son tableau ; replié, le titre seul. */
function Groupe({ titre, nombre, couleur, ouvert, onBascule, note, children }) {
  const Chevron = ouvert ? ChevronDown : ChevronRight;
  return (
    <section className="mt-5 first:mt-0">
      <button type="button" onClick={onBascule} aria-expanded={ouvert} className={`mb-2 flex items-center gap-1.5 text-[15px] ${couleur}`} style={{ background: "transparent" }}>
        <Chevron className="h-4 w-4" strokeWidth={1.8} />
        {titre}
        <span className="ml-1 text-[12.5px] tabular-nums text-ardoise">{nombre}</span>
        {note && <span className="ml-2 text-[12.5px] text-brume">{note}</span>}
      </button>
      {ouvert && <div className={CLASSE_TABLEAU}>{children}</div>}
    </section>
  );
}

function Tableau({ colonnes, largeurs, children }) {
  return (
    <table className={CLASSE_TABLE}>
      <colgroup>{largeurs.map((l, i) => <col key={i} style={l ? { width: l } : undefined} />)}</colgroup>
      <thead><tr>{colonnes.map((c) => <th key={c} className={CLASSE_TH}>{c}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const PREMIERES = 20;
/** Les vingt premières lignes d'une liste, et de quoi voir le reste. */
function Lignes({ liste, ligne, colonnes }) {
  const [toutes, setToutes] = useState(false);
  const vues = toutes ? liste : liste.slice(0, PREMIERES);
  return (
    <>
      {vues.map(ligne)}
      {liste.length > PREMIERES && (
        <tr><td colSpan={colonnes} className="h-[36px] px-2.5 text-left">
          <button type="button" onClick={() => setToutes((v) => !v)} className="text-[13.5px] text-menthe hover:text-menthe-survol" style={{ background: "transparent" }}>
            {toutes ? "Voir moins" : `Voir les ${liste.length - PREMIERES} autres`}
          </button>
        </td></tr>
      )}
    </>
  );
}

const Pastille = ({ couleur, children }) => <span className={`inline-block max-w-full truncate rounded-[6px] px-2 py-0.5 text-[12.5px] ${CLASSES_STATUT[couleur]}`}>{children}</span>;

export default function ColonneZone({ taux, tauxAttente, tauxErreur, adresse, locaux, choisi, survol, onSurvol, onOuvrir, onLocal, onRue }) {
  const [ouverts, setOuverts] = useState({ vacants: true, incertains: false, recents: true, anciens: false, rues: true });
  const basculer = (k) => setOuverts((o) => ({ ...o, [k]: !o[k] }));

  const t = taux?.taux || null;
  const vacants = useMemo(() => (taux?.locaux || []).filter((l) => l.etat === "vacant"), [taux]);
  const incertains = useMemo(() => (taux?.locaux || []).filter((l) => l.etat === "incertain"), [taux]);
  const [recents, anciens] = useMemo(() => {
    const limite = Date.now() - DOUZE_MOIS;
    const r = []; const a = [];
    for (const l of locaux) (Date.parse(l.signal_principal?.date) >= limite ? r : a).push(l);
    return [r, a];
  }, [locaux]);
  // La rue de l'adresse, lue dans le classement des rues du rayon.
  const rueIci = useMemo(() => {
    const cle = cleVoie(adresse?.street || String(adresse?.label || "").replace(/\s+\d{5}.*$/, "").replace(/^\d+\s*(bis|ter|[bt])?\s+/i, ""));
    return cle ? (taux?.rues || []).find((r) => cleVoie(r.voie) === cle) || null : null;
  }, [taux, adresse]);

  const ligneSignal = (l) => (
    <tr key={l.cle} onClick={() => onOuvrir(l)} onMouseEnter={() => onSurvol(l.cle)} onMouseLeave={() => onSurvol(null)}
      className={`cursor-pointer transition-colors ${choisi?.cle === l.cle ? "bg-rail-actif" : survol === l.cle ? "bg-relief" : "hover:bg-relief"}`}>
      <td className={CLASSE_TD} title={l.enseigne || l.denomination}>{l.enseigne || l.denomination || "Établissement"}</td>
      <td className={CLASSE_TD} title={adresseLisible(l.adresse)}>{adresseLisible(l.adresse) || "—"}</td>
      <td className={CLASSE_TD}><Pastille couleur={couleurSignal(l.signal_principal?.type)}>{motType(l.signal_principal?.type)}</Pastille></td>
      <td className={`${CLASSE_TD} tabular-nums`}>{jour(l.signal_principal?.date)}</td>
      <td className={`${CLASSE_TD} tabular-nums`}>{metres(l.distance_m)}</td>
    </tr>
  );
  const ligneLocal = (l) => (
    <tr key={l.cle} onClick={() => onLocal(l)} className="cursor-pointer transition-colors hover:bg-relief" title={l.raison}>
      <td className={CLASSE_TD}>{adresseLisible(l.adresse) || l.adresse}</td>
      <td className={CLASSE_TD} title={l.dernier?.nom}>{l.dernier?.nom || "—"}</td>
      <td className={`${CLASSE_TD} tabular-nums`}>{mois(l.dernier?.ferme_le)}</td>
      <td className={CLASSE_TD}>{l.etat === "incertain" ? <Pastille couleur="gris">À vérifier</Pastille> : <Pastille couleur={l.confiance === "forte" ? "menthe" : "ambre"}>{l.confiance === "forte" ? "Confirmé" : "Probable"}</Pastille>}</td>
      <td className={`${CLASSE_TD} tabular-nums`}>{metres(l.distance_m)}</td>
    </tr>
  );
  const colonnesSignal = ["Établissement", "Adresse", "Signal", "Date", "Dist."];
  const largeursSignal = [null, null, "26%", "100px", "64px"];
  const colonnesLocal = ["Adresse", "Dernier occupant", "Fermé", "État", "Dist."];
  const largeursLocal = [null, null, "100px", "100px", "64px"];

  return (
    <div className="px-5 py-4 md:px-6">
      {/* Les chiffres en tête : le rayon, la rue de l'adresse, les signaux récents. */}
      {tauxErreur ? (
        <p className="m-0 rounded-[12px] border border-trait bg-rail px-4 py-3 text-[13.5px] text-alerte">{tauxErreur}</p>
      ) : !t ? (
        <p className="m-0 flex items-start gap-2 rounded-[12px] border border-trait bg-rail px-4 py-3 text-[13.5px] text-ardoise">
          {tauxAttente && <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-none animate-spin text-menthe" />}
          Taux de vacance : recensement des locaux de la commune, puis vérification sur Google Maps et OpenStreetMap. La première fois, une à deux minutes.
        </p>
      ) : (
        <div className="grid grid-cols-3 rounded-[12px] border border-trait bg-rail max-sm:grid-cols-1">
          <div className="px-4 py-3">
            <p className="m-0 text-[24px] tabular-nums tracking-[-0.01em] text-encre">{t.fiable ? pct(t.taux) : "—"}</p>
            <p className="m-0 text-[12.5px] text-ardoise">Dans le rayon · {t.vacants} vacants sur {t.tranches}</p>
          </div>
          <div className="border-l border-trait px-4 py-3 max-sm:border-l-0 max-sm:border-t">
            <p className="m-0 text-[24px] tabular-nums tracking-[-0.01em] text-encre">{rueIci?.fiable ? pct(rueIci.taux) : "—"}</p>
            <p className="m-0 truncate text-[12.5px] text-ardoise" title={rueIci ? nomDeRue(rueIci.voie) : undefined}>{rueIci ? `${nomDeRue(rueIci.voie)} · ${rueIci.vacants} sur ${rueIci.tranches}` : "Rue de l'adresse : trop peu de locaux"}</p>
          </div>
          <div className="border-l border-trait px-4 py-3 max-sm:border-l-0 max-sm:border-t">
            <p className="m-0 text-[24px] tabular-nums tracking-[-0.01em] text-encre">{recents.length}</p>
            <p className="m-0 text-[12.5px] text-ardoise">Signaux de moins de 12 mois</p>
          </div>
          {!t.fiable && <p className="col-span-3 m-0 border-t border-trait px-4 py-2 text-[12.5px] text-ambre max-sm:col-span-1">Moins de dix locaux tranchés : élargissez le rayon pour un pourcentage qui ait du sens.</p>}
        </div>
      )}

      <div className="mt-5">
        {t && (
          <Groupe titre="Vacants" nombre={vacants.length} couleur="text-ambre" ouvert={ouverts.vacants && vacants.length > 0} onBascule={() => basculer("vacants")}>
            <Tableau colonnes={colonnesLocal} largeurs={largeursLocal}><Lignes liste={vacants} ligne={ligneLocal} colonnes={colonnesLocal.length} /></Tableau>
          </Groupe>
        )}
        {t && incertains.length > 0 && (
          <Groupe titre="Incertains" nombre={incertains.length} couleur="text-craie" ouvert={ouverts.incertains} onBascule={() => basculer("incertains")} note="les sources se contredisent">
            <Tableau colonnes={colonnesLocal} largeurs={largeursLocal}><Lignes liste={incertains} ligne={ligneLocal} colonnes={colonnesLocal.length} /></Tableau>
          </Groupe>
        )}
        <Groupe titre="Signaux récents" nombre={recents.length} couleur="text-menthe" ouvert={ouverts.recents && recents.length > 0} onBascule={() => basculer("recents")}>
          <Tableau colonnes={colonnesSignal} largeurs={largeursSignal}><Lignes liste={recents} ligne={ligneSignal} colonnes={colonnesSignal.length} /></Tableau>
        </Groupe>
        <Groupe titre="Signaux anciens" nombre={anciens.length} couleur="text-ardoise" ouvert={ouverts.anciens && anciens.length > 0} onBascule={() => basculer("anciens")}>
          <Tableau colonnes={colonnesSignal} largeurs={largeursSignal}><Lignes liste={anciens} ligne={ligneSignal} colonnes={colonnesSignal.length} /></Tableau>
        </Groupe>
        {t && taux.rues?.length > 0 && (
          <Groupe titre="Rues du rayon" nombre={taux.rues.length} couleur="text-encre" ouvert={ouverts.rues} onBascule={() => basculer("rues")} note="un clic mesure la rue entière">
            <Tableau colonnes={["Rue", "Taux", "Vacants / tranchés"]} largeurs={[null, "84px", "140px"]}>
              {taux.rues.map((r) => (
                <tr key={r.voie} onClick={() => onRue(r.voie)} className="cursor-pointer transition-colors hover:bg-relief" title={r.incertains ? `${r.incertains} incertain${r.incertains > 1 ? "s" : ""}, à part` : undefined}>
                  <td className={CLASSE_TD}>{nomDeRue(r.voie)}</td>
                  <td className={`${CLASSE_TD} tabular-nums ${r.fiable ? "" : "text-brume"}`}>{r.fiable ? pct(r.taux) : "—"}</td>
                  <td className={`${CLASSE_TD} tabular-nums`}>{r.vacants} / {r.tranches}</td>
                </tr>
              ))}
            </Tableau>
          </Groupe>
        )}
      </div>

      {/* Ce que valent les chiffres (contrôle du 19 oct. 2026, docs/validation/k-vacance.md ; méthode de vacance-taux.js). */}
      <p className="m-0 mt-5 text-[11.5px] leading-[1.55] text-brume">
        {t && `Méthode ${taux.parametres.version} : un local par adresse où un commerce est ouvert, ou a fermé depuis ${taux.parametres.annees_historique} ans (SIRENE) ; vacant si plus personne n'y est ouvert, vérifié sur Google Maps et OpenStreetMap. `}
        Une radiation est suivie d'une fermeture au registre dans 91 % des cas ; une liquidation ou un redressement de plus de six mois n'a libéré le local que dans 44 % des cas. Un signal dit où regarder, pas ce qui va se libérer.
      </p>
    </div>
  );
}
