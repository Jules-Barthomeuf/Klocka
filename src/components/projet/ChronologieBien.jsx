import React from "react";
import { Plus, X } from "lucide-react";
import { Carte, TitreCarte } from "./Cartes";
import { evenementsDuBien, libelleDate, chronologiePerso } from "@/lib/chronologie-bien";
import { useEdition, ValeurForcee, forcee, estMasque } from "./EditionEnPlace";

// La chronologie du bien, dans l'onglet Bien : l'histoire des murs et du
// locataire, puis ce qui va arriver au bail. Les étapes du projet avec Klocka
// n'y figurent pas : c'est l'histoire du bien, pas celle du dossier.
//
// Tout vient de ce que le projet porte déjà : ventes publiées (DVF), dates du
// locataire et du bail, cessions de fonds relevées à l'adresse, assemblées
// générales enregistrées. Un événement sans date n'apparaît pas.

function Point({ e }) {
  const teinte = e.futur ? (e.alerte ? "border-menthe bg-menthe" : "border-encre bg-fond") : "border-ardoise bg-ardoise";
  return <span className={`relative z-10 block h-4 w-4 flex-none rounded-full border-2 ${teinte}`} />;
}

// Dans l'éditeur, les points se corrigent sous la frise (PointsDeLaChronologie), comme ceux du bail ; un point retiré
// reste pâle dans l'éditeur, le temps de le remettre.
function Evenement({ e }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${e.masque ? "opacity-40" : ""}`}>
      <span className={`text-[14.5px] ${e.futur ? (e.alerte ? "text-menthe" : "text-encre") : "text-ardoise"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        <ValeurForcee cle={`chrono_${e.cle}_date`} type="text">{e.date}</ValeurForcee>
      </span>
      <span className={`text-[17px] font-medium leading-[1.3] ${e.futur ? "text-encre" : "text-craie"}`}>
        <ValeurForcee cle={`chrono_${e.cle}_titre`} type="text">{e.titre}</ValeurForcee>
      </span>
      {e.detail && (
        <span className="text-[14px] leading-[1.4] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
          <ValeurForcee cle={`chrono_${e.cle}_detail`} type="text">{e.detail}</ValeurForcee>
        </span>
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
  // Les points corrigés ou ajoutés à la main (16 nov. 2026, Jules) : gardés à part sur le projet (`chrono_perso`).
  const perso = edition?.valeurs?.chrono_perso || project?.chrono_perso || null;
  const tous = chronologiePerso(evenementsDuBien(project, friseLue), perso);
  const evenements = tous
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
      {/* Plus de sous-titre (16 nov. 2026, Jules). */}
      <TitreCarte titre="Chronologie" />

      {/* Bureau : une frise horizontale, qui défile si elle déborde. Les colonnes s'étirent sur toute la largeur ; la
          dernière garde ses 230 px, et la ligne s'arrête à son point : pas de blanc après la fin du bail (19 oct. 2026, Jules). */}
      <div className="mt-6 overflow-x-auto pb-2 max-md:hidden [scrollbar-width:thin]">
        <div className="relative flex w-full min-w-max items-start gap-0">
          <span className={`absolute left-0 top-[15.5px] h-px bg-encre ${apres.length ? "right-[222px]" : "right-0"}`} />
          {avant.map((e) => (
            <div key={e.cle} className="flex w-[230px] flex-[1_0_auto] flex-col gap-4 pr-6">
              <div className="flex h-8 items-center"><Point e={e} /></div>
              <Evenement e={e} />
            </div>
          ))}
          <div className={`flex flex-none flex-col gap-4 ${apres.length ? "pr-6" : ""}`}><div className="flex h-8 items-center"><Aujourdhui /></div></div>
          {apres.map((e, i) => (
            <div key={e.cle} className={`flex w-[230px] flex-col gap-4 pr-6 ${i === apres.length - 1 ? "flex-none" : "flex-[1_0_auto]"}`}>
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
      {enEdition && <PointsDeLaChronologie evenements={evenements} perso={perso} onChange={(p) => edition.onChamp("chrono_perso", p, true)}
        basculer={(e) => { const cle = `chrono:${e.cle}`; const liste = edition.masques || []; edition.onChamp("champs_masques", e.masque ? liste.filter((c) => c !== cle) : [...liste, cle], true); }} />}
    </Carte>
  );
}

/**
 * Les points de la chronologie, à la main, dans l'éditeur (16 nov. 2026, Jules : « comme dans l'Analyse du bail ») : la
 * date, le titre et le détail de chaque point se changent, un point se retire ou revient, un autre s'ajoute. Ce qu'on en
 * fait est gardé sur le projet (`chrono_perso`) ; « Rétablir » revient à la chronologie calculée.
 */
function PointsDeLaChronologie({ evenements, perso, onChange, basculer }) {
  const p = { modifies: {}, ajoutes: [], ...(perso || {}) };
  const changer = (e, quoi, v) => {
    if (e.ajoute) onChange({ ...p, ajoutes: p.ajoutes.map((a) => (a.id === e.cle ? { ...a, [quoi]: v } : a)) });
    else onChange({ ...p, modifies: { ...p.modifies, [e.cle]: { ...(p.modifies[e.cle] || {}), [quoi]: v } } });
  };
  const retirer = (e) => (e.ajoute ? onChange({ ...p, ajoutes: p.ajoutes.filter((a) => a.id !== e.cle) }) : basculer(e));
  const ajouter = () => onChange({ ...p, ajoutes: [...p.ajoutes, { id: `point-${Date.now()}`, iso: new Date().toISOString().slice(0, 10), titre: "Nouveau point", detail: "" }] });
  const touche = Object.keys(p.modifies).length || p.ajoutes.length;
  // Le même dessin que les points de la frise du bail : des lignes, les champs visibles au survol.
  const champ = "h-9 rounded-[8px] border border-transparent bg-transparent px-2 text-[14px] text-encre outline-none transition-colors hover:bg-relief/60 focus:border-bord-doux focus:bg-relief max-md:text-[16px]";
  return (
    <div className="mt-6 pt-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ardoise">Points de la chronologie</span>
        {touche ? <button type="button" onClick={() => onChange(null)} className="text-[12.5px] text-brume hover:text-encre" style={{ background: "transparent" }}>Rétablir la chronologie calculée</button> : null}
      </div>
      <div className="flex flex-col">
        {evenements.map((e, i) => (
          <div key={`${e.cle}:${e.iso}:${e.titre}:${e.detail || ""}`} className={`group/point flex items-center gap-3 py-1 max-md:flex-wrap ${i ? "border-t border-trait/60" : ""} ${e.masque ? "opacity-45" : ""}`}>
            <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${e.futur ? "border border-menthe" : "bg-ardoise"}`} />
            <input type="date" defaultValue={e.iso} onBlur={(x) => x.target.value && x.target.value !== e.iso && changer(e, "iso", x.target.value)} aria-label={`Date : ${e.titre}`} className={`${champ} w-[150px] flex-none tabular-nums text-craie`} />
            <input defaultValue={e.titre} onBlur={(x) => x.target.value.trim() && x.target.value.trim() !== e.titre && changer(e, "titre", x.target.value.trim())} aria-label="Titre du point" className={`${champ} min-w-0 flex-1`} />
            <input defaultValue={e.detail || ""} placeholder="Détail" onBlur={(x) => x.target.value.trim() !== (e.detail || "") && changer(e, "detail", x.target.value.trim())} aria-label="Détail du point" className={`${champ} min-w-0 flex-1 text-ardoise placeholder:text-brume`} />
            {e.masque
              ? <button type="button" onClick={() => basculer(e)} className="h-8 flex-none rounded-full px-2.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Remettre</button>
              : <button type="button" onClick={() => retirer(e)} aria-label={`Retirer « ${e.titre} »`} title="Retirer ce point" className="grid h-8 w-8 flex-none place-items-center rounded-full text-brume opacity-0 transition-opacity hover:text-alerte focus:opacity-100 group-hover/point:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={ajouter} className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-bord-doux px-3 text-[12.5px] text-ardoise hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
        <Plus className="h-3.5 w-3.5" /> Ajouter un point
      </button>
    </div>
  );
}
