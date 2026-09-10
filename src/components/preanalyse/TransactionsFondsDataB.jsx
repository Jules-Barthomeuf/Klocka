import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import PenseeIA from "@/components/PenseeIA";
import ConnexionExterne from "@/components/preanalyse/ConnexionExterne";
import CarteCessions from "@/components/projet/CarteCessions";

// Les cessions de fonds de commerce autour du bien, d'après Data-B.
//
// Le loyer dit ce que vaut le mur ; le fonds dit ce que vaut le commerce. Une
// rue où les fonds se vendent cher et souvent est une rue recherchée ; une rue
// sans cession depuis des années l'est moins. Et quand une cession tombe au
// numéro même du bien, on tient le prix du commerce qu'on achète les murs.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const annee = (iso) => (iso ? new Date(iso).getFullYear() : "—");

const ETAPES = [
  { court: "Connexion à Data-B", ligne: "Je me connecte sur Data-B", legende: "Authentification sur la plateforme, session ouverte." },
  { court: "Ouverture des transactions", ligne: "J'ouvre Transaction de fonds", legende: "Le module des cessions de fonds de commerce." },
  { court: "Saisie de l'adresse", ligne: "Je saisis l'adresse du bien", legende: "L'adresse est géocodée, puis le rayon de recherche est posé." },
  { court: "Lecture des cessions", ligne: "Je relève les cessions", legende: "Enseigne, activité, date, adresse et prix, une par une." },
  { court: "Repérage de la rue", ligne: "Je mets la rue à part", legende: "Ce qui s'est vendu dans la rue, et au numéro du bien." },
  { court: "Retour dans l'application", ligne: "Je remonte la donnée dans l'application", legende: "Le marché du quartier, celui de la rue, et les cessions récentes." },
];
const ATTEND_A = 3;

// Une ligne de chiffres : la fourchette et le rythme d'un périmètre.
function Perimetre({ titre, m, teinte = "#f2f3f5" }) {
  if (!m) return null;
  return (
    <div className="border border-[#1f2228] rounded-xl px-4 py-3 bg-[#0f1114]">
      <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{titre}</p>
      <p className="m-0 mt-1 text-[17px] tabular-nums font-light" style={{ color: teinte }}>
        {euros(m.prix_median)}
      </p>
      <p className="m-0 mt-0.5 text-[11.5px] text-[#6a7180] tabular-nums">
        {euros(m.prix_bas)} à {euros(m.prix_haut)}
      </p>
      <p className="m-0 mt-1.5 text-[12px] text-[#9298a6]">
        {m.nombre} cession{m.nombre > 1 ? "s" : ""}
        {m.par_an ? <> · {String(m.par_an).replace(".", ",")} par an</> : null}
      </p>
    </div>
  );
}

export default function TransactionsFondsDataB({ dossier, lot, apercu = false, onRefresh }) {
  const a = lot?.lot?.adresse?.valeur;
  const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const [adresse, setAdresse] = useState(adresseDossier);
  useEffect(() => { setAdresse((v) => v || adresseDossier); }, [adresseDossier]);

  const [resultat, setResultat] = useState(lot?.transactions_fonds || null);
  useEffect(() => { if (lot?.transactions_fonds) setResultat(lot.transactions_fonds); }, [lot?.transactions_fonds]);
  const [tout, setTout] = useState(false);

  const [ecran, setEcran] = useState(false);
  const ecranRef = useRef(false);
  ecranRef.current = ecran;
  const [pret, setPret] = useState(false);
  const enAttente = useRef(null);

  const poser = (res) => {
    setResultat(res);
    if (res?.du_cache) toast.message("Transactions déjà connues", { description: "Résultat gardé de moins de trente jours. « Relire » interroge Data-B de nouveau." });
    onRefresh?.();
  };

  const chercher = useMutation({
    mutationFn: ({ forcer = false } = {}) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot?.index ?? 0}/data-b/transactions`, { body: { adresse, forcer } }),
    onSuccess: (r) => {
      if (!ecranRef.current || r.resultat?.du_cache) { setEcran(false); poser(r.resultat); return; }
      enAttente.current = r.resultat;
      setPret(true);
    },
    onError: (e) => { setEcran(false); toast.error(e?.message || "Data-B n'a pas répondu"); },
  });

  const lancer = (forcer) => { enAttente.current = null; setPret(false); setEcran(true); chercher.mutate({ forcer }); };
  const finir = () => { setEcran(false); if (enAttente.current) poser(enAttente.current); enAttente.current = null; };

  // La liste sert à lire quelques cessions, pas à les parcourir toutes : la
  // carte du projet s'en charge. On en montre huit, quarante au plus.
  const lignes = (resultat?.transactions || []).slice(0, 40);
  const visibles = tout ? lignes : lignes.slice(0, 8);
  const activite = lot?.lot?.locataire_activite?.valeur || null;

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Cessions de fonds autour</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">Les fonds de commerce vendus à moins de 500 m, d'après Data-B. Le loyer dit ce que vaut le mur, le fonds dit ce que vaut le commerce.</p>
        </div>
        {resultat?.lien && (
          <a href={resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#9298a6] hover:text-[#96c0b8]">
            Voir sur Data-B <ExternalLink className="w-3 h-3" />
          </a>
        )}
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
          className="flex-1 min-w-[240px] bg-transparent border border-[#2c3139] focus:border-[#f2f3f5] rounded-full px-4 py-2 outline-none text-[13.5px] text-[#f2f3f5] placeholder:text-[#3a3f4a] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={apercu || chercher.isPending || !adresse.trim()}
          className="inline-flex items-center gap-2 text-[12.5px] px-3.5 py-2 rounded-full bg-[#96c0b8] text-[#0b0c0e] font-semibold hover:bg-[#abd0c8] disabled:opacity-40"
        >
          {chercher.isPending ? <PenseeIA etat="searching" taille={20} /> : <Search className="w-3.5 h-3.5" />}
          {chercher.isPending ? "Data-B cherche…" : "Chercher les cessions"}
        </button>
        {resultat && !chercher.isPending && (
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

      {resultat && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[11.5px] text-[#6a7180]">
            {resultat.adresse}
            <span className="text-[#3a3f4a]"> · </span>{resultat.rayon}
            <span className="text-[#3a3f4a]"> · </span>{resultat.total} cessions depuis {annee(resultat.marche?.depuis)}
            <span className="text-[#3a3f4a]"> · </span>lu le {new Date(resultat.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
            {resultat.du_cache && <span className="text-[#3a3f4a]"> · gardé</span>}
          </p>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            <Perimetre titre={`Autour · ${resultat.rayon}`} m={resultat.marche} />
            {/* Le nom porte déjà « Rue », « Avenue »… : ne pas le redoubler. */}
            <Perimetre titre={resultat.rue?.nom || "Dans la rue"} m={resultat.rue} teinte="#d9b46a" />
          </div>

          {/* Ce qui touche le bien lui-même. */}
          {resultat.sur_place > 0 && (
            <p className="m-0 mt-3 text-[13px] text-[#96c0b8]">
              {resultat.sur_place} cession{resultat.sur_place > 1 ? "s" : ""} au numéro même du bien : le prix du commerce est connu.
            </p>
          )}
          {activite && resultat.rue?.activites?.length ? (
            <p className="m-0 mt-2 text-[12.5px] text-[#6a7180]">
              Activité du locataire : {activite}.
              {" "}Dans la rue, on vend surtout {resultat.rue.activites.slice(0, 3).map((x) => x.nom.toLowerCase()).join(", ")}.
            </p>
          ) : null}

          {/* Les cessions autour du bien : on les voit avant de les lire. */}
          <div className="mt-4">
            <CarteCessions
              resultat={resultat}
              titre={lot?.lot?.locataire_nom?.valeur || "Le bien"}
              adresse={resultat.adresse}
              hauteur={360}
            />
          </div>

          {/* Les cessions, le proche d'abord. */}
          <div className="mt-5">
            {visibles.map((t, i) => (
              <div
                key={`${t.date}-${t.enseigne}-${i}`}
                className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[#15171b]"
              >
                <div className="min-w-0">
                  <p className="m-0 text-[13.5px] text-[#f2f3f5] truncate">
                    {t.enseigne}
                    {t.sur_place && <span className="ml-2 text-[11px] text-[#96c0b8]">au numéro du bien</span>}
                    {!t.sur_place && t.dans_la_rue && <span className="ml-2 text-[11px] text-[#d9b46a]">dans la rue</span>}
                  </p>
                  <p className="m-0 text-[11.5px] text-[#6a7180] truncate">
                    {[t.activite, jour(t.date), t.adresse].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="m-0 text-[14px] tabular-nums font-light text-[#f2f3f5] whitespace-nowrap">{euros(t.prix)}</p>
              </div>
            ))}
            {lignes.length > 8 && (
              <button
                type="button"
                onClick={() => setTout((v) => !v)}
                className="mt-3 text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5]"
              >
                {tout ? "Voir moins" : `Voir les ${lignes.length} cessions retenues`}
              </button>
            )}
          </div>
        </div>
      )}

      {ecran && (
        <ConnexionExterne service="Data-B" etapes={ETAPES} attendA={ATTEND_A} pret={pret} dureeEtape={2800} onFini={finir} />
      )}
    </section>
  );
}
