import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { libellePage } from "@/components/monitoring/UsagePlateforme";
import { CLASSE_TABLEAU, CLASSE_TABLE, CLASSE_TH, CLASSE_TD } from "@/components/mandataire/elements";

// Les temps de chargement (11 nov. 2026, Jules) : par page, ce que vit la personne (mesuré par son navigateur) ; par
// route de l'API, ce que le serveur met à répondre depuis son dernier démarrage. Le calcul vit dans
// server/temps-chargement.js.

const duree = (ms) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : `${ms} ms`);
// Lent passé 2 s, à surveiller passé 1 s : la couleur sur le temps des 10 % les plus lents seulement.
const teinte = (ms) => (ms >= 2000 ? "!text-statut-corail" : ms >= 1000 ? "!text-ambre" : "");
function ecart(m, avant) {
  if (m == null || !avant) return "—";
  const e = Math.round(((m - avant) / avant) * 100);
  return e === 0 ? "=" : e > 0 ? `+${e} %` : `${e} %`;
}

function Tableau({ colonnes, largeurs, lignes }) {
  return (
    <div className={CLASSE_TABLEAU}>
      <table className={CLASSE_TABLE}>
        <colgroup>{largeurs.map((l, i) => <col key={i} style={l ? { width: l } : undefined} />)}</colgroup>
        <thead><tr>{colonnes.map((c) => <th key={c} className={CLASSE_TH}>{c}</th>)}</tr></thead>
        <tbody className="tabular-nums">{lignes}</tbody>
      </table>
    </div>
  );
}

export default function TempsDeChargement({ jours }) {
  const { data } = useQuery({
    queryKey: ["monitoring-chargements", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/chargements?jours=${jours}`),
    placeholderData: (prev) => prev,
  });
  if (!data) return null;
  return (
    <section className="mb-8 flex flex-col gap-3" aria-label="Temps de chargement">
      <h2 className="m-0 text-[18px] font-normal text-encre">Temps de chargement</h2>
      {data.pages.length ? (
        <Tableau
          colonnes={["Page", "Ouvertures", "Habituel", "10 % les plus lents", "Période d'avant"]}
          largeurs={[null, "110px", "110px", "150px", "130px"]}
          lignes={data.pages.map((p) => (
            <tr key={p.page}>
              <td className={CLASSE_TD}>{libellePage(p.page)}</td>
              <td className={CLASSE_TD}>{p.n}</td>
              <td className={CLASSE_TD}>{duree(p.mediane)}</td>
              <td className={`${CLASSE_TD} ${teinte(p.p90)}`}>{duree(p.p90)}</td>
              <td className={CLASSE_TD}>{ecart(p.mediane, p.mediane_avant)}</td>
            </tr>
          ))}
        />
      ) : (
        <p className="m-0 text-[13.5px] text-ardoise">Aucun chargement mesuré sur la période : la mesure a commencé le 11 novembre 2026.</p>
      )}
      {data.routes.length > 0 && (
        <>
          <p className="m-0 mt-2 text-[12.5px] text-ardoise">Ce que le serveur met à répondre, route par route, depuis son dernier démarrage</p>
          <Tableau
            colonnes={["Route", "Appels", "Habituel", "10 % les plus lents", "Le plus long"]}
            largeurs={[null, "90px", "110px", "150px", "120px"]}
            lignes={data.routes.map((r) => (
              <tr key={r.route}>
                <td className={`${CLASSE_TD} font-mono text-[12.5px]`} title={r.route}>{r.route}</td>
                <td className={CLASSE_TD}>{r.n}</td>
                <td className={CLASSE_TD}>{duree(r.mediane)}</td>
                <td className={`${CLASSE_TD} ${teinte(r.p90)}`}>{duree(r.p90)}</td>
                <td className={CLASSE_TD}>{duree(r.max)}</td>
              </tr>
            ))}
          />
        </>
      )}
      <p className="m-0 text-[12px] leading-[1.6] text-brume">
        Une page est chargée quand plus aucune de ses données n'est en route ; la première page d'une visite compte aussi le chargement du site.
        Habituel : la moitié des chargements vont plus vite. En ambre au-delà d'une seconde, en corail au-delà de deux.
      </p>
    </section>
  );
}
