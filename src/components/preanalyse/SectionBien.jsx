/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Loader2 } from "lucide-react";
import { VuesLieu, ChampFiche } from "@/components/preanalyse/DealResultat";
import { J } from "@/design/jetons";

// Le bien, et lui seul : ce que la fiche annonce, et sous chaque ligne le
// détail que les pièces apportent. Le bail, les quittances, la copropriété et
// les diagnostics ont leurs propres onglets : rien de tout cela ici.

const TEINTE = { coherent: J["vert"], contradictoire: J["alerte"], manquant: J["ambre"], hors_critere: "#c39bd3", a_verifier: J["bleu"] };
const LIBELLE = { coherent: "Cohérent", contradictoire: "Contradictoire", manquant: "Manquant", hors_critere: "Hors critère", a_verifier: "À vérifier" };

// Les grandes parties : un titre, les champs de la fiche qui s'affichent
// d'emblée, et les champs lus dans les pièces qui se déplient dessous.
const ADRESSE = { id: "adresse", titre: "Adresse", fiche: ["adresse"], pieces: ["adresse"], lieu: true };
const GAUCHE = [
  { id: "surface", titre: "Surface", fiche: ["surface_m2"], pieces: ["surface", "niveaux"] },
  { id: "prix", titre: "Prix et rendement", fiche: ["prix_fai", "honoraires_inclus", "montant_honoraires", "loyer_annuel_ht_hc", "rendement_annonce"], pieces: ["prix", "rendement_affiche"] },
];
const DROITE = [
  { id: "occupation", titre: "Occupation", fiche: ["occupe", "locataire_nom", "locataire_activite"], pieces: ["parties", "activite"] },
];
const PARTIES = [ADRESSE, ...GAUCHE, ...DROITE];

const LIBELLES_FICHE = {
  adresse: "Adresse",
  surface_m2: "Surface",
  prix_fai: "Prix FAI",
  honoraires_inclus: "Honoraires inclus",
  montant_honoraires: "Montant honoraires",
  loyer_annuel_ht_hc: "Loyer annuel HT HC",
  rendement_annonce: "Rendement annoncé",
  occupe: "Occupé",
  locataire_nom: "Locataire",
  locataire_activite: "Activité",
};

const Kicker = ({ children }) => <p className="font-pill m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">{children}</p>;

// Une ligne du bien : le libellé, la valeur, et à droite d'où elle vient.
// Trois colonnes fixes, pour que les valeurs s'alignent d'une partie à l'autre.
const LIGNE_LARGE = "grid items-center gap-4 py-2.5 grid-cols-[130px_minmax(0,1fr)] md:grid-cols-[200px_minmax(0,1fr)_130px]";
const LIGNE_COLONNE = "grid items-center gap-3 py-2.5 grid-cols-[120px_minmax(0,1fr)] lg:grid-cols-[150px_minmax(0,1fr)_104px]";

/** D'où vient la valeur : saisie, peu sûre, ou calculée. */
function noteDe(champ, lot) {
  const c = lot?.lot?.[champ];
  if (!c || c.absent) return null;
  if (c.saisi_a_la_main) return { mot: "saisi à la main", teinte: "text-ambre" };
  if (c.confiance === "basse") return { mot: "confiance basse", teinte: "text-ambre" };
  if (champ === "rendement_annonce" && !c.citation) return { mot: "calculé", teinte: "text-brume" };
  return null;
}

function ChampLu({ c }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 border-b border-relief last:border-b-0">
      <dt className="text-[12.5px] text-ardoise flex-none inline-flex items-center gap-2">
        <span title={LIBELLE[c.statut]} className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: TEINTE[c.statut] || J["bord-vif"] }} />
        {c.libelle}
      </dt>
      <dd className="m-0 text-right min-w-0 max-w-[70%]">
        <span className={`text-[13.5px] leading-[1.6] font-light ${c.valeur ? "text-encre" : "text-brume"}`}>{c.valeur || "—"}</span>
        {c.preuves?.length > 0 && <span className="ml-2 text-[11px] text-brume whitespace-nowrap">{c.preuves.length} pièce{c.preuves.length > 1 ? "s" : ""}</span>}
      </dd>
    </div>
  );
}

export default function SectionBien({ dossier, apercu = false, onSaisie, enCours = false, onRefresh }) {
  const dealId = dossier?.deal_id;
  const lot = dossier?.lots?.[0];
  const [ouvertes, setOuvertes] = useState(() => new Set(["adresse"]));
  const basculer = (id) => setOuvertes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // La fiche reconstituée depuis les pièces : une valeur retenue par champ.
  const { data: fiche, isLoading } = useQuery({
    queryKey: ["fiche", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice/fiche`),
    enabled: !!dealId && !apercu,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: (precedent) => precedent,
  });

  if (!lot) {
    return <p className="m-0 py-8 text-[13.5px] text-brume">Pas encore de fiche : lancez la pré-analyse pour connaître le bien.</p>;
  }

  const lus = new Map((fiche?.blocs || []).flatMap((b) => b.champs).map((c) => [c.id, c]));

  // Une partie : son en-tête, ses lignes de fiche, et le détail des pièces.
  const Partie = ({ p, large }) => {
    const ouverte = ouvertes.has(p.id);
    // Une question jamais lue sur ce dossier n'a rien à montrer : on n'affiche
    // que ce que les pièces donnent vraiment.
    const detail = p.pieces.map((id) => lus.get(id)).filter((c) => c && (c.valeur || c.preuves?.length));
    const nbPieces = detail.reduce((n, c) => n + (c.preuves?.length || 0), 0);
    return (
      <section className="border-t border-trait">
        <button
          type="button"
          onClick={() => basculer(p.id)}
          aria-expanded={ouverte}
          className="group flex w-full items-center gap-3 pb-2.5 pt-3.5 text-left"
          style={{ background: "transparent" }}
        >
          <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">{p.titre}</span>
          {!apercu && (nbPieces > 0 || p.lieu) && (
            <span className="text-[12px] text-brume">{p.lieu ? "le lieu" : `${nbPieces} pièce${nbPieces > 1 ? "s" : ""}`}</span>
          )}
          <span className={`ml-auto flex-none text-brume transition-transform duration-300 group-hover:text-encre ${ouverte ? "rotate-180" : ""}`}>
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>

        {/* Les valeurs de la fiche, toujours visibles : elles sont le bien. */}
        <dl className="m-0 pb-2">
          {p.fiche.map((champ) => {
            const note = noteDe(champ, lot);
            return (
              <div key={champ} className={large ? LIGNE_LARGE : LIGNE_COLONNE}>
                <dt className="text-[13.5px] text-ardoise">{LIBELLES_FICHE[champ]}</dt>
                <dd className="m-0 min-w-0">
                  <ChampFiche champ={champ} lot={lot} onSaisie={onSaisie} enCours={enCours} apercu={apercu} sansNote aGauche teinte={champ === "rendement_annonce" ? "text-menthe-clair" : null} />
                </dd>
                <dd className={`m-0 hidden text-right text-[12px] ${large ? "md:block" : "lg:block"} ${note ? note.teinte : ""}`}>{note?.mot || ""}</dd>
              </div>
            );
          })}
        </dl>

        {/* Le détail, déplié : ce que les pièces reconstituent. */}
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: ouverte ? "1fr" : "0fr" }} aria-hidden={!ouverte}>
          <div className="min-h-0 overflow-hidden">
            <div className="ml-1 border-l border-bord pb-5 pl-4">
              {apercu ? (
                <p className="m-0 text-[12.5px] text-brume">Indisponible en mode aperçu.</p>
              ) : isLoading ? (
                <p className="m-0 inline-flex items-center gap-2 text-[12.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Lecture des pièces…</p>
              ) : (
                <>
                  {detail.length > 0 ? (
                    <dl className="m-0">{detail.map((c) => <ChampLu key={c.id} c={c} />)}</dl>
                  ) : (
                    <p className="m-0 text-[12.5px] text-brume">Rien dans les pièces sur ce point.</p>
                  )}
                  {p.lieu && (
                    <div className="mt-4">
                      <VuesLieu lot={lot} enr={lot.enrichissement} coteACote />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="border-b border-trait">
      {/* L'adresse et son lieu : en pleine largeur, ouverts d'emblée. */}
      <Partie p={ADRESSE} large />

      {/* Ce que vaut le bien à gauche, qui l'occupe à droite. */}
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        <div>{GAUCHE.map((p) => <Partie key={p.id} p={p} />)}</div>
        <div>{DROITE.map((p) => <Partie key={p.id} p={p} />)}</div>
      </div>
    </div>
  );
}
