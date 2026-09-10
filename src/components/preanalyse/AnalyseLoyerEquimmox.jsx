import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";
import ConnexionExterne from "@/components/preanalyse/ConnexionExterne";

// L'analyse de loyer d'Equimmox : les loyers observés autour d'une adresse,
// dans un rayon de 500 m, pour des locaux de surface comparable (±30 %).
// Bas, moyenne, haut — et le loyer du bail posé en face. C'est le second
// contrôle que l'équipe faisait à la main, après Data-B. Une recherche prend
// une bonne minute : Klocka pilote leur site comme une personne le ferait.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// Ce que Klocka fait sur Equimmox, étape par étape. La cinquième — le
// lancement — est celle qui dure : elle attend la réponse.
const ETAPES = [
  { court: "Connexion à Equimmox", ligne: "Je me connecte sur Equimmox", legende: "Authentification sur la plateforme, session ouverte." },
  { court: "Ouverture de l'analyse de loyer", ligne: "J'ouvre l'analyse de loyer", legende: "Le module de comparables, parmi les analyses d'Equimmox." },
  { court: "Saisie de l'adresse", ligne: "Je saisis l'adresse du bien", legende: "L'adresse est proposée par leur recherche, puis choisie." },
  { court: "Rayon et surface", ligne: "Je règle le rayon et la surface", legende: "500 mètres autour du bien, surface à plus ou moins 30 %." },
  { court: "Lancement de l'analyse", ligne: "Je lance l'analyse", legende: "Equimmox rassemble les baux comparables. Cela prend une minute." },
  { court: "Retour dans l'application", ligne: "Je remonte la donnée dans l'application", legende: "Bas, moyenne, haut, et le positionnement du bail." },
];
const ATTEND_A = 4;

function verdict(loyerM2, r) {
  if (loyerM2 == null || !r || (r.bas == null && r.haut == null)) return null;
  if (r.bas != null && loyerM2 < r.bas) return { mot: "sous les loyers observés", teinte: "#96c0b8", detail: "le loyer paraît prudent par rapport aux comparables" };
  if (r.haut != null && loyerM2 > r.haut) return { mot: "au-dessus des loyers observés", teinte: "#e8746a", detail: "le loyer paraît surévalué : à vérifier avant de retenir le rendement" };
  return { mot: "dans les loyers observés", teinte: "#d9b46a", detail: "le loyer est cohérent avec les comparables du secteur" };
}

export default function AnalyseLoyerEquimmox({ dossier, lot, apercu = false, onRefresh }) {
  const a = lot?.lot?.adresse?.valeur;
  const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const surfaceDossier = lot?.lot?.surface_m2?.valeur > 0 ? Math.round(lot.lot.surface_m2.valeur) : "";
  const [adresse, setAdresse] = useState(adresseDossier);
  const [surface, setSurface] = useState(surfaceDossier);
  useEffect(() => { setAdresse((v) => v || adresseDossier); }, [adresseDossier]);
  useEffect(() => { setSurface((v) => v || surfaceDossier); }, [surfaceDossier]);

  const [resultat, setResultat] = useState(lot?.analyse_loyer || null);
  useEffect(() => { if (lot?.analyse_loyer) setResultat(lot.analyse_loyer); }, [lot?.analyse_loyer]);

  // L'écran « Connexion à Equimmox » pendant la recherche : la réponse est
  // gardée jusqu'à la fin de l'animation. Un résultat déjà connu se montre
  // tout de suite.
  const [ecran, setEcran] = useState(false);
  const ecranRef = useRef(false);
  ecranRef.current = ecran;
  const [pret, setPret] = useState(false);
  const enAttente = useRef(null);

  const poser = (res) => {
    setResultat(res);
    if (res?.du_cache) toast.message("Analyse déjà connue", { description: "Résultat gardé de moins de trente jours. « Relire » interroge Equimmox de nouveau." });
    onRefresh?.();
  };

  const chercher = useMutation({
    mutationFn: ({ forcer = false } = {}) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot?.index ?? 0}/equimmox/analyse-loyer`, {
        body: { adresse, surface: Number(surface) > 0 ? Number(surface) : null, forcer },
      }),
    onSuccess: (r) => {
      if (!ecranRef.current || r.resultat?.du_cache) { setEcran(false); poser(r.resultat); return; }
      enAttente.current = r.resultat;
      setPret(true);
    },
    onError: (e) => { setEcran(false); toast.error(e?.message || "Equimmox n'a pas répondu"); },
  });

  const lancer = (forcer) => {
    enAttente.current = null;
    setPret(false);
    setEcran(true);
    chercher.mutate({ forcer });
  };
  const finir = () => { setEcran(false); if (enAttente.current) poser(enAttente.current); enAttente.current = null; };

  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surfaceLot = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surfaceLot > 0 ? loyer / surfaceLot : null;
  const v = resultat ? verdict(loyerM2, resultat) : null;
  const dedans = (n) => loyerM2 != null && resultat?.bas != null && resultat?.haut != null && n === "moyenne" && loyerM2 >= resultat.bas && loyerM2 <= resultat.haut;

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div>
        <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Loyers observés autour</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">D'après Equimmox : locaux commerciaux à moins de 500 m, de surface comparable à ±30 %. En euros par m² et par an. Une recherche prend environ une minute.</p>
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (adresse.trim() && !apercu) lancer(false); }}
      >
        <input
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="12 rue Exemple, 69002 Lyon"
          disabled={apercu || chercher.isPending}
          className="flex-1 min-w-[220px] bg-transparent border border-[#2c3139] focus:border-[#f2f3f5] rounded-full px-4 py-2 outline-none text-[13.5px] text-[#f2f3f5] placeholder:text-[#3a3f4a] disabled:opacity-60"
        />
        <label className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]">
          <input
            value={surface}
            onChange={(e) => setSurface(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="80"
            disabled={apercu || chercher.isPending}
            className="w-[64px] bg-transparent border border-[#2c3139] focus:border-[#f2f3f5] rounded-full px-3 py-2 outline-none text-[13.5px] text-[#f2f3f5] tabular-nums text-right placeholder:text-[#3a3f4a] disabled:opacity-60"
          />
          m²
        </label>
        <button
          type="submit"
          disabled={apercu || chercher.isPending || !adresse.trim()}
          className="inline-flex items-center gap-2 text-[12.5px] px-3.5 py-2 rounded-full bg-[#96c0b8] text-[#0b0c0e] font-semibold hover:bg-[#abd0c8] disabled:opacity-40"
        >
          {chercher.isPending ? <PenseeIA etat="searching" taille={20} /> : <Search className="w-3.5 h-3.5" />}
          {chercher.isPending ? "Equimmox cherche…" : "Chercher sur Equimmox"}
        </button>
        {resultat && !chercher.isPending && (
          <button
            type="button"
            onClick={() => lancer(true)}
            title="Interroger Equimmox de nouveau, en ignorant le résultat gardé"
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-full border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
          >
            <RefreshCw className="w-3 h-3" /> Relire
          </button>
        )}
      </form>

      <div className="mt-4">
        <p className="m-0 mb-2 text-[11.5px] text-[#6a7180]">
          {resultat ? (
            <>
              {resultat.adresse}
              {resultat.surface ? <><span className="text-[#3a3f4a]"> · </span>{resultat.surface_min}–{resultat.surface_max} m²</> : null}
              <span className="text-[#3a3f4a]"> · </span>{resultat.rayon}
              <span className="text-[#3a3f4a]"> · </span>lu le {new Date(resultat.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              {resultat.du_cache && <span className="text-[#3a3f4a]"> · gardé</span>}
            </>
          ) : (
            "Aucune lecture — lancez une recherche sur Equimmox."
          )}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[["Bas", resultat?.bas, "bas"], ["Moyenne", resultat?.moyenne, "moyenne"], ["Haut", resultat?.haut, "haut"]].map(([l, n, cle]) => (
            <div key={cle} className="border border-[#1f2228] rounded-xl px-4 py-3 bg-[#0f1114]">
              <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{l}</p>
              <p
                className={`m-0 mt-1 text-[20px] tabular-nums font-light ${!resultat ? "text-[#3a3d3c]" : dedans(cle) ? "text-[#d9b46a]" : "text-[#f2f3f5]"}`}
                style={{ transition: "opacity .5s ease, transform .5s ease", transform: resultat ? "none" : "translateY(4px)" }}
              >
                {resultat ? euros(n) : "— €"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {resultat && (
        <div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {loyerM2 != null ? (
              <>
                <span className="text-[13px] text-[#9298a6]">Le bail :</span>
                <span className="text-[15px] tabular-nums font-light text-[#f2f3f5]">{euros(loyerM2)} / m² / an</span>
                {v && <span className="text-[13px]" style={{ color: v.teinte }}>{v.mot}<span className="text-[#6a7180]"> — {v.detail}</span></span>}
              </>
            ) : (
              <span className="text-[12.5px] text-[#6a7180]">Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront renseignés dans la fiche.</span>
            )}
            {resultat.delai_jours != null && (
              <span className="text-[12px] text-[#6a7180]">Délai de commercialisation observé : {resultat.delai_jours} jours.</span>
            )}
          </div>
        </div>
      )}

      {ecran && (
        <ConnexionExterne
          service="Equimmox"
          etapes={ETAPES}
          attendA={ATTEND_A}
          pret={pret}
          dureeEtape={4200}
          onFini={finir}
          onPasser={finir}
        />
      )}
    </section>
  );
}
