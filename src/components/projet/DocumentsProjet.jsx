import React, { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import { PanneauPiece } from "@/components/projet/CasesProjet";
import { Bloc } from "@/components/projet/EditionEnPlace";
import { documentsParGroupe } from "@/lib/groupes-documents";

// Les documents d'un projet en vignettes (26 nov. 2026, Jules : « au lieu d'une ligne avec une petite icône, une preview
// de la première page avec le titre ; on clique dessus et ça s'ouvre » ; « en vue client, pas de points : comme en mode
// édition, et on peut juste cliquer sur les documents ») : la première page de chaque pièce (MiniaturePiece), son nom
// dessous ; un clic l'ouvre dans le volet de droite (PanneauPiece), sur le lien public dans un nouvel onglet.

/** Le cadre d'une partie, celui de l'éditeur et de la Data Room. */
export const CADRE_PARTIE = "flex min-h-[150px] flex-col rounded-[16px] border border-bord-doux bg-[var(--k-surface)] p-4 text-left shadow-lg backdrop-blur-xl";

/** Le volet qui ouvre une pièce, et la fonction qui l'ouvre. */
export function useLecteurDocument({ nouvelOnglet = false } = {}) {
  const [piece, setPiece] = useState(null);
  const ouvrir = (f) => {
    if (!f?.url) return;
    if (nouvelOnglet) { window.open(f.url, "_blank", "noopener,noreferrer"); return; }
    setPiece({ document_url: f.url, document_nom: f.nom, document_id: null });
  };
  return { ouvrir, rendu: <PanneauPiece piece={piece} onFermer={() => setPiece(null)} /> };
}

/**
 * Les vignettes d'une partie. `onRetirer` (éditeur) : la croix au survol ; `onGlisser` (éditeur) : la vignette se glisse
 * dans une autre partie.
 */
export function VignettesDocuments({ fichiers, onOuvrir, onRetirer = null, onGlisser = null }) {
  return (
    <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-2 p-0 max-sm:grid-cols-2">
      {fichiers.map((f) => (
        <li key={f.idx} draggable={!!onGlisser} onDragStart={onGlisser ? (ev) => onGlisser(ev, f) : undefined}
          className={`group relative min-w-0 ${onGlisser ? "cursor-grab active:cursor-grabbing" : ""}`}>
          <button type="button" onClick={(ev) => { ev.stopPropagation(); onOuvrir(f); }} title={f.nom}
            className="flex w-full min-w-0 flex-col items-center gap-2 rounded-[10px] px-1.5 pb-1.5 pt-2 transition-colors hover:bg-relief" style={{ background: "transparent" }}>
            <MiniaturePiece url={f.url} largeur={84} />
            <span className="line-clamp-2 w-full break-words text-center text-[12px] leading-[1.35] text-craie transition-colors group-hover:text-encre">{f.nom}</span>
          </button>
          {onRetirer && (
            <button type="button" onClick={(ev) => { ev.stopPropagation(); onRetirer(f.idx); }}
              className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-surface-pleine text-ardoise opacity-0 shadow-[0_2px_8px_rgb(0_0_0/0.3)] transition-opacity hover:text-encre group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
              aria-label={`Retirer ${f.nom}`} title="Retirer">
              <X className="h-3 w-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// Les positions des pages d'une pile : au repos, l'une derrière l'autre, penchées ; au survol de la carte, en éventail,
// sorties par le haut (26 nov. 2026, Jules : « la même DA que Pappers et BODACC ; on voit un document, puis les autres »).
const POSES = [
  { repos: "translate(0px, 0px) rotate(5deg)", survol: "translate(0px, -40px) rotate(1deg) scale(1.06)" },
  // Un éventail resserré : il reste à droite du nom de la partie (même jour, il couvrait « Quittances »).
  { repos: "translate(-22px, 10px) rotate(-5deg)", survol: "translate(-44px, -26px) rotate(-7deg) scale(1.02)" },
  { repos: "translate(-42px, 20px) rotate(-13deg)", survol: "translate(-80px, -10px) rotate(-14deg)" },
];

// Le type d'une partie, d'après son nom : un dessin de page par type (26 nov. 2026, Jules : « des pages dessinées, plus
// homogène ; des layouts selon le type de document, sinon c'est trop la même chose »).
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function typeDePartie(nom) {
  const n = sansAccent(nom);
  if (/bail|avenant/.test(n)) return "bail";
  if (/quittance|loyer|appel de (fonds|charges|provision)/.test(n)) return "quittance";
  if (/\bpv\b|assemblee|\bag\b/.test(n)) return "pv";
  if (/reglement|copropri/.test(n)) return "reglement";
  if (/diagnostic|dpe|amiante|plomb|energ/.test(n)) return "diagnostic";
  if (/taxe|fonci|impot/.test(n)) return "taxe";
  if (/plan|surface/.test(n)) return "plan";
  if (/kbis|statut|societe/.test(n)) return "kbis";
  return "autre";
}

/** Un trait de texte gris, de la largeur donnée ; `v` le décale un peu d'une page à l'autre. */
const Trait = ({ l, h = 5, fonce = false }) => <span className={`block flex-none rounded-full ${fonce ? "bg-black" : "bg-black/[0.12]"}`} style={{ width: l, height: h }} />;
const pc = (base, v, pas = 7) => `${Math.max(30, Math.min(96, base - ((v * pas) % 21)))}%`;

/**
 * La page dessinée d'un document, selon son type ; `v` (son rang dans la pile) fait varier les longueurs, pour que deux
 * pages d'une même partie ne soient pas identiques. Noir, gris et l'accent, comme Pappers et le BODACC.
 */
export function PageDessinee({ type = "autre", v = 0 }) {
  const corps = (() => {
    switch (type) {
      // Un bail commercial (même jour, Jules : « j'aime pas celui du Bail ») : le titre et le 3-6-9, le bailleur et le preneur
      // en deux encadrés, la frise des trois périodes, une signature manuscrite et un cachet.
      case "bail": return (
        <>
          <span className="flex items-center justify-between gap-1.5">
            <Trait l="52%" h={5} fonce />
            <span className="flex gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="block h-[6px] w-[7px] rounded-[2px] bg-menthe" />)}</span>
          </span>
          <span className="flex gap-1.5">
            {[0, 1].map((i) => (
              <span key={i} className="flex flex-1 flex-col gap-1 rounded-[3px] border border-black/15 p-1">
                <Trait l="45%" h={3} fonce /><Trait l={pc(90, v + i)} h={3} /><Trait l={pc(70, v + i + 1)} h={3} />
              </span>
            ))}
          </span>
          <span className="relative mt-0.5 flex items-center">
            <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-black/15" />
            {[0, 1, 2].map((i) => <span key={i} className={`relative z-10 h-[5px] flex-1 ${i ? "ml-[3px]" : ""} rounded-full ${i === 0 ? "bg-menthe" : "bg-menthe/45"}`} />)}
          </span>
          <Trait l={pc(92, v)} h={4} /><Trait l={pc(74, v + 1)} h={4} />
          <span className="mt-auto flex items-end justify-between">
            <svg viewBox="0 0 60 18" className="h-[14px] w-[46%]" aria-hidden="true"><path d="M2 13 C 8 2, 12 2, 14 10 S 22 16, 26 7 S 34 3, 38 11 S 50 14, 58 5" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" /></svg>
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-menthe"><span className="block h-[6px] w-[6px] rounded-full bg-menthe" /></span>
          </span>
        </>
      );
      case "quittance": return (
        <>
          <span className="flex items-start justify-between"><span className="block h-4 w-4 rounded-[3px] bg-black" /><span className="block h-5 w-[44%] rounded-[3px] bg-menthe" /></span>
          <Trait l="42%" h={4} fonce />
          <span className="mt-1 flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex items-center justify-between border-b border-black/10 py-[5px]"><Trait l={pc(56, v + i, 9)} h={4} /><Trait l="18%" h={4} /></span>
            ))}
          </span>
          <span className="mt-auto flex items-center justify-between rounded-[3px] bg-menthe/25 px-1.5 py-1"><Trait l="28%" h={4} fonce /><Trait l="22%" h={6} fonce /></span>
        </>
      );
      case "pv": return (
        <>
          <span className="mx-auto block h-[5px] w-[70%] rounded-full bg-black" />
          <span className="mx-auto block h-[3px] w-[44%] rounded-full bg-black/35" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="mt-0.5 flex items-start gap-1.5">
              <span className="mt-[1px] grid h-3 w-3 flex-none place-items-center rounded-full bg-black text-[6px] font-bold leading-none text-white">{i + 1}</span>
              <span className="flex flex-1 flex-col gap-1"><Trait l={pc(92, v + i)} h={4} /><Trait l={pc(66, v + i + 1)} h={4} /></span>
              <span className={`mt-[1px] block h-2.5 w-4 flex-none rounded-full ${i === 1 ? "bg-black/20" : "bg-menthe"}`} />
            </span>
          ))}
        </>
      );
      case "reglement": return (
        <>
          <Trait l="58%" h={5} fonce />
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-1">
              <Trait l="26%" h={4} fonce />
              <Trait l="100%" h={3} /><Trait l="100%" h={3} /><Trait l={pc(84, v + i)} h={3} /><Trait l={pc(60, v + i + 2)} h={3} />
            </span>
          ))}
        </>
      );
      case "diagnostic": return (
        <>
          <Trait l="64%" h={5} fonce />
          <Trait l={pc(48, v)} h={4} />
          <span className="mt-1 flex flex-col gap-[3px]">
            {[0.25, 0.4, 0.55, 0.7, 0.85, 1].map((o, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="block h-[7px] rounded-r-full bg-menthe" style={{ width: `${30 + i * 12}%`, opacity: o }} />
                {i === (v % 3) + 1 && <span className="block h-[7px] w-3 rounded-l-full bg-black" />}
              </span>
            ))}
          </span>
          <Trait l={pc(80, v)} h={4} />
        </>
      );
      case "taxe": return (
        <>
          <span className="flex items-center gap-1.5"><span className="block h-4 w-4 rounded-full border-2 border-black" /><Trait l="46%" h={5} fonce /></span>
          <span className="block h-[2px] w-full bg-black" />
          <span className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => <span key={i} className="block h-4 rounded-[2px] border border-black/15" />)}
          </span>
          <Trait l={pc(76, v)} h={4} /><Trait l={pc(58, v + 1)} h={4} />
          <span className="mt-auto ml-auto block h-6 w-[48%] rounded-[3px] bg-menthe" />
        </>
      );
      case "plan": return (
        <>
          <Trait l="50%" h={5} fonce />
          <span className="relative mt-1 flex-1 rounded-[2px] border-2 border-black/70">
            <span className="absolute left-[40%] top-0 h-[55%] w-[2px] bg-black/70" />
            <span className="absolute left-0 top-[55%] h-[2px] w-[65%] bg-black/70" />
            <span className="absolute bottom-[12%] right-[12%] block h-[22%] w-[26%] rounded-[2px] bg-menthe" />
          </span>
          <Trait l={pc(40, v)} h={4} />
        </>
      );
      case "kbis": return (
        <>
          <span className="block h-5 w-full rounded-[3px] bg-black" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex gap-2"><Trait l="30%" h={4} fonce /><Trait l={pc(52, v + i)} h={4} /></span>
          ))}
          <span className="mt-auto block h-6 w-6 self-end rounded-full border-2 border-menthe" />
        </>
      );
      default: return (
        <>
          <span className="block h-5 w-full rounded-[4px] bg-black" />
          <Trait l={pc(78, v)} /><Trait l={pc(56, v + 1)} />
          <span className="flex gap-1.5"><span className="block h-8 flex-1 rounded-[4px] bg-menthe" /><span className="block h-8 flex-1 rounded-[4px] bg-menthe/25" /></span>
          <Trait l={pc(70, v + 2)} />
        </>
      );
    }
  })();
  return <span aria-hidden="true" className="flex h-full w-full flex-col gap-2 bg-white p-3">{corps}</span>;
}

/** Une page de la pile : la page dessinée du type de sa partie ; un clic ouvre le document. */
function Page({ f, type, largeur, pose, rang, onOuvrir }) {
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onOuvrir(f); }} title={f.nom}
      className="k-pile-page pointer-events-auto absolute bottom-0 right-0 overflow-hidden rounded-[8px] bg-white text-left shadow-[0_12px_30px_rgb(0_0_0/0.25)]"
      style={{ width: largeur, height: Math.round(largeur * 1.3), zIndex: 10 - rang, "--repos": pose.repos, "--survol": pose.survol }}>
      <PageDessinee type={type} v={rang + (f.idx || 0)} />
    </button>
  );
}

/**
 * La pile des documents d'une partie, sur le fond à l'accent : la première devant, deux autres derrière au plus ; au-delà,
 * « +n ». Elle déborde par le haut au survol (le parent est un `group`), le bas reste coupé.
 */
export function PileDocuments({ fichiers, onOuvrir, type = "autre", largeur = 112, droite = 28, bas = -34 }) {
  const pages = fichiers.slice(0, 3);
  const reste = fichiers.length - pages.length;
  return (
    <div aria-hidden={false} className="pointer-events-none absolute inset-0 z-20 [clip-path:inset(-120px_-200px_0_-200px)]">
      <div className="absolute" style={{ right: droite, bottom: bas, width: largeur, height: Math.round(largeur * 1.3) }}>
        {pages.map((f, i) => <Page key={f.idx ?? i} f={f} type={type} largeur={largeur} pose={POSES[i]} rang={i} onOuvrir={onOuvrir} />).reverse()}
      </div>
      {reste > 0 && <span className="absolute bottom-3 right-3 rounded-full bg-black/80 px-2 py-0.5 text-[12px] font-medium text-white">+{reste}</span>}
    </div>
  );
}

const nombre = (n) => `${n} document${n > 1 ? "s" : ""}`;

/** La carte d'une partie en lecture : son nom en gras sur l'accent, sa pile ; dessous, le premier document. */
function CartePartie({ partie, onOuvrir }) {
  const n = partie.fichiers.length;
  const premier = partie.fichiers[0];
  return (
    <div className="k-carte group relative overflow-visible transition-colors hover:z-30 hover:border-bord-vif">
      <div className="relative h-[176px] rounded-t-[16px] border-b border-trait text-black">
        <div className="absolute inset-0 overflow-hidden rounded-t-[16px] bg-menthe" />
        <div className="absolute left-6 top-1/2 z-10 max-w-[48%] -translate-y-1/2">
          <p className="m-0 line-clamp-2 text-[28px] font-bold leading-[1.05] tracking-[-0.02em]">{partie.nom}</p>
          <p className="m-0 mt-2 text-[14px] font-medium">{nombre(n)}</p>
        </div>
        <PileDocuments fichiers={partie.fichiers} onOuvrir={onOuvrir} type={typeDePartie(partie.nom)} />
      </div>
      <button type="button" onClick={() => onOuvrir(premier)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" style={{ background: "transparent" }}>
        <span className="min-w-0 truncate text-[14px] text-encre">{premier?.nom}{n > 1 ? <span className="text-ardoise"> · et {n - 1} autre{n > 2 ? "s" : ""}</span> : null}</span>
        <ArrowUpRight className="h-4 w-4 flex-none text-ardoise" />
      </button>
    </div>
  );
}

/** L'onglet Documents en lecture (vue client, lien public) : les parties qui ont des pièces, au dessin de l'éditeur. */
export function DocumentsLecture({ project, isPublic = false }) {
  const lecteur = useLecteurDocument({ nouvelOnglet: isPublic });
  const parties = documentsParGroupe(project).filter((p) => p.fichiers.length);
  return (
    <>
      <div className="mb-5 grid gap-x-4 gap-y-8 pt-6 sm:grid-cols-2 xl:grid-cols-3">
        {parties.map((p) => (
          <Bloc key={p.nom} id={`documents-${p.nom}`} titre={p.nom}>
            <CartePartie partie={p} onOuvrir={lecteur.ouvrir} />
          </Bloc>
        ))}
      </div>
      {lecteur.rendu}
    </>
  );
}
