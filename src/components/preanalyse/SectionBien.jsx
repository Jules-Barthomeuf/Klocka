import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown, Loader2 } from "lucide-react";
import { VuesLieu, ChampFiche } from "@/components/preanalyse/DealResultat";

// Le bien, et lui seul : ce que la fiche annonce, et sous chaque ligne le
// détail que les pièces apportent. Le bail, les quittances, la copropriété et
// les diagnostics ont leurs propres onglets : rien de tout cela ici.

const TEINTE = { coherent: "#7fd1a8", contradictoire: "#e8927c", manquant: "#e8b04c", hors_critere: "#c39bd3", a_verifier: "#8fb6e8" };
const LIBELLE = { coherent: "Cohérent", contradictoire: "Contradictoire", manquant: "Manquant", hors_critere: "Hors critère", a_verifier: "À vérifier" };

// Les grandes parties : un titre, les champs de la fiche qui s'affichent
// d'emblée, et les champs lus dans les pièces qui se déplient dessous.
const PARTIES = [
  { id: "adresse", titre: "Adresse", fiche: ["adresse"], pieces: ["adresse"], lieu: true },
  { id: "surface", titre: "Surface", fiche: ["surface_m2"], pieces: ["surface", "niveaux"] },
  { id: "prix", titre: "Prix et rendement", fiche: ["prix_fai", "honoraires_inclus", "montant_honoraires", "loyer_annuel_ht_hc", "rendement_annonce"], pieces: ["prix", "rendement_affiche"] },
  { id: "occupation", titre: "Occupation", fiche: ["occupe", "locataire_nom", "locataire_activite"], pieces: ["parties", "activite"] },
];

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

const Kicker = ({ children }) => <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>;

function ChampLu({ c }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 border-b border-[#15171b] last:border-b-0">
      <dt className="text-[13px] text-[#9298a6] flex-none inline-flex items-center gap-2">
        <span title={LIBELLE[c.statut]} className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: TEINTE[c.statut] || "#3a3f4a" }} />
        {c.libelle}
      </dt>
      <dd className="m-0 text-right min-w-0 max-w-[70%]">
        <span className={`text-[13.5px] leading-[1.6] font-light ${c.valeur ? "text-[#f2f3f5]" : "text-[#4d545d]"}`}>{c.valeur || "—"}</span>
        {c.preuves?.length > 0 && <span className="ml-2 text-[11px] text-[#6a7180] whitespace-nowrap">{c.preuves.length} pièce{c.preuves.length > 1 ? "s" : ""}</span>}
      </dd>
    </div>
  );
}

export default function SectionBien({ dossier, apercu = false, onSaisie, enCours = false, onRefresh }) {
  const dealId = dossier?.deal_id;
  const lot = dossier?.lots?.[0];
  const [ouvertes, setOuvertes] = useState(() => new Set());
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
    return <p className="m-0 py-8 text-[13.5px] text-[#6a7180]">Pas encore de fiche : lancez la pré-analyse pour connaître le bien.</p>;
  }

  const lus = new Map((fiche?.blocs || []).flatMap((b) => b.champs).map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <Kicker>Le bien</Kicker>
        <p className="m-0 mt-1.5 text-[13px] text-[#6a7180]">Ce que la fiche annonce. Un clic sur une partie ouvre ce que les pièces en disent.</p>
      </div>

      <div className="border-t border-[#1f2228]">
        {PARTIES.map((p) => {
          const ouverte = ouvertes.has(p.id);
          // Une question jamais lue sur ce dossier n'a rien à montrer : on
          // n'affiche que ce que les pièces donnent vraiment.
          const detail = p.pieces.map((id) => lus.get(id)).filter((c) => c && (c.valeur || c.preuves?.length));
          const nbPieces = detail.reduce((n, c) => n + (c.preuves?.length || 0), 0);
          return (
            <section key={p.id} className="border-b border-[#1f2228]">
              <button
                type="button"
                onClick={() => basculer(p.id)}
                aria-expanded={ouverte}
                className="w-full flex items-center justify-between gap-4 py-3.5 text-left group"
              >
                <span className="text-[15px] font-medium text-[#f2f3f5]">{p.titre}</span>
                <span className="flex items-center gap-3 flex-none">
                  {!apercu && (nbPieces > 0 || p.lieu) && (
                    <span className="text-[12px] text-[#6a7180]">{p.lieu ? "le lieu" : `${nbPieces} pièce${nbPieces > 1 ? "s" : ""}`}</span>
                  )}
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[#6a7180] group-hover:text-[#f2f3f5] group-hover:bg-[#f2f3f5]/5 transition-all duration-300 ${ouverte ? "rotate-180" : ""}`}>
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </span>
              </button>

              {/* Les valeurs de la fiche, toujours visibles : elles sont le bien. */}
              <dl className="m-0 pb-3">
                {p.fiche.map((champ) => (
                  <div key={champ} className="flex items-baseline justify-between gap-6 py-2 border-b border-[#15171b] last:border-b-0">
                    <dt className="text-[13px] text-[#9298a6] flex-none">{LIBELLES_FICHE[champ]}</dt>
                    <dd className="m-0 text-right min-w-0"><ChampFiche champ={champ} lot={lot} onSaisie={onSaisie} enCours={enCours} apercu={apercu} /></dd>
                  </div>
                ))}
              </dl>

              {/* Le détail, déplié : ce que les pièces reconstituent. */}
              <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: ouverte ? "1fr" : "0fr" }} aria-hidden={!ouverte}>
                <div className="min-h-0 overflow-hidden">
                  <div className="pb-5 pl-4 border-l border-[#22262d] ml-1">
                    {apercu ? (
                      <p className="m-0 text-[13px] text-[#6a7180]">Indisponible en mode aperçu.</p>
                    ) : isLoading ? (
                      <p className="m-0 text-[13px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture des pièces…</p>
                    ) : (
                      <>
                        {detail.length > 0 ? (
                          <dl className="m-0">{detail.map((c) => <ChampLu key={c.id} c={c} />)}</dl>
                        ) : (
                          <p className="m-0 text-[13px] text-[#6a7180]">Rien dans les pièces sur ce point.</p>
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
        })}
      </div>
    </div>
  );
}
