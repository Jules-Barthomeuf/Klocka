import React, { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Loader from "@/components/ui/Loader";
import FicheContact, { TEMPERATURES, TYPES_ACQUEREUR } from "@/components/mandataire/vente/FicheContact";
import { CLASSES_STATUT, couleurStatut } from "@/lib/couleur-statut";

// L'onglet Acquéreurs de la Mise en vente (7 nov. 2026, Jules) : les contacts du bien en un tableau, filtrés par
// température (Tous, Chauds, Tièdes, Froids, Sans suite), et la fiche du contact au clic,
// à droite. Le même tableau que Mes vendeurs ; la même lecture (et la même clé) que TableauAcquereurs.
// Le serveur : GET et POST /api/mandataire/marches/:id/acquereurs.

// Les colonnes du tableau : clé, titre, largeur (la prochaine action prend le reste).
const COLONNES = [["nom", "Nom", 220], ["type", "Type", 110], ["source", "Source", 120], ["statut", "Statut", 140], ["temperature", "Température", 120], ["score", "Score", 80], ["prochaine", "Prochaine action", null], ["echeance", "Échéance", 100], ["activite", "Dernière activité", 130]];
// La température en couleur de statut : chaud, il faut agir (ambre) ; tiède, une piste (lavande) ; froid, en cours (bleu) ;
// sans suite, perdu (corail).
const COULEUR_TEMPERATURE = { chaud: "ambre", tiede: "lavande", froid: "bleu", sans_suite: "corail" };
// Le statut d'un contact, une couleur un sens : en cours en bleu, l'offre en lavande, signé en menthe, écarté en corail.
const COULEUR_STATUT = { contact: "bleu", qualifie: "bleu", visite: "bleu", offre: "lavande", signe: "menthe", ecarte: "corail" };
const STATUTS_DEFAUT = { contact: "Nouveau contact", qualifie: "Qualifié", visite: "Visite", offre: "Offre", signe: "Signé", ecarte: "Écarté" };
const FILTRES = [["tous", "Tous"], ["chaud", "Chauds"], ["tiede", "Tièdes"], ["froid", "Froids"], ["sans_suite", "Sans suite"]];

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
/** La dernière activité : une date, ou un objet { le, texte | action }. */
const activite = (a) => {
  if (!a) return { le: null, texte: "" };
  if (typeof a === "string") return { le: a, texte: "" };
  return { le: a.le || null, texte: a.texte || a.action || "" };
};

// `visite` : l'id d'une visite demandée par l'adresse (la notification « Faire signer ») : la fiche de son visiteur s'ouvre.
export default function OngletAcquereurs({ marcheId, piste = null, onPiste = null, visite = null, proprietaireId = null }) {
  const cle = ["m-acquereurs", marcheId];
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/acquereurs`;
  const { data, isLoading, isError } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", url), enabled: !!marcheId });
  const [filtre, setFiltre] = useState("tous");
  // La fiche ouverte : celle que demande le parent (un geste de l'assistant), sinon celle qu'on touche.
  const [choisi, setChoisi] = useState(piste);
  useEffect(() => { setChoisi(piste); }, [piste]);
  // La fiche demandée par une visite ne s'ouvre qu'une fois : fermée, elle ne revient pas.
  const [visiteVue, setVisiteVue] = useState(false);
  const ouvrir = (id) => { setChoisi(id); setVisiteVue(true); onPiste?.(id); };

  if (isLoading) return <Loader titre="Vos contacts" />;
  if (isError || !data) return <p className="m-0 py-8 text-[14px] text-alerte">Les contacts ne se chargent pas.</p>;
  const tous = Array.isArray(data) ? data : data.lignes || data.acquereurs || [];
  const motStatut = Object.fromEntries((data.statuts || []).map((s) => [s.cle, s.mot]));
  const compte = (k) => (k === "tous" ? tous.length : tous.filter((l) => l.temperature === k).length);
  const lignes = (filtre === "tous" ? tous : tous.filter((l) => l.temperature === filtre))
    .slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const parVisite = visite && !choisi && !visiteVue ? tous.find((l) => l.visite?.id === visite) : null;
  const fiche = tous.find((l) => l.id === choisi) || parVisite || null;

  return (
    <section aria-label="Acquéreurs" className="relative">
      <div className="flex flex-wrap items-center gap-0.5">
        {FILTRES.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setFiltre(k)} aria-pressed={filtre === k}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] max-md:h-10 ${filtre === k ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}
            style={filtre === k ? undefined : { background: "transparent" }}>
            {mot}<span className="tabular-nums opacity-70">{compte(k)}</span>
          </button>
        ))}
        <span className="flex-1" />
      </div>
      {/* Plus d'« Ajouter un contact » (8 nov. 2026, Jules) : les contacts arrivent par les envois, l'assistant et les imports. */}

      {/* Le tableau du CRM (7 nov. 2026, Jules : « le tableau des acquéreurs au style de Twenty ») : cadre arrondi sans bande
          de couleur (8 nov. 2026, Jules), traits continus, en-têtes de 35 px, lignes de 36 px, texte en 14 px ; le nom ouvre la fiche, le
          statut et la température en cases colorées entières (src/lib/couleur-statut.js). */}
      <div className="mt-3 overflow-x-auto k-verre">
        <table className="w-full table-fixed border-collapse text-[13.5px] [&_tbody_tr:last-child_td]:border-b-0 [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0" style={{ minWidth: 1080 }}>
          <colgroup>
            {COLONNES.map(([k, , largeur]) => <col key={k} style={largeur ? { width: largeur } : undefined} />)}
          </colgroup>
          <thead>
            <tr className="text-[12.5px] text-ardoise">
              {COLONNES.map(([k, mot]) => (
                <th key={k} className={`h-[35px] overflow-hidden whitespace-nowrap border-b border-r border-trait px-2.5 font-normal ${k === "nom" ? "text-left" : "text-center"}`}>{mot}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const [motTemp] = TEMPERATURES[l.temperature] || [];
              const a = activite(l.derniere_activite || l.maj_le);
              const enRetard = l.prochaine_le && new Date(l.prochaine_le) < new Date(new Date().toDateString());
              const statut = motStatut[l.statut] || STATUTS_DEFAUT[l.statut] || l.statut || "";
              const td = "h-[36px] overflow-hidden border-b border-r border-trait px-2.5";
              return (
                <tr key={l.id} className={l.id === choisi ? "bg-relief" : "hover:bg-relief/60"}>
                  <td className={`${td} p-0`}>
                    <button type="button" onClick={() => ouvrir(l.id)} className="block w-full truncate px-4 py-1.5 text-left text-encre hover:text-menthe" style={{ background: "transparent" }}>
                      {l.nom || <span className="text-brume">Sans nom</span>}
                    </button>
                  </td>
                  <td className={`${td} truncate text-center text-craie`}>{TYPES_ACQUEREUR[l.type] || l.type || TYPES_ACQUEREUR.particulier}</td>
                  <td className={`${td} truncate text-center text-craie`}>{l.source || ""}</td>
                  <td className={`${td} truncate text-center ${statut ? CLASSES_STATUT[COULEUR_STATUT[l.statut] || couleurStatut(statut)] : ""}`}>{statut}</td>
                  <td className={`${td} truncate text-center ${motTemp ? CLASSES_STATUT[COULEUR_TEMPERATURE[l.temperature] || "gris"] : ""}`}>{motTemp || ""}</td>
                  <td className={`${td} text-center tabular-nums text-craie`}>{typeof l.score === "number" ? l.score : ""}</td>
                  <td className={`${td} truncate text-craie`} title={l.prochaine || undefined}>{l.prochaine || ""}</td>
                  <td className={`${td} text-center tabular-nums ${enRetard ? CLASSES_STATUT.ambre : "text-craie"}`}>{l.prochaine_le ? jour(l.prochaine_le) : ""}</td>
                  <td className={`${td} truncate text-center text-craie`} title={a.texte || undefined}>{a.le ? jour(a.le) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lignes.length && (
          <p className="m-0 border-t border-trait py-10 text-center text-[14px] text-brume">
            {tous.length ? "Aucun contact dans ce filtre." : "Les contacts arrivent ici avec les annonces, les envois et vos appels."}
          </p>
        )}
      </div>
      <AnimatePresence>{fiche && <FicheContact key={fiche.id} contact={fiche} marcheId={marcheId} proprietaireId={proprietaireId} onFermer={() => ouvrir(null)} />}</AnimatePresence>
    </section>
  );
}
