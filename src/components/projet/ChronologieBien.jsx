import React from "react";
import { Carte, TitreCarte } from "./Cartes";
import { evenementsDuBien, libelleDate } from "@/lib/chronologie-bien";
import { useEdition, ValeurForcee, forcee, estMasque } from "./EditionEnPlace";

// La chronologie du bien, dans l'onglet Bien : l'histoire des murs et du
// locataire, puis ce qui va arriver au bail. Les étapes du projet avec Klocka
// n'y figurent pas : c'est l'histoire du bien, pas celle du dossier.
//
// Tout vient de ce que le projet porte déjà : ventes publiées (DVF), dates du
// locataire et du bail, cessions de fonds relevées à l'adresse, assemblées
// générales enregistrées. Un événement sans date n'apparaît pas.

function Point({ e }) {
  const teinte = e.futur ? (e.alerte ? "border-ambre bg-ambre" : "border-encre bg-fond") : "border-ardoise bg-ardoise";
  return <span className={`relative z-10 block h-4 w-4 flex-none rounded-full border-2 ${teinte}`} />;
}

// Dans l'éditeur, la date, le titre et le détail de chaque événement se
// corrigent au clic (valeurs forcées), et l'événement se retire de la frise ;
// retiré, il reste pâle dans l'éditeur, le temps de le remettre.
function Evenement({ e }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const cle = `chrono:${e.cle}`;
  const basculer = () => {
    const liste = edition.masques || [];
    edition.onChamp("champs_masques", e.masque ? liste.filter((c) => c !== cle) : [...liste, cle], true);
  };
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${e.masque ? "opacity-40" : ""}`}>
      <span className={`text-[14.5px] ${e.futur ? (e.alerte ? "text-ambre" : "text-encre") : "text-ardoise"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        <ValeurForcee cle={`chrono_${e.cle}_date`} type="text">{e.date}</ValeurForcee>
      </span>
      <span className={`text-[17px] font-medium leading-[1.3] ${e.futur ? "text-encre" : "text-craie"}`}>
        <ValeurForcee cle={`chrono_${e.cle}_titre`} type="text">{e.titre}</ValeurForcee>
      </span>
      {(e.detail || enEdition) && (
        <span className="text-[14px] leading-[1.4] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
          <ValeurForcee cle={`chrono_${e.cle}_detail`} type="text">{e.detail || "+ détail"}</ValeurForcee>
        </span>
      )}
      {enEdition && (
        <button type="button" onClick={basculer} className="self-start border-0 bg-transparent p-0 text-[12px] text-brume transition-colors hover:text-encre">
          {e.masque ? "Remettre" : "Retirer"}
        </button>
      )}
    </div>
  );
}

/** Le repère d'aujourd'hui, entre le passé et le futur. */
function Aujourdhui() {
  return (
    <span className="relative z-10 inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[14px] text-sur-menthe">
      Aujourd'hui
    </span>
  );
}

export default function ChronologieBien({ project, friseLue = null }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const evenements = evenementsDuBien(project, friseLue)
    .map((e) => ({
      ...e,
      date: forcee(project, `chrono_${e.cle}_date`) || libelleDate(e),
      titre: forcee(project, `chrono_${e.cle}_titre`) || e.titre,
      detail: forcee(project, `chrono_${e.cle}_detail`) || e.detail,
      masque: estMasque(edition, `chrono:${e.cle}`),
    }))
    .filter((e) => enEdition || !e.masque);
  if (evenements.length < 2) return null;
  const iAujourdhui = evenements.findIndex((e) => e.futur);
  const avant = iAujourdhui < 0 ? evenements : evenements.slice(0, iAujourdhui);
  const apres = iAujourdhui < 0 ? [] : evenements.slice(iAujourdhui);

  return (
    <Carte grille={false} className="p-7 max-md:p-5">
      <TitreCarte titre="Chronologie" sous="L'histoire des murs et du locataire, puis ce qui attend le bail" />

      {/* Bureau : une frise horizontale, qui défile si elle déborde. */}
      <div className="mt-6 overflow-x-auto pb-2 max-md:hidden [scrollbar-width:thin]">
        <div className="relative flex min-w-max items-start gap-0">
          <span className="absolute left-0 right-0 top-[15.5px] h-px bg-encre" />
          {avant.map((e) => (
            <div key={e.cle} className="flex w-[230px] flex-none flex-col gap-4 pr-6">
              <div className="flex h-8 items-center"><Point e={e} /></div>
              <Evenement e={e} />
            </div>
          ))}
          <div className="flex flex-none flex-col gap-4 pr-6"><div className="flex h-8 items-center"><Aujourdhui /></div></div>
          {apres.map((e) => (
            <div key={e.cle} className="flex w-[230px] flex-none flex-col gap-4 pr-6">
              <div className="flex h-8 items-center"><Point e={e} /></div>
              <Evenement e={e} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile : la même frise, à la verticale. */}
      <ol className="relative m-0 mt-6 hidden list-none flex-col gap-6 pl-0 max-md:flex">
        <span className="absolute bottom-2 left-[7.5px] top-2 w-px bg-encre" />
        {avant.map((e) => <li key={e.cle} className="flex gap-4"><div className="pt-1"><Point e={e} /></div><Evenement e={e} /></li>)}
        <li className="-ml-1"><Aujourdhui /></li>
        {apres.map((e) => <li key={e.cle} className="flex gap-4"><div className="pt-1"><Point e={e} /></div><Evenement e={e} /></li>)}
      </ol>
    </Carte>
  );
}
