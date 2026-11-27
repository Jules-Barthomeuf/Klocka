import React from "react";
import { Statut } from "@/components/mandataire/elements";
import { VERDICTS } from "@/components/preanalyse/DealResultat";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import { estEcarte, etapeEnCours } from "@/lib/dossiers-architecture";

// La carte d'un dossier dans la liste des Dossiers (27 nov. 2026, Jules : « change le design des cartes de dossiers,
// mets comme dans projet Pappers etc, le truc dessiné » ; planche « Cartes de dossiers », variante Verre, « vas-y
// intègre ce design dans le vrai »). Le dessin des aperçus Pappers et BODACC du Locataire (VisuelFiche,
// LocataireLiensSociaux.jsx) : le nom en gras, ce qu'il est dessous, et une page dessinée, penchée, coupée par le bas,
// qui sort de la carte au survol. La carte est en verre, la page en a l'aspect, opaque, avec un halo léger de l'accent
// (Jules : « l'effet de lumière est trop fort », puis « un peu plus » : 40 %). La page dit l'étape où en est le dossier ;
// dès l'étape Projet, la vraie photo du bien est en tête de la page (Jules : « mets les images lorsqu'on est en projet »).
// En clair, la page est pleine (.k-page-verre, src/index.css). Dessous : l'étape, le verdict, qui s'en occupe, KP, ⋯.

/** Pure : le nom et ce qu'il est, d'après le titre (« KFC - Lyon » → KFC, Lyon ; « Murs · 15 quai… » → Murs, 15 quai…). */
export function nomEtSous(titre = "") {
  const t = String(titre || "").trim();
  const m = t.match(/^(.+?)\s+[-–·]\s+(.+)$/);
  return m ? { nom: m[1], sous: m[2] } : { nom: t, sous: null };
}

/** Pure : les initiales d'un nom (« Nora Lorinquer » → NL), ou d'une adresse (« nora@… » → NO). */
export function initialesDe(nom) {
  const mots = String(nom || "").split("@")[0].split(/[\s._-]+/).filter(Boolean);
  return (mots.length > 1 ? mots[0][0] + mots[1][0] : (mots[0] || "?").slice(0, 2)).toUpperCase();
}

// Les traits de la page se dessinent à la couleur de --p (.k-page-verre : l'encre du thème).
const trait = (largeur, classe = "bg-[rgb(var(--p)/0.12)]") => <span className={`block h-[7px] flex-none rounded-full ${classe}`} style={{ width: largeur }} />;

/**
 * La page dessinée d'une étape : ce qu'on y fait, vu de loin. Pré-analyse : la fiche reçue (photo, titre, cases) ;
 * Analyse : la grille lue case par case ; Projet : la page du client (photo, trois chiffres) ; Vidéo : l'image et son
 * bouton ; Offre : la lettre et sa signature ; Dossier bancaire : les barres.
 */
function PageEtape({ etape, photo = null }) {
  switch (etape) {
    case "analyse":
      return (
        <>
          <span className="block h-[6px] w-[58%] rounded-full bg-[rgb(var(--p))]" />
          <span className="grid grid-cols-[1.4fr_1fr_0.8fr] overflow-hidden rounded-[5px] border border-[rgb(var(--p)/0.15)]">
            {[0, 1, 2, 3].map((l) => [0, 1, 2].map((c) => (
              <span key={`${l}-${c}`} className={`flex h-[18px] items-center px-1.5 ${l ? "border-t border-[rgb(var(--p)/0.10)]" : "bg-[rgb(var(--p)/0.06)]"} ${c ? "border-l border-[rgb(var(--p)/0.10)]" : ""}`}>
                {c === 2 && l ? <span className={`block h-2 w-full rounded-full ${l === 2 ? "bg-[rgb(var(--p)/0.20)]" : "bg-menthe"}`} /> : <span className="block h-[5px] w-[80%] rounded-full bg-[rgb(var(--p)/0.14)]" />}
              </span>
            )))}
          </span>
          {trait("72%")}
          {trait("54%")}
        </>
      );
    case "projet":
      return (
        <>
          {/* La vraie photo du bien dès l'étape Projet (27 nov. 2026, Jules : « mets les images lorsqu'on est en projet ») :
              la page du client la montre en tête ; sans photo, le bloc reste à l'accent. */}
          {photo
            ? <img src={photo} alt="" loading="lazy" draggable={false} className="block h-[68px] w-full flex-none rounded-[5px] object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            : <span className="block h-12 w-full rounded-[5px] bg-menthe/60" />}
          <span className="block h-[6px] w-[64%] rounded-full bg-[rgb(var(--p))]" />
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => <span key={i} className="flex flex-1 flex-col gap-1 rounded-[5px] bg-[rgb(var(--p)/0.05)] p-1.5"><span className="block h-[7px] w-[70%] rounded-full bg-[rgb(var(--p)/0.60)]" /><span className="block h-[4px] w-[90%] rounded-full bg-[rgb(var(--p)/0.15)]" /></span>)}
          </span>
          {trait("80%")}
        </>
      );
    case "video":
      return (
        <>
          <span className="relative block h-[72px] w-full overflow-hidden rounded-[5px] bg-black">
            <span className="absolute inset-x-0 bottom-0 block h-1/2 bg-menthe/30" />
            <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white">
              <span className="ml-0.5 block h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-black" />
            </span>
          </span>
          {trait("70%")}
          {trait("50%")}
        </>
      );
    case "offre":
      return (
        <>
          <span className="flex flex-col items-end gap-1.5">{trait("42%", "bg-[rgb(var(--p)/0.25)]")}{trait("30%")}</span>
          <span className="block h-[6px] w-[50%] rounded-full bg-[rgb(var(--p))]" />
          {trait("88%")}
          {trait("80%")}
          {trait("64%")}
          <svg viewBox="0 0 80 22" className="ml-auto mt-1 h-5 w-[52%] text-[rgb(var(--p))]" fill="none" aria-hidden="true">
            <path d="M2 16c6-10 10-12 12-6s-3 9 2 6 7-12 11-10-2 10 3 9 6-8 10-7 1 6 5 5 8-4 12-4 8 2 11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </>
      );
    case "bancaire":
      return (
        <>
          <span className="block h-[6px] w-[56%] rounded-full bg-[rgb(var(--p))]" />
          <span className="flex h-14 items-end gap-1.5 border-b border-[rgb(var(--p)/0.20)] px-1">
            {[38, 52, 46, 68, 84].map((h, i) => <span key={i} className={`block flex-1 rounded-t-[3px] ${i === 4 ? "bg-menthe" : "bg-menthe/45"}`} style={{ height: `${h}%` }} />)}
          </span>
          {trait("76%")}
          {trait("60%")}
        </>
      );
    default:
      return (
        <>
          <span className="block h-11 w-full rounded-[5px] bg-menthe/45" />
          <span className="block h-[6px] w-[62%] rounded-full bg-[rgb(var(--p))]" />
          {trait("80%")}
          <span className="flex gap-2"><span className="block h-8 flex-1 rounded-[5px] bg-menthe" /><span className="block h-8 flex-1 rounded-[5px] bg-menthe/25" /></span>
          {trait("66%")}
        </>
      );
  }
}

/** La page en verre, penchée, coupée par le bas ; au survol elle monte, se redresse, grossit et s'éclaire. */
function Page({ etape, rang, photo = null }) {
  const penche = ["rotate-[5deg]", "rotate-[-4deg]", "rotate-[3deg]"][rang % 3];
  return (
    // Le cadre qui coupe la page par le bas déborde de 90 px en haut et de 40 px sur les côtés : la page sort de la carte
    // au survol. Elle est opaque (.k-page-verre) : le bord de la carte ne se voit pas derrière.
    <div aria-hidden="true" className="pointer-events-none absolute -left-10 -right-10 -top-[90px] bottom-0 z-20 overflow-hidden">
      <div className={`k-page-verre absolute -bottom-10 right-[60px] top-[110px] flex w-[calc((100%-80px)*0.44)] min-w-[128px] max-w-[190px] flex-col gap-2 rounded-[10px] px-3 pb-12 pt-3 transition-[transform,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-8 group-hover:rotate-0 group-hover:scale-[1.06] group-hover:brightness-[1.15] motion-reduce:transition-none ${penche}`}>
        <PageEtape etape={etape} photo={photo} />
      </div>
    </div>
  );
}

export default function CarteDossier({ d, qui, rang = 0, menu = null, onOuvrir, onSurvol }) {
  const etape = etapeEnCours(d);
  const ecarte = estEcarte(d);
  const verdict = d.verdict_choisi ? VERDICTS[d.verdict_choisi] : null;
  const { nom, sous } = nomEtSous(d.titre || d.nom_fichier || d.deal_id);
  const premier = String(qui || "").split(",")[0].trim();
  const page = etape?.id || "fin";
  const court = nom.length <= 7;

  return (
    <article onClick={onOuvrir} onMouseEnter={onSurvol} onFocus={onSurvol} tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOuvrir(); }}
      className={`k-verre k-entree group relative cursor-pointer overflow-visible transition-colors hover:z-30 hover:border-bord-vif ${ecarte ? "opacity-60" : ""}`}>
      <div className={`relative h-[176px] rounded-t-[16px] border-b border-trait ${ecarte ? "grayscale" : ""}`}>
        <div className="absolute left-5 top-1/2 z-10 max-w-[calc(100%-max(128px,min(44%,190px))-48px)] -translate-y-1/2 text-encre">
          <p className={`m-0 font-bold tracking-[-0.02em] ${court ? "truncate text-[26px] leading-[1.05]" : "line-clamp-3 text-[18px] leading-[1.15]"}`} title={d.titre}>{nom}</p>
          {sous && <p className="m-0 mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.3] text-ardoise">{sous}</p>}
        </div>
        <Page etape={page} rang={rang} photo={page === "projet" ? d.photo : null} />
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="flex min-h-[20px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ardoise">
            <span aria-hidden="true" className={`h-1.5 w-1.5 flex-none rounded-full ${ecarte ? "bg-alerte" : "bg-brume"}`} />
            <span className="truncate">{ecarte ? "Écarté" : etape ? etape.label : "Terminé"}</span>
            {(d.fil_non_lus || 0) > 0 && <PointNouveau n={d.fil_non_lus} />}
          </span>
          {ecarte
            ? <Statut couleur="corail" className="flex-none !px-[7px] !text-[10.5px]">{d.statut === "abandonne" ? "Abandonné" : "Non conforme"}</Statut>
            : verdict && <Statut couleur={verdict.statut} className="flex-none !px-[7px] !text-[10.5px]">{verdict.libelle}</Statut>}
        </div>
        <div className="relative mt-2.5 flex min-w-0 items-center gap-2 border-t border-trait pt-2.5 pr-9">
          <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full bg-encre/[0.07] text-[10px] font-semibold text-craie">{qui === "—" ? "?" : initialesDe(premier)}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ardoise" title={qui}>{qui}</span>
          {d.origine === "mandataire" && <span className="flex-none rounded-[6px] bg-statut-lavande-fond px-1.5 text-[10px] text-statut-lavande" title="K Partners">KP</span>}
          <span onClick={(e) => e.stopPropagation()}>{menu}</span>
        </div>
      </div>
    </article>
  );
}
