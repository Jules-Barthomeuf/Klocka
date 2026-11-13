import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CLASSES_STATUT } from "@/lib/couleur-statut";
import Chargement from "@/components/ui/Chargement";
import { montant, fourchette } from "../../../server/montants.js";

// Le prix des murs face au marché (10 nov. 2026, Jules : « savoir s'il est plutôt sur ou sous-évalué ») : en tête de
// l'onglet Marché, le verdict, puis ses deux mesures (ventes réelles DVF, capitalisation) et le contrôle du loyer, une
// ligne chacune. Le taux de marché se corrige sur place ; le calcul vit dans server/deal/verdict-prix.js.

// Surévalué : corail ; légèrement : ambre ; dans le marché : menthe ; sous-évalué : bleu (une bonne affaire, pas une alerte).
const couleurDe = (v) => (v.sens === "juste" ? "menthe" : v.sens === "bas" ? "bleu" : v.mot.startsWith("légèrement") ? "ambre" : "corail");
const nombre = (n) => Number(n).toLocaleString("fr-FR");
const signe = (e) => (e > 0 ? `+${e} %` : `${e} %`);
const virgule = (n) => String(n).replace(".", ",");

function Ligne({ titre, children, ecart }) {
  return (
    <div className="flex items-start gap-3 border-t border-trait py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13.5px] text-encre">{titre}</p>
        <div className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-ardoise">{children}</div>
      </div>
      {ecart != null && <span className="shrink-0 text-[13.5px] tabular-nums text-craie">{signe(ecart)}</span>}
    </div>
  );
}

export default function VerdictPrix({ dealId, index = 0 }) {
  const [taux, setTaux] = useState("");
  const [tauxPose, setTauxPose] = useState(null);
  const [ventesOuvertes, setVentesOuvertes] = useState(false);
  const q = useQuery({
    queryKey: ["verdict-prix", dealId, index, tauxPose],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/verdict-prix${tauxPose ? `?taux=${tauxPose}` : ""}`),
    enabled: !!dealId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const cadre = "k-verre p-3.5";
  if (q.isLoading) return <div className={cadre}><Chargement taille="petit" titre="Le prix face au marché" etats={["Je lis les ventes DVF autour", "Je capitalise le loyer", "Je compare au prix demandé"]} /></div>;
  if (q.isError) return <div className={cadre}><p className="m-0 text-[13.5px] text-ardoise">Le prix face au marché : {q.error?.message || "lecture impossible"}.</p></div>;
  const r = q.data || {};
  const v = r.verdict;
  const c = r.comparaison;
  const k = r.capitalisation;
  const l = r.controle_loyer;

  const poserTaux = (ev) => {
    ev.preventDefault();
    const t = Number(String(taux).replace(",", "."));
    setTauxPose(t > 0 ? t : null);
  };

  // Le taux de marché se pose ici : pour corriger celui de la ville, ou quand la ville n'en a aucun de validé.
  const formTaux = (libelle, exemple) => (
    <form onSubmit={poserTaux} className="mt-1.5 flex flex-wrap items-center gap-2">
      <label className="text-brume" htmlFor={`taux-${dealId}`}>{libelle}</label>
      <input id={`taux-${dealId}`} inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder={exemple} className="w-16 rounded-champ border border-bord bg-transparent px-2 py-0.5 text-[12.5px] text-encre max-md:text-[16px]" />
      <span className="text-brume">%</span>
      {tauxPose && <button type="button" onClick={() => { setTaux(""); setTauxPose(null); }} className="text-menthe hover:text-menthe-survol">Revenir aux taux validés</button>}
    </form>
  );
  const rangDe = (c) => (c.rang === 0 ? "Le bien est moins cher que toutes" : c.rang === 100 ? "Le bien est plus cher que toutes" : `Le bien est plus cher que ${c.rang} %`);

  return (
    <section className={cadre} aria-label="Le prix face au marché">
      <p className="m-0 mb-2 text-[12.5px] text-ardoise">Le prix face au marché</p>
      {v ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className={`rounded-full px-3 py-1 text-[15px] ${CLASSES_STATUT[couleurDe(v)]}`}>{v.mot.charAt(0).toUpperCase() + v.mot.slice(1)}</span>
          <span className="text-[18px] tabular-nums text-encre">{signe(v.ecart)}</span>
          <span className="text-[12.5px] text-ardoise">Confiance {v.confiance} : {v.pourquoi}.</span>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-craie">Pas de verdict : il manque {r.manque?.join(", ") || "les chiffres du bien"}.</p>
      )}
      {r.bien?.prix && (
        <p className="m-0 mt-2 text-[12.5px] text-ardoise">
          {montant(r.bien.prix)} demandés{r.bien.prix_m2 ? `, soit ${nombre(r.bien.prix_m2)} €/m²` : ""}{r.bien.rendement ? `, rendement affiché ${virgule(r.bien.rendement)}\u00a0%` : ""}.
          {r.adresse ? ` Marché lu autour du ${r.adresse}.` : ""}
          {r.approche ? " Adresse approchée, faute de rue dans la fiche : à vérifier." : ""}
        </p>
      )}

      <div className="mt-3">
        {c && (
          <Ligne titre="Ventes réelles autour (DVF)" ecart={c.ecart}>
            {c.n} ventes de locaux commerciaux {c.cercle === "même rue" ? "dans la même rue" : `à ${c.cercle}`}, sur {c.annees} ans, de surface comparable : médiane {nombre(c.prix_m2.median)} €/m² ({nombre(c.prix_m2.bas)} à {nombre(c.prix_m2.haut)}). {rangDe(c)} d'entre elles ; à la médiane, il vaudrait {montant(c.valeur)}.
            <button type="button" onClick={() => setVentesOuvertes((o) => !o)} className="ml-1 inline-flex items-center gap-0.5 text-menthe hover:text-menthe-survol" aria-expanded={ventesOuvertes}>
              {ventesOuvertes ? "Masquer les ventes" : "Voir les ventes"} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ventesOuvertes ? "rotate-180" : ""}`} />
            </button>
            {ventesOuvertes && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12.5px] tabular-nums">
                  <tbody>
                    {c.ventes.map((x, i) => (
                      <tr key={i} className="border-t border-trait">
                        <td className="py-1 pr-3 whitespace-nowrap text-brume max-md:hidden">{String(x.date).slice(0, 7)}</td>
                        <td className="py-1 pr-3 text-craie">{x.adresse}</td>
                        <td className="py-1 pr-3 whitespace-nowrap text-right">{nombre(x.surface)} m²</td>
                        <td className="py-1 pr-3 whitespace-nowrap text-right max-md:hidden">{montant(x.prix)}</td>
                        <td className="py-1 pr-3 whitespace-nowrap text-right text-encre">{nombre(x.prix_m2)} €/m²</td>
                        <td className="py-1 whitespace-nowrap text-right text-brume max-md:hidden">{nombre(x.distance_m)} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.lien_dvf && <a href={r.lien_dvf} target="_blank" rel="noreferrer" className="mt-1 inline-block text-menthe hover:text-menthe-survol">Ouvrir la carte DVF</a>}
              </div>
            )}
          </Ligne>
        )}
        {k && (
          <Ligne titre="Capitalisation du loyer" ecart={k.ecart}>
            {montant(r.bien.loyer)} de loyer ÷ {virgule(k.taux)} % = {montant(k.moyenne)} ({fourchette(k.basse, k.haute)}).{k.ajustements?.length ? ` ${k.lecture.charAt(0).toUpperCase() + k.lecture.slice(1)}.` : ""} Taux : {k.source_taux}.
            {formTaux("Autre taux de marché", virgule(k.taux_base))}
          </Ligne>
        )}
        {l && (
          <Ligne titre="Le loyer face au marché" ecart={l.ecart}>
            {nombre(l.loyer_m2)} €/m²/an contre {nombre(l.marche_m2)} €/m²/an{l.source ? ` (${l.source})` : ""}.{l.alerte ? ` ${l.alerte}` : ""}
          </Ligne>
        )}
        {!k && r.bien?.loyer > 0 && r.bien?.prix > 0 && (
          <Ligne titre="Capitalisation du loyer">
            Aucun taux de marché validé pour {r.ville || "cette ville"} : donnez-en un pour capitaliser le loyer de {montant(r.bien.loyer)}.
            {formTaux("Taux de marché", "6,5")}
          </Ligne>
        )}
        {v && r.manque?.length > 0 && <p className="m-0 border-t border-trait pt-2.5 text-[12.5px] text-brume">Manque : {r.manque.join(" ; ")}.</p>}
      </div>
    </section>
  );
}
