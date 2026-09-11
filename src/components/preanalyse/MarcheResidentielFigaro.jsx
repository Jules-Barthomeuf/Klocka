import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";

// Le marché résidentiel autour du bien, d'après Le Figaro Immobilier.
//
// À quoi ça sert : donner un point de comparaison au commerce. Un investisseur
// qui hésite entre des murs commerciaux et un appartement doit voir les deux
// côte à côte — prix au m², loyer au m², et donc rendement.
//
// Deux échelles : le quartier de l'adresse, qui est celle qui compte, et la
// commune en repère. L'écart entre les deux est souvent parlant à lui seul.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const pourcent = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${String(n).replace(".", ",")} %`);
const teinteEvo = (n) => (n == null ? "#6a7180" : n > 0 ? "#96c0b8" : n < 0 ? "#e8746a" : "#9298a6");

// Le rendement brut d'un appartement acheté au prix médian et loué au loyer
// médian : douze mois de loyer rapportés au prix. C'est la comparaison qui
// intéresse, pas les chiffres pris séparément.
function rendement(prix, loyer) {
  if (!(prix > 0) || !(loyer > 0)) return null;
  return Math.round((loyer * 12 * 1000) / prix) / 10;
}

function Colonne({ titre, niveau, principal = false }) {
  if (!niveau) return null;
  const r = rendement(niveau.prix?.median, niveau.loyer?.median);
  const teinte = principal ? "#d9b46a" : "#f2f3f5";
  return (
    <div className={`border rounded-xl px-4 py-3.5 ${principal ? "border-[#2c3139] bg-[#0f1114]" : "border-[#1f2228] bg-[#0a0a0b]"}`}>
      <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{titre}</p>
      <p className="m-0 mt-0.5 text-[14px] text-[#f2f3f5] truncate">{niveau.nom || "—"}</p>

      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="text-[20px] tabular-nums font-light" style={{ color: teinte }}>{euros(niveau.prix?.median)}</span>
        <span className="text-[12px] text-[#6a7180]">/ m² à l'achat</span>
      </div>
      <p className="m-0 mt-0.5 text-[11.5px] text-[#6a7180] tabular-nums">
        {euros(niveau.prix?.bas)} à {euros(niveau.prix?.haut)}
        <span className="text-[#3a3f4a]"> · </span>
        <span style={{ color: teinteEvo(niveau.prix?.sur_1_an) }}>{pourcent(niveau.prix?.sur_1_an)}</span> sur 1 an
        <span className="text-[#3a3f4a]"> · </span>
        <span style={{ color: teinteEvo(niveau.prix?.sur_5_ans) }}>{pourcent(niveau.prix?.sur_5_ans)}</span> sur 5 ans
      </p>

      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="text-[17px] tabular-nums font-light text-[#f2f3f5]">{euros(niveau.loyer?.median)}</span>
        <span className="text-[12px] text-[#6a7180]">/ m² par mois à la location</span>
      </div>
      <p className="m-0 mt-0.5 text-[11.5px] text-[#6a7180] tabular-nums">
        {niveau.loyer?.bas != null ? <>{euros(niveau.loyer.bas)} à {euros(niveau.loyer.haut)}<span className="text-[#3a3f4a]"> · </span></> : null}
        <span style={{ color: teinteEvo(niveau.loyer?.sur_1_an) }}>{pourcent(niveau.loyer?.sur_1_an)}</span> sur 1 an
        {niveau.loyer?.sur_5_ans != null && (
          <>
            <span className="text-[#3a3f4a]"> · </span>
            <span style={{ color: teinteEvo(niveau.loyer.sur_5_ans) }}>{pourcent(niveau.loyer.sur_5_ans)}</span> sur 5 ans
          </>
        )}
      </p>

      {r != null && (
        <p className="m-0 mt-3 pt-3 border-t border-[#15171b] text-[12.5px] text-[#9298a6]">
          Rendement brut d'un appartement : <span className="tabular-nums" style={{ color: teinte }}>{String(r).replace(".", ",")} %</span>
        </p>
      )}
    </div>
  );
}

export default function MarcheResidentielFigaro({ dossier, lot, apercu = false, onRefresh }) {
  const a = lot?.lot?.adresse?.valeur;
  const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const [adresse, setAdresse] = useState(adresseDossier);
  useEffect(() => { setAdresse((v) => v || adresseDossier); }, [adresseDossier]);

  const [resultat, setResultat] = useState(lot?.prix_residentiel || null);
  useEffect(() => { if (lot?.prix_residentiel) setResultat(lot.prix_residentiel); }, [lot?.prix_residentiel]);

  const chercher = useMutation({
    mutationFn: ({ forcer = false } = {}) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot?.index ?? 0}/figaro/prix`, { body: { adresse, forcer } }),
    onSuccess: (r) => {
      setResultat(r.resultat);
      if (r.resultat?.du_cache) toast.message("Marché résidentiel déjà connu", { description: "Résultat gardé de moins de trente jours. « Relire » interroge Le Figaro de nouveau." });
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Le Figaro n'a pas répondu"),
  });

  // Ce que le commerce rapporte, pour la mise en regard.
  const loyerCommerce = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const prixCommerce = lot?.lot?.prix_fai?.valeur;
  const rendementCommerce = prixCommerce > 0 && loyerCommerce > 0 ? Math.round((loyerCommerce * 1000) / prixCommerce) / 10 : null;
  const niveau = resultat?.quartier || resultat?.commune;
  const rendementAppart = niveau ? rendement(niveau.prix?.median, niveau.loyer?.median) : null;

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Marché résidentiel</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">Ce que coûte et ce que rapporte un appartement au même endroit, d'après Le Figaro Immobilier. Le point de comparaison du commerce.</p>
        </div>
        {(resultat?.quartier?.lien || resultat?.lien) && (
          <a href={resultat.quartier?.lien || resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#9298a6] hover:text-[#96c0b8]">
            Voir sur Le Figaro <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (adresse.trim() && !apercu) chercher.mutate({ forcer: false }); }}
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
          {chercher.isPending ? "Le Figaro cherche…" : "Chercher sur Le Figaro"}
        </button>
        {resultat && !chercher.isPending && (
          <button
            type="button"
            onClick={() => chercher.mutate({ forcer: true })}
            title="Interroger Le Figaro de nouveau, en ignorant le résultat gardé"
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-full border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
          >
            <RefreshCw className="w-3 h-3" /> Relire
          </button>
        )}
      </form>

      {resultat && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[11.5px] text-[#6a7180]">
            {resultat.adresse}
            <span className="text-[#3a3f4a]"> · </span>
            lu le {new Date(resultat.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            {resultat.du_cache && <span className="text-[#3a3f4a]"> · gardé</span>}
          </p>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            <Colonne titre="Le quartier" niveau={resultat.quartier} principal />
            <Colonne titre="La commune" niveau={resultat.commune} />
          </div>

          {/* Le commerce contre l'appartement : c'est pour ça qu'on est venu. */}
          {rendementCommerce != null && rendementAppart != null && (
            <p className="m-0 mt-3 text-[13px] text-[#9298a6]">
              Le commerce présenté rend{" "}
              <span className="tabular-nums text-[#f2f3f5]">{String(rendementCommerce).replace(".", ",")} %</span> brut, contre{" "}
              <span className="tabular-nums text-[#d9b46a]">{String(rendementAppart).replace(".", ",")} %</span> pour un appartement
              {resultat.quartier ? ` dans le quartier ${resultat.quartier.nom}` : ` à ${resultat.commune?.nom}`}
              {rendementCommerce > rendementAppart
                ? ` — soit ${String(Math.round((rendementCommerce / rendementAppart) * 10) / 10).replace(".", ",")} fois mieux.`
                : "."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
