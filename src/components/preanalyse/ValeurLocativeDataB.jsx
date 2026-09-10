import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";
import ConnexionExterne from "@/components/preanalyse/ConnexionExterne";

// La valeur locative d'après Data-B : la fourchette de loyer au m² de la rue,
// du quartier et de la ville, et le loyer du bail posé en face. C'est le
// contrôle que l'équipe faisait à la main, module « Valeurs locatives », en
// recopiant trois lignes. Ici on saisit l'adresse — celle du dossier est
// proposée — et Klocka va chercher.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// Ce que Klocka fait pendant la recherche, tel qu'on le montre à l'écran.
// L'étape 4 est celle qui attend la réponse de Data-B.
const ETAPES = [
  { court: "Connexion à Data-B", ligne: "Je me connecte sur Data-B", legende: "Authentification sur la plateforme, session ouverte." },
  { court: "Ouverture de Valeurs locatives", ligne: "J'ouvre Valeurs locatives", legende: "Le module d'estimation de loyer parmi les logiciels de la suite." },
  { court: "Saisie de l'adresse", ligne: "Je saisis l'adresse du bien", legende: "L'adresse du bail est géocodée puis envoyée à la recherche." },
  { court: "Analyse des données", ligne: "J'analyse les données de loyer", legende: "Estimations basse et haute au m², rue par rue." },
  { court: "Analyse des secteurs", ligne: "Je compare les secteurs", legende: "Le quartier et la ville servent de repères autour de la rue." },
  { court: "Retour dans l'application", ligne: "Je remonte la donnée dans l'application", legende: "Rue, quartier, ville et positionnement du bail." },
];
const ATTEND_A = 3;

// Le loyer du bail au m², contre la fourchette de la rue : en dessous, dedans,
// au-dessus. C'est la seule phrase qui compte.
function verdictLoyer(loyerM2, rue) {
  if (loyerM2 == null || !rue || (rue.basse == null && rue.haute == null)) return null;
  if (rue.basse != null && loyerM2 < rue.basse) return { mot: "sous la fourchette de la rue", teinte: "#96c0b8", detail: "le loyer paraît prudent, il y a peut-être de la marge à la hausse" };
  if (rue.haute != null && loyerM2 > rue.haute) return { mot: "au-dessus de la fourchette de la rue", teinte: "#e8746a", detail: "le loyer paraît surévalué : à vérifier avant de retenir le rendement" };
  return { mot: "dans la fourchette de la rue", teinte: "#d9b46a", detail: "le loyer est cohérent avec le marché de la rue" };
}

function Niveau({ titre, n, loyerM2 }) {
  const dedans = n && loyerM2 != null && n.basse != null && n.haute != null && loyerM2 >= n.basse && loyerM2 <= n.haute;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[#15171b]">
      <div className="min-w-0">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{titre}</p>
        <p className={`m-0 text-[14px] truncate ${n ? "text-[#f2f3f5]" : "text-[#3a3f4a]"}`}>{n?.nom || "—"}</p>
      </div>
      <p
        className={`m-0 text-[15px] tabular-nums font-light whitespace-nowrap ${!n ? "text-[#3a3d3c]" : dedans ? "text-[#d9b46a]" : "text-[#f2f3f5]"}`}
        style={{ transition: "opacity .5s ease, transform .5s ease", transform: n ? "none" : "translateY(4px)" }}
      >
        {n ? <>{euros(n.basse)} <span className="text-[#3a3f4a]">–</span> {euros(n.haute)}</> : "— €"}
      </p>
    </div>
  );
}

export default function ValeurLocativeDataB({ dossier, lot, apercu = false, onRefresh }) {
  const a = lot?.lot?.adresse?.valeur;
  const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const [adresse, setAdresse] = useState(adresseDossier);
  useEffect(() => { setAdresse((v) => v || adresseDossier); }, [adresseDossier]);

  // Le résultat déjà posé sur le lot, ou celui qu'on vient de chercher.
  const [resultat, setResultat] = useState(lot?.valeur_locative || null);
  useEffect(() => { if (lot?.valeur_locative) setResultat(lot.valeur_locative); }, [lot?.valeur_locative]);

  // L'écran « Connexion à Data-B » pendant la recherche. La réponse arrive
  // souvent avant la fin de l'animation : on la garde jusqu'au bout. Un
  // résultat déjà connu se montre tout de suite, sans mise en scène.
  const [ecran, setEcran] = useState(false);
  const ecranRef = useRef(false);
  ecranRef.current = ecran;
  const [pret, setPret] = useState(false);
  const enAttente = useRef(null);

  const poser = (res) => {
    setResultat(res);
    if (res?.du_cache) toast.message("Valeur locative déjà connue", { description: "Résultat gardé de moins de trente jours. « Relire » interroge Data-B de nouveau." });
    onRefresh?.();
  };

  const chercher = useMutation({
    mutationFn: ({ forcer = false } = {}) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot?.index ?? 0}/data-b/valeur-locative`, { body: { adresse, forcer } }),
    onSuccess: (r) => {
      if (!ecranRef.current || r.resultat?.du_cache) { setEcran(false); poser(r.resultat); return; }
      enAttente.current = r.resultat;
      setPret(true);
    },
    onError: (e) => { setEcran(false); toast.error(e?.message || "Data-B n'a pas répondu"); },
  });

  const lancer = (forcer) => {
    enAttente.current = null;
    setPret(false);
    setEcran(true);
    chercher.mutate({ forcer });
  };
  const finir = () => { setEcran(false); if (enAttente.current) poser(enAttente.current); enAttente.current = null; };

  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surface = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surface > 0 ? loyer / surface : null;
  const verdict = resultat ? verdictLoyer(loyerM2, resultat.rue) : null;
  const memeAdresse = resultat && adresse.trim() && resultat.adresse && adresse.trim().toLowerCase().startsWith(resultat.adresse.split(" ")[0].toLowerCase());

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Valeur locative</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">Loyer au m² de la rue, du quartier et de la ville, d'après Data-B. En euros HT hors charges, par m² et par an.</p>
        </div>
        {resultat?.lien && (
          <a href={resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#9298a6] hover:text-[#96c0b8]">
            Voir sur Data-B <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* L'adresse : celle du dossier, ou n'importe laquelle. */}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (adresse.trim() && !apercu) lancer(false); }}
      >
        <input
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="12 rue Exemple, 69002 Lyon"
          disabled={apercu || chercher.isPending}
          className="flex-1 min-w-[240px] bg-transparent border border-[#2c3139] focus:border-[#f2f3f5] rounded-full px-4 py-2 outline-none text-[13.5px] text-[#f2f3f5] placeholder:text-[#3a3f4a] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={apercu || chercher.isPending || !adresse.trim()}
          className="inline-flex items-center gap-2 text-[12.5px] px-3.5 py-2 rounded-full bg-[#96c0b8] text-[#0b0c0e] font-semibold hover:bg-[#abd0c8] disabled:opacity-40"
        >
          {chercher.isPending ? <PenseeIA etat="searching" taille={20} /> : <Search className="w-3.5 h-3.5" />}
          {chercher.isPending ? "Data-B cherche…" : "Chercher sur Data-B"}
        </button>
        {resultat && memeAdresse && !chercher.isPending && (
          <button
            type="button"
            onClick={() => lancer(true)}
            title="Interroger Data-B de nouveau, en ignorant le résultat gardé"
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-full border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
          >
            <RefreshCw className="w-3 h-3" /> Relire
          </button>
        )}
      </form>

      <div className="mt-4">
        <p className="m-0 mb-1 text-[11.5px] text-[#6a7180]">
          {resultat ? (
            <>
              {resultat.adresse}
              <span className="text-[#3a3f4a]"> · </span>
              lu le {new Date(resultat.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              {resultat.du_cache && <span className="text-[#3a3f4a]"> · gardé</span>}
            </>
          ) : (
            "Aucune lecture — lancez une recherche sur Data-B."
          )}
        </p>
        <dl className="m-0">
          <Niveau titre="Rue" n={resultat?.rue} loyerM2={loyerM2} />
          <Niveau titre="Quartier" n={resultat?.quartier} loyerM2={loyerM2} />
          <Niveau titre="Ville" n={resultat?.ville} loyerM2={loyerM2} />
        </dl>
      </div>

      {resultat && (
        <div>
          {/* Le loyer du bail, en face : c'est pour ça qu'on est venu. */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {loyerM2 != null ? (
              <>
                <span className="text-[13px] text-[#9298a6]">Le bail :</span>
                <span className="text-[15px] tabular-nums font-light text-[#f2f3f5]">{euros(loyerM2)} / m² / an</span>
                {verdict && (
                  <span className="text-[13px]" style={{ color: verdict.teinte }}>
                    {verdict.mot}<span className="text-[#6a7180]"> — {verdict.detail}</span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-[12.5px] text-[#6a7180]">Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront renseignés dans la fiche.</span>
            )}
          </div>
        </div>
      )}

      {ecran && (
        <ConnexionExterne
          service="Data-B"
          etapes={ETAPES}
          attendA={ATTEND_A}
          pret={pret}
          dureeEtape={3000}
          onFini={finir}
        />
      )}
    </section>
  );
}
