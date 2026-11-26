import React, { useMemo } from "react";
import { ArrowDown } from "lucide-react";
import DefileCarte from "./DefileCarte";
import { friseBornee, jalonsDuBail, fermeDuProjet, personnaliserJalons } from "@/lib/frise-bail";
import { useEdition } from "./EditionEnPlace";
import { PointsDeLaFrise } from "./CasesProjet";

// La chronologie du bail, une étape à la fois (26 nov. 2026, Jules, sur le prototype qu'il a retouché : « voici
// exactement comment je veux que ça se passe ; à droite, c'est la vision de base ; à gauche, dès qu'on ouvre un
// document, ça s'affiche dans la carte »). On arrive sur Aujourd'hui, allumé au centre ; la précédente et la suivante se
// lisent au-dessus et au-dessous, assombries, repliées sur leur nom et leur date. On défile (molette, doigt, flèches
// du clavier ou les deux boutons), l'étape centrée s'allume et dit ce qui se passe ; « Voir la source » ouvre la pièce
// du dossier dans l'étape même, à sa page, le passage surligné, et devient « Masquer la source ». À gauche, le rail des
// étapes (mois et année), relié d'un fil, pour sauter à une date.
//
// Aux jalons de la frise (prise d'effet, période ferme, triennales, échéance) s'ajoutent, déduits d'eux, les derniers
// jours pour donner congé (six mois avant chaque sortie) et Aujourd'hui.

const longue = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const moisEntre = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
const duree = (m) => {
  const ans = Math.floor(m / 12);
  const mois = m % 12;
  return [ans ? `${ans} an${ans > 1 ? "s" : ""}` : "", mois ? `${mois} mois` : ""].filter(Boolean).join(" et ") || "moins d'un mois";
};
const moinsSix = (d) => { const x = new Date(d); x.setMonth(x.getMonth() - 6); return x; };
const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Pure : les étapes, dans l'ordre des dates, Aujourd'hui compris. `jalons` : ceux de la frise (dates en Date). */
export function etapesDuBail(jalons, { maintenant = new Date(), loyer = null, loyerSignature = null, typeBail = null } = {}) {
  const auj = new Date(maintenant); auj.setHours(0, 0, 0, 0);
  const fin = jalons.find((j) => j.cle === "fin")?.date || null;
  const debut = jalons.find((j) => j.cle === "debut")?.date || null;
  const sorties = jalons.filter((j) => /^triennale-|^fin$/.test(j.cle));
  // La prochaine sortie que le locataire peut encore prendre (son délai de congé n'est pas passé).
  const sortieLibre = sorties.find((s) => moinsSix(s.date) >= auj) || null;

  const etapes = [];
  for (const j of jalons) {
    const date = new Date(j.date);
    if (/^triennale-|^fin$/.test(j.cle)) {
      const limite = moinsSix(date);
      const passe = limite < auj;
      etapes.push({
        cle: `conge-${j.cle}`, date: limite, quoi: `Limite de congé · ${j.cle === "fin" ? "fin du bail" : j.label.replace(" échéance triennale", " triennale")}`,
        texte: passe && date > auj
          ? `Dernier jour pour donner congé à cette échéance. <span class="k-chrono-alerte">Ce délai est passé</span> : le locataire ne peut plus partir le ${longue(date)}${sortieLibre ? ` ; sa prochaine sortie possible est le <strong>${longue(sortieLibre.date)}</strong>` : ""}.`
          : `Dernier jour pour que le locataire donne congé ${j.cle === "fin" ? "ou demande le renouvellement, pour la fin du bail" : `à la ${j.label.toLowerCase()}`}, six mois avant elle.`,
        source: true,
      });
    }
    let texte;
    if (j.cle === "debut") {
      const ans = fin && debut ? Math.round(moisEntre(debut, fin) / 12) : null;
      texte = `Le bail prend effet${ans ? ` pour <strong>${ans} ans</strong>` : ""}${typeBail ? ` (${typeBail})` : ""}${loyerSignature ? `, avec un loyer de signature de <strong>${loyerSignature}</strong>` : ""}. Le locataire entre dans les lieux.`;
    } else if (j.cle === "fin-ferme") {
      texte = "Fin de la période ferme : à partir d'ici, le locataire peut donner congé aux échéances triennales.";
    } else if (/^triennale-/.test(j.cle)) {
      const conge = moinsSix(date);
      texte = `Fin d'une période de trois ans, et révision possible du loyer sur l'indice prévu au bail. ${conge < auj && date > auj ? "Le délai de congé étant passé, le bail continue : rien ne change pour l'investisseur." : `Le locataire peut partir s'il a donné congé avant le <strong>${longue(conge)}</strong>.`}`;
    } else if (j.cle === "fin") {
      texte = "Fin du bail. Sans congé ni renouvellement, il se <strong>prolonge tacitement</strong> aux mêmes conditions.";
    } else {
      texte = j.detail || "";
    }
    etapes.push({ cle: j.cle, date, quoi: j.label, texte, source: true });
  }
  etapes.sort((a, b) => a.date - b.date);

  // Aujourd'hui, à sa place.
  const restant = fin ? moisEntre(auj, fin) : null;
  const prochaineSortie = sorties.find((s) => s.date > auj && s.cle !== "fin") || null;
  const mS = prochaineSortie ? moisEntre(auj, prochaineSortie.date) : null;
  const congeLibre = prochaineSortie && moinsSix(prochaineSortie.date) >= auj;
  const phrases = [
    restant != null && restant >= 0 ? `Il reste <strong>${duree(restant)}</strong> avant la fin du bail, le ${longue(fin)}.` : fin ? "Le bail est arrivé à son échéance." : "",
    prochaineSortie ? `La prochaine échéance triennale tombe dans <strong>${duree(mS)}</strong>, le ${longue(prochaineSortie.date)}.` : "",
  ].filter(Boolean).join(" ");
  const engagement = prochaineSortie
    ? congeLibre
      ? `Le locataire peut encore donner congé pour cette échéance, jusqu'au ${longue(moinsSix(prochaineSortie.date))}.`
      : `<span class="k-chrono-alerte">Le délai de congé pour cette échéance est passé</span> : le locataire est engagé au moins jusqu'au <strong>${longue((sortieLibre || { date: fin }).date)}</strong>.`
    : "";
  const iAuj = etapes.filter((e) => e.date <= auj).length;
  const prochaine = etapes.find((e) => e.date > auj) || null;
  etapes.splice(iAuj, 0, { cle: "aujourdhui", aujourdhui: true, date: auj, texte: phrases, engagement, loyer, prochaine });
  return etapes;
}

// La clause du bail qui dit chaque étape : un renvoi « Voir la clause » descend sur elle (26 nov. 2026, Jules).
const CLAUSE_DE = (cle) => (cle === "debut" || cle === "fin" ? "dates_bail" : /^triennale-|^conge-|^fin-ferme$/.test(cle) ? "type_bail" : null);

export default function ChronologieBail({ frise, lignes, project, dealId = null, loyerSignature = null, clauses = [], onClause = null }) {
  const edition = useEdition();
  const bornee = useMemo(() => friseBornee(frise), [frise]);
  const perso = edition?.valeurs?.frise_perso || project?.frise_perso || null;
  const { etapes, marques } = useMemo(() => {
    if (!bornee) return { etapes: [], marques: [] };
    const { jalons } = jalonsDuBail(bornee, { ferme: fermeDuProjet(project, lignes) });
    const marques = personnaliserJalons(jalons.map((j) => (j.cle === bornee.estime ? { ...j, label: `${j.label} estimée` } : j)), perso, bornee);
    const datees = marques.map((j) => ({ ...j, date: new Date(j.date) })).filter((j) => !Number.isNaN(j.date.getTime()));
    const loyer = Number(project?.sim_loyer_initial_ht) > 0 ? `${euros(project.sim_loyer_initial_ht)} HT/an` : null;
    return { marques, etapes: etapesDuBail(datees, { loyer, loyerSignature, typeBail: project?.type_bail || null }) };
  }, [bornee, lignes, project, perso, loyerSignature]);

  if (!etapes.length) return null;
  const source = frise?.source?.document_url ? frise.source : null;
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const iAuj = etapes.findIndex((e) => e.aujourdhui);
  const prochaineCle = etapes[iAuj]?.prochaine?.cle;

  const vues = etapes.map((e) => {
    const passe = e.aujourdhui || e.date <= auj;
    const m = e.aujourdhui ? null : Math.abs(moisEntre(passe ? e.date : auj, passe ? auj : e.date));
    const quand = e.aujourdhui ? null : passe ? `il y a ${duree(m)}` : `dans ${duree(m)}`;
    const prochaine = !e.aujourdhui && prochaineCle === e.cle;
    return {
      cle: e.cle,
      rail: e.aujourdhui ? "Aujourd'hui" : `${e.quoi} · ${longue(e.date)}`,
      passee: passe,
      accent: !!e.aujourdhui,
      entete: (
        <>
          {e.aujourdhui
            ? <span aria-hidden className="h-3.5 w-3.5 flex-none rounded-full bg-encre ring-[5px] ring-menthe/20" />
            : <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-full border-2 border-menthe ${passe ? "bg-menthe" : "bg-surface-pleine"}`} />}
          <span className="min-w-0 truncate">{e.aujourdhui ? "Aujourd'hui" : e.quoi}</span>
          {quand && <span className={`ml-auto flex-none tabular-nums ${prochaine ? "text-menthe" : "text-brume"}`}>{prochaine ? "Prochaine étape · " : ""}{quand}</span>}
        </>
      ),
      titre: longue(e.date),
      corps: (
        <>
          {e.texte && <p className="k-chrono-texte m-0 max-w-[58ch] text-[15px] leading-[1.6] text-craie [text-wrap:pretty]" dangerouslySetInnerHTML={{ __html: e.texte }} />}
          {e.engagement && <p className="k-chrono-texte m-0 max-w-[58ch] text-[15px] leading-[1.6] text-craie" dangerouslySetInnerHTML={{ __html: e.engagement }} />}
          {e.aujourdhui && (e.loyer || e.prochaine) && (
            <div className="mt-0.5 flex flex-wrap gap-x-6 gap-y-2">
              {e.loyer && <div><div className="text-[16px] font-medium tracking-[-0.01em] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{e.loyer}</div><div className="mt-0.5 text-[13.5px] text-ardoise">Loyer en cours</div></div>}
              {e.prochaine && <div><div className="text-[16px] font-medium tracking-[-0.01em] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{longue(e.prochaine.date)}</div><div className="mt-0.5 text-[13.5px] text-ardoise">Prochaine étape · {e.prochaine.quoi.toLowerCase()}</div></div>}
            </div>
          )}
          {(() => {
            const id = CLAUSE_DE(e.cle);
            const cl = id && onClause ? clauses.find((c) => c.id === id && c.texte) : null;
            return cl ? (
              <button type="button" onClick={() => onClause(id)} className="mt-0.5 inline-flex items-center gap-1.5 self-start border-b border-bord-doux pb-px text-[13.5px] text-craie transition-colors hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}>
                <ArrowDown className="h-3.5 w-3.5" />Voir la clause · {cl.titre}
              </button>
            ) : null;
          })()}
        </>
      ),
      source: e.source ? source : null,
      libelleSource: source ? `Voir la source${source.page ? ` · bail p. ${source.page}` : ""}` : null,
    };
  });

  return (
    <DefileCarte titre="Chronologie" etapes={vues} depart={Math.max(0, iAuj)} dealId={dealId}
      apres={edition?.onChamp ? <div className="px-7 pb-6 max-md:px-5"><PointsDeLaFrise marques={marques} perso={perso} onChange={(p) => edition.onChamp("frise_perso", p, true)} /></div> : null} />
  );
}
