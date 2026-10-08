import React from "react";
import { CellulePour, Case } from "@/components/prospection/AgencesIA";

// La liste des relances (spec du 8 oct. 2026, onglet Liste) : la même pour
// toute l'équipe, en tableau comme la liste d'une ville de la Prospection.
// Une case pour cocher, « Associé à » avec nos photos, l'agent, le motif (dont
// « Retenter »), la ville, l'échéance. Les lignes cochées se suppriment ou
// repartent en prospection. Une ligne ouverte par un collègue est grisée
// (« En cours : Maxime ») et ne s'ouvre pas ; la mienne se rouvre.

const jourCourt = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const TONS_MOTIF = {
  bien_retenu: "bg-menthe/15 text-menthe",
  bien_refuse: "bg-alerte/15 text-alerte",
  engagement: "bg-ambre/15 text-ambre",
  fiche_non_recue: "bg-ambre/15 text-ambre",
  point_mensuel: "bg-relief text-craie",
  retenter: "bg-ambre/15 text-ambre",
};
const tonDuMotif = (cle) => TONS_MOTIF[cle] || "bg-relief text-craie";

export default function ListeRelances({ lignes, prises, moi, onOuvrir, ouverture = null, coches, setCoches }) {
  const basculer = (cle) => setCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const toutes = lignes.length > 0 && lignes.every((x) => coches.has(x.cle));
  const th = "border-b border-trait px-4 py-3.5 font-normal text-encre";
  return (
    <div className="mt-4 overflow-x-auto rounded-[16px] border border-trait">
      <table className="w-full min-w-[760px] border-collapse text-left text-[14px] max-md:min-w-0">
        <thead className="max-md:hidden">
          <tr className="text-[12.5px] text-encre">
            <th className="w-[52px] border-b border-trait py-3.5 pl-5 pr-1">
              <button type="button" onClick={() => setCoches(toutes ? new Set() : new Set(lignes.map((x) => x.cle)))} aria-label={toutes ? "Tout décocher" : "Tout cocher"} className="grid place-items-center" style={{ background: "transparent" }}><Case oui={toutes} /></button>
            </th>
            <th className={th}>Associé à</th>
            <th className={th}>Agent</th>
            <th className={th}>Motif</th>
            <th className={th}>Ville</th>
            <th className={th}>Échéance</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((x) => {
            const p = prises[x.cle] || null;
            const autre = !!p && p.par !== moi;
            const enOuverture = ouverture === x.cle;
            const ouvrir = () => { if (!autre && !ouverture) onOuvrir(x); };
            return (
              <tr key={x.cle} onClick={ouvrir} title={autre ? `En cours : ${p.prenom}` : "Ouvrir le mode appel sur cet agent"}
                className={`align-top transition-colors [&>td]:border-b [&>td]:border-trait [&:last-child>td]:border-b-0 ${autre ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-relief/30"} ${coches.has(x.cle) ? "bg-menthe/[0.05]" : ""} ${enOuverture ? "bg-menthe/[0.08]" : ""}`}>
                <td className="py-4 pl-5 pr-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => basculer(x.cle)} aria-label={`Cocher ${x.nom || x.agence}`} className="grid place-items-center" style={{ background: "transparent" }}><Case oui={coches.has(x.cle)} /></button>
                </td>
                <td className="px-3 py-3 max-md:hidden" onClick={(e) => e.stopPropagation()}>
                  {x.agence_id ? <CellulePour agence={{ id: x.agence_id, pour: x.pour || [] }} listeId={null} /> : <span className="text-[12.5px] text-brume">—</span>}
                </td>
                <td className="max-w-[320px] px-4 py-4">
                  <span className="block truncate text-encre">{x.nom || x.agence}</span>
                  {x.nom && x.agence && <span className="block truncate text-[13px] text-ardoise">{x.agence}</span>}
                  {p && <span className={`mt-0.5 block text-[12.5px] ${autre ? "text-ardoise" : "text-menthe"}`}>{autre ? `En cours : ${p.prenom}` : "Ouverte par vous"}</span>}
                  {/* Au téléphone : le motif, la ville et l'échéance sous le nom. */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
                    <span className={`rounded-full px-2 py-0.5 text-[12px] ${tonDuMotif(x.motif.cle)}`}>{x.motif.libelle}</span>
                    {x.ville && <span className="text-[12.5px] text-ardoise">{x.ville}</span>}
                    <span className={`text-[12.5px] ${x.groupe === "retard" ? "text-ambre" : "text-ardoise"}`}>{x.groupe === "retard" ? `En retard de ${x.retard} j` : "Aujourd'hui"}</span>
                  </span>
                </td>
                <td className="px-4 py-4 max-md:hidden"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] ${tonDuMotif(x.motif.cle)}`}>{x.motif.libelle}</span></td>
                <td className="truncate px-4 py-4 text-craie max-md:hidden">{x.ville || <span className="text-bord-vif">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[13.5px] tabular-nums max-md:hidden" title={x.le ? jourCourt(x.le) : undefined}>
                  {x.groupe === "retard" ? <span className="text-ambre">En retard de {x.retard} j</span> : <span className="text-craie">Aujourd'hui</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
