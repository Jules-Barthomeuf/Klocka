import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { CHAMPS_AFFICHES, afficherValeur, VuesLieu, ChampFiche } from "@/components/preanalyse/DealResultat";

// Le bien : ce qu'on sait de lui. À gauche les faits de la fiche, à droite ce
// que les pièces ont reconstitué — chaque valeur avec sa pastille et le nombre
// de pièces qui la portent. Puis le lieu, en plan, en 3D, depuis la rue.

const TEINTE = { coherent: "#7fd1a8", contradictoire: "#e8927c", manquant: "#e8b04c", hors_critere: "#c39bd3", a_verifier: "#8fb6e8" };
const LIBELLE = { coherent: "Cohérent", contradictoire: "Contradictoire", manquant: "Manquant", hors_critere: "Hors critère", a_verifier: "À vérifier" };

const Kicker = ({ children }) => <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>;

export default function SectionBien({ dossier, apercu = false, onSaisie, enCours = false }) {
  const dealId = dossier?.deal_id;
  const lot = dossier?.lots?.[0];

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

  const champs = CHAMPS_AFFICHES.map(([champ, libelle]) => {
    const c = lot.lot?.[champ];
    const absente = !c || c.absent === true || c.valeur == null;
    return { champ, libelle, valeur: absente ? null : afficherValeur(champ, c.valeur), confiance: c?.confiance ?? null };
  });

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
        {/* Ce que dit la fiche */}
        <div>
          <Kicker>Le bien, d'après la fiche</Kicker>
          <dl className="m-0 mt-3">
            {champs.map((c) => (
              <div key={c.champ} className="flex items-baseline justify-between gap-6 py-2 border-b border-[#15171b]">
                <dt className="text-[13px] text-[#9298a6] flex-none">{c.libelle}</dt>
                <dd className="m-0 text-right min-w-0"><ChampFiche champ={c.champ} lot={lot} onSaisie={onSaisie} enCours={enCours} apercu={apercu} /></dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Ce que les pièces reconstituent */}
        <div>
          <Kicker>Reconstitué depuis les pièces</Kicker>
          {apercu ? (
            <p className="m-0 mt-3 text-[13.5px] text-[#6a7180]">Indisponible en mode aperçu.</p>
          ) : isLoading ? (
            <p className="m-0 mt-3 text-[13px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture des pièces…</p>
          ) : !fiche?.blocs?.length ? (
            <p className="m-0 mt-3 text-[13.5px] text-[#6a7180]">Aucune pièce lue pour l'instant : déposez les documents du dossier.</p>
          ) : (
            <div className="mt-3 space-y-5">
              {fiche.blocs.map((b) => (
                <div key={b.nom}>
                  <p className="m-0 mb-1 text-[12px] font-semibold text-[#c9cdd6]">{b.nom}</p>
                  {b.champs.map((c) => (
                    <div key={c.id} className="flex items-baseline justify-between gap-6 py-2 border-b border-[#15171b]">
                      <dt className="text-[13px] text-[#9298a6] flex-none inline-flex items-center gap-2">
                        <span title={LIBELLE[c.statut]} className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: TEINTE[c.statut] || "#3a3f4a" }} />
                        {c.libelle}
                      </dt>
                      <dd className="m-0 text-right min-w-0">
                        <span className={`text-[14px] tabular-nums font-light ${c.valeur ? "text-[#f2f3f5]" : "text-[#4d545d]"}`}>{c.valeur || "—"}</span>
                        {c.preuves?.length > 0 && <span className="ml-2 text-[11px] text-[#6a7180]">{c.preuves.length} pièce{c.preuves.length > 1 ? "s" : ""}</span>}
                      </dd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Le lieu */}
      <section className="pt-2">
        <Kicker>Le lieu</Kicker>
        <div className="mt-3">
          <VuesLieu lot={lot} enr={lot.enrichissement} />
        </div>
      </section>
    </div>
  );
}
