import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, PhoneIncoming, X } from "lucide-react";

// La visite du mode appel (9 oct. 2026, demande de Jules) : la première fois
// qu'un admin ouvre la Prospection, chaque écran du mode appel s'affiche,
// rempli d'un exemple, la zone dont on parle en lumière et le reste voilé ;
// une phrase dit quoi faire, « OK » passe à la suite. Puis le rappel entrant.
// Les écrans sont des maquettes figées (rien ne s'envoie, rien ne se lit) :
// la visite ne dépend pas des composants du mode appel, qui évoluent.

export const CLE_VISITE = "klocka.visite-mode-appel.v1";
const L = 1100; // largeur de dessin des maquettes ; elles se réduisent pour tenir
const H = 620;

const ETAPES = [
  { ecran: "fiche", zone: [69.7, 0, 30.3, 100], titre: "Appelez depuis votre portable", texte: "Composez ce numéro sur votre téléphone, mettez le haut-parleur, puis touchez le micro pour enregistrer dès que l'agent décroche. Appelé sans enregistrer ? Dites ou écrivez ce qui s'est dit dessous : AK en tire l'issue et la relance." },
  { ecran: "fiche", zone: [19.7, 0, 50, 100], titre: "Les informations du prospect", texte: "L'agence, son statut, l'interlocuteur à demander, et l'accroche à dire en ouvrant l'appel." },
  { ecran: "fiche", zone: [0, 0, 19.7, 100], titre: "L'historique des appels", texte: "Les interlocuteurs connus et chaque appel déjà passé : qui a appelé, quand, et ce qui s'est dit." },
  { ecran: "appel", zone: [0, 0, 47, 100], titre: "L'enregistrement est en cours", texte: "Le micro pulse : votre assistant écoute. « Rappeler » si l'appel coupe, « Raccrocher » à la fin, la croix pour annuler sans rien noter." },
  { ecran: "appel", zone: [49, 0, 51, 58], titre: "La transcription en direct", texte: "Ce qui se dit s'écrit ici, quelques secondes après chaque phrase." },
  { ecran: "appel", zone: [49, 60, 51, 40], titre: "Les notes", texte: "Un email exact, un numéro, l'orthographe d'un nom ? Écrivez-le dans les notes : c'est rapide, et l'assistant s'en sert en priorité." },
  { ecran: "actions", zone: [44, 0, 56, 100], titre: "Les actions proposées par votre assistant", texte: "Il a lu l'appel et prépare tout : la fiche Monday, l'email, la liste de diffusion, la relance. Tout est déjà coché." },
  { ecran: "actions", zone: [86, 10, 14, 52], titre: "Vérifiez sans quitter la page", texte: "Cliquez sur l'œil d'une action pour voir son détail (ce qui sera écrit dans Monday, l'email complet, la date) et le corriger en quelques secondes." },
  { ecran: "detail", zone: [11.5, 36.5, 38, 10], titre: "Un champ faux ? Corrigez-le", texte: "Voici ce qui s'ouvre : exactement ce qui sera écrit dans Monday. Une adresse mal entendue, un nom mal écrit : cliquez sur la case et corrigez-la, en deux secondes." },
  { ecran: "actions", zone: [44, 82, 56, 18], titre: "Valider", texte: "Un seul clic : tout part en même temps." },
  { ecran: "prepare", zone: null, titre: "Tout est envoyé", texte: "La confirmation : chaque action a bien été faite. Vous passez à l'appel suivant." },
  { ecran: "rappel", zone: [80, 0, 20, 16], titre: "Un agent vous rappelle ?", texte: "Pas besoin de savoir qui c'est : touchez « Rappel » en haut de l'écran, l'enregistrement démarre tout de suite." },
  { ecran: "rappel", zone: [8, 22, 84, 78], titre: "À la fin, Stop", texte: "L'assistant propose qui a appelé. Choisissez la bonne personne et pourquoi elle appelait : tout se met à jour, Monday, l'email et la relance." },
];

// --- Les maquettes des écrans, au dessin de 1100 × 620 ----------------------------

const etq = "text-[11px] tracking-[.16em] text-brume";
const Micro = ({ taille = 38 }) => (
  <svg width={taille * 0.76} height={taille} viewBox="0 0 22 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="6" y="1" width="10" height="16" rx="5" /><path d="M2 13a9 9 0 0 0 18 0" /><line x1="11" y1="22" x2="11" y2="27" />
  </svg>
);

function Fiche() {
  return (
    <div className="grid h-full grid-cols-[0.75fr_1.9fr_1.15fr] overflow-hidden rounded-bloc border border-bord-doux">
      <div className="flex flex-col gap-5 border-r border-bord-doux p-5">
        <div className="flex flex-col gap-1.5">
          <span className={etq}>INTERLOCUTEURS</span>
          <span className="flex flex-col rounded-champ bg-menthe/10 px-3 py-2.5"><span className="text-[15px] text-encre">Sophie Martin</span><span className="text-[12.5px] text-menthe">Contact Monday</span></span>
          <span className="flex flex-col px-3 py-2"><span className="text-[15px] text-encre">Jean-Luc Ferrand</span><span className="text-[12.5px] text-ardoise">Registre du commerce</span></span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={etq}>HISTORIQUE</span>
          {[["Pas de réponse", "12/09 · Thomas"], ["Répondeur", "28/08 · Thomas"]].map(([q, d]) => (
            <span key={q} className="flex gap-3 px-1 py-1.5"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-bord-vif" /><span className="flex flex-col"><span className="text-[14px] text-encre">{q}</span><span className="text-[12.5px] text-ardoise">{d}</span></span></span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5 border-r border-bord-doux p-7">
        <div className="flex flex-col gap-3">
          <span className={etq}>TABLEAU PROSPECTION · NICE</span>
          <span className="text-[30px] leading-[1.15] tracking-[-0.02em] text-encre">Agence Riviera Commerce</span>
          <span className="flex items-center gap-3"><span className="rounded-full bg-menthe/15 px-2.5 py-0.5 text-[12.5px] text-menthe">Jamais contactée</span><span className="text-[13.5px] text-ardoise">Nice · 06000</span></span>
        </div>
        <div className="flex flex-col border-b border-trait">
          <span className="grid grid-cols-[110px_1fr] gap-4 border-t border-trait py-3.5"><span className="text-[13.5px] text-ardoise">Interlocuteur</span><span className="text-[15px] text-encre">Sophie Martin</span></span>
          <span className="grid grid-cols-[110px_1fr] gap-4 border-t border-trait py-3.5"><span className="text-[13.5px] text-ardoise">Fonction</span><span className="text-[15px] text-encre">Responsable commerce</span></span>
        </div>
        <div className="flex flex-col gap-3">
          <span className={etq}>L'ACCROCHE</span>
          <span className="text-[18px] leading-[1.5] text-craie">Nos recherches clients actives sur Nice, pour recevoir leurs biens avant la mise en ligne.</span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-5 p-6">
        <span className="grid h-[200px] w-[200px] place-items-center rounded-full border border-menthe/20"><span className="grid h-[78%] w-[78%] place-items-center rounded-full border border-menthe/30"><span className="grid h-[74%] w-[74%] place-items-center rounded-full bg-menthe text-sur-menthe"><Micro /></span></span></span>
        <span className="font-mono text-[26px] tracking-[.04em] text-encre">04 93 87 12 40</span>
        <span className="text-[13px] text-brume">Sophie Martin</span>
        <span className="mt-1 w-full max-w-[300px] rounded-[12px] border border-trait px-3 py-2.5 text-[13px] text-brume">Déjà appelé ? Dites ou écrivez ce qui s'est dit</span>
      </div>
    </div>
  );
}

function Appel() {
  return (
    <div className="grid h-full grid-cols-[47fr_2fr_51fr]">
      <div className="flex flex-col gap-5 rounded-[20px] border border-trait p-6">
        <span className="flex flex-col"><span className="text-[22px] text-encre">Agence Riviera Commerce</span><span className="text-[14px] text-ardoise">Sophie Martin · 04 93 87 12 40</span></span>
        <span className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="relative grid h-[104px] w-[104px] place-items-center"><span className="absolute inset-0 rounded-full bg-menthe/30 motion-safe:animate-ping" style={{ animationDuration: "1.8s" }} /><span className="relative grid h-[104px] w-[104px] place-items-center rounded-full bg-menthe text-sur-menthe"><Micro taille={34} /></span></span>
          <span className="text-[16px] text-encre">Je vous écoute</span>
        </span>
        <span className="flex gap-2.5">
          <span className="flex flex-1 items-center justify-center rounded-full border border-trait py-4 text-[15px] text-encre">Rappeler</span>
          <span className="flex flex-[2] items-center justify-center rounded-full bg-alerte py-4 text-[16px] text-white">Raccrocher</span>
          <span className="grid h-14 w-14 place-items-center rounded-full border border-trait bg-black text-white"><X className="h-5 w-5" /></span>
        </span>
      </div>
      <span />
      <div className="flex flex-col gap-3">
        <div className="flex h-[58%] flex-col gap-3 rounded-[20px] border border-trait p-6">
          <span className={etq}>TRANSCRIPTION EN DIRECT</span>
          <span className="text-[15px] leading-[1.55] text-encre">Bonjour, Sophie Martin, responsable commerce.</span>
          <span className="text-[15px] leading-[1.55] text-encre">Pour l'instant je n'ai rien en murs commerciaux, mais j'aurai peut-être un local dans un mois.</span>
          <span className="text-[15px] leading-[1.55] text-encre">Rappelez-moi jeudi prochain si vous voulez.</span>
        </div>
        <div className="flex flex-1 flex-col gap-2 rounded-[20px] border border-trait p-5">
          <span className={etq}>NOTES</span>
          <span className="rounded-champ border border-trait px-3 py-2.5 text-[15px] text-encre">s.martin@riviera-commerce.fr</span>
        </div>
      </div>
    </div>
  );
}

function Actions() {
  const ligne = (titre, detail) => (
    <span className="flex items-center gap-2 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] text-encre">{titre}</span><span className="truncate text-[12.5px] text-ardoise">{detail}</span></span>
      <span className="grid h-9 w-9 place-items-center rounded-full text-ardoise"><Eye className="h-[18px] w-[18px]" strokeWidth={1.6} /></span>
      <span className="relative h-[22px] w-[38px] rounded-full bg-menthe"><span className="absolute left-[19px] top-[3px] h-4 w-4 rounded-full bg-sur-menthe" /></span>
    </span>
  );
  return (
    <div className="grid h-full grid-cols-[42fr_2fr_56fr]">
      <div className="flex flex-col gap-3 rounded-[20px] border border-trait p-6">
        <span className={etq}>TRANSCRIPTION</span>
        <span className="text-[14.5px] leading-[1.55] text-craie">Bonjour, Sophie Martin, responsable commerce. Pour l'instant je n'ai rien en murs commerciaux, mais j'aurai peut-être un local dans un mois. Rappelez-moi jeudi prochain…</span>
        <span className={`${etq} mt-3`}>NOTES</span>
        <span className="text-[14.5px] text-craie">s.martin@riviera-commerce.fr</span>
      </div>
      <span />
      <div className="flex flex-col">
        <span className="mb-3 flex items-center justify-between px-1"><span className={etq}>ACTIONS PROPOSÉES</span><span className="text-[13px] text-menthe">Pas de bien pour l'instant</span></span>
        <div className="rounded-[18px] border border-trait px-[18px] pb-1.5 pt-3.5">
          <span className="text-[12px] tracking-[.14em] text-menthe">MAINTENANT</span>
          {ligne("Contact Monday", "Sophie Martin, retrouvée par téléphone")}
          {ligne("Email", "Présentation + cahier des charges · à s.martin@riviera-commerce.fr")}
          {ligne("Ajouter à la liste de diffusion agents", "s.martin@riviera-commerce.fr")}
        </div>
        <div className="mx-auto h-5 w-[2px] bg-trait" />
        <div className="rounded-[18px] border border-trait px-[18px] pb-1.5 pt-3.5">
          <span className="text-[12px] tracking-[.14em] text-ardoise">JEUDI 15 OCTOBRE</span>
          {ligne("Planifier la relance", "Rappeler à l'échéance qu'il a donnée")}
        </div>
        <span className="mt-auto flex h-14 items-center justify-center rounded-full bg-encre text-[17px] text-fond">Valider · 4 étapes</span>
      </div>
    </div>
  );
}

/** La fenêtre de détail d'une action (Contact Monday), la case E-mail en cours de correction. */
function Detail() {
  const ligne = (label, valeur, { bleu = true, edite = false } = {}) => (
    <span className="grid grid-cols-[130px_1fr] items-center gap-4 border-b border-trait py-[15px]">
      <span className={`flex items-center gap-2 text-[14.5px] ${bleu ? "text-bleu" : "text-ardoise"}`}>{bleu && <span className="h-1.5 w-1.5 rounded-full bg-bleu" />}{label}</span>
      {edite
        ? <span className="-mx-2 flex items-center rounded-champ border border-bleu px-2 py-0.5 text-[16px] text-encre">{valeur}<span className="ml-px h-5 w-px animate-pulse bg-encre" /></span>
        : <span className="text-[16px] text-encre">{valeur}</span>}
    </span>
  );
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex h-full w-[880px] flex-col overflow-hidden rounded-[28px] border border-bord-vif bg-surface-pleine">
        <div className="flex-none bg-black/55 px-8 pt-5">
          <span className="relative flex items-center justify-center"><span className="text-[26px] text-encre">Contact Monday</span><span className="absolute right-0 flex items-center gap-3"><span className="text-[13px] text-ardoise">1 / 4</span><span className="grid h-9 w-9 place-items-center rounded-full border border-bord-doux text-craie"><X className="h-4 w-4" /></span></span></span>
          <span className="mt-3 grid grid-cols-4 gap-3 pb-4">
            {["Contact Monday", "Email", "Liste de diffusion", "Relance"].map((x, k) => <span key={x} className="flex flex-col gap-2"><span className={`h-[3px] rounded-full ${k === 0 ? "bg-encre" : "bg-bord-vif"}`} /><span className={`text-[13px] ${k === 0 ? "text-encre" : "text-craie"}`}>{x}</span></span>)}
          </span>
        </div>
        <div className="flex-1 px-8 pt-4">
          <span className="text-[14.5px] text-ardoise">Déjà dans Monday, retrouvé par téléphone.</span>
          <div className="mt-3 grid grid-cols-2 gap-x-12 border-t border-trait">
            {ligne("Contact", "Sophie Martin", { bleu: false })}
            {ligne("Téléphone", "04 93 87 12 40", { bleu: false })}
            {ligne("E-mail", "s.martin@riviera-commerce.fr", { edite: true })}
            {ligne("Ville", "Nice", { bleu: false })}
            {ligne("Prochaine relance", "Jeudi 15 octobre")}
            {ligne("Statut", "Pas de bien pour l'instant")}
          </div>
        </div>
        <span className="flex flex-none items-center justify-between border-t border-trait px-8 py-4"><span className="text-[14px] text-ardoise">← Précédente</span><span className="flex h-10 items-center rounded-full bg-encre px-5 text-[14px] text-fond">Suivante →</span></span>
      </div>
    </div>
  );
}

function Prepare() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-[560px] flex-col items-center rounded-[28px] border border-trait bg-fond px-10 pb-8 pt-10">
        <span className="text-[40px] leading-[1.1] tracking-[-0.02em] text-encre">Tout préparé</span>
        <span className="mt-3 text-[16px] text-ardoise">Prochain appel : Cabinet Démo Transactions</span>
        <div className="mt-8 w-full border-t border-trait">
          {[["Contact Monday", "Sophie Martin · relue"], ["Email", "envoyé, retrouvé dans les envoyés"], ["Liste de diffusion", "ajoutée"], ["Relance", "jeudi 15 octobre"]].map(([n, r]) => (
            <span key={n} className="grid grid-cols-[28px_170px_1fr] items-center gap-3 border-b border-trait py-3.5">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-encre text-fond"><Check className="h-3.5 w-3.5" strokeWidth={2.6} /></span>
              <span className="text-[16px] text-encre">{n}</span><span className="truncate text-[15px] text-ardoise">{r}</span>
            </span>
          ))}
        </div>
        <span className="mt-8 flex h-14 items-center rounded-full bg-encre px-9 text-[17px] text-fond">Appel suivant →</span>
      </div>
    </div>
  );
}

function Rappel() {
  return (
    <div className="relative h-full">
      <span className="absolute right-4 top-4 inline-flex h-10 items-center gap-2 rounded-full border border-menthe/50 px-4 text-[14px] text-menthe"><PhoneIncoming className="h-4 w-4" />Rappel</span>
      <div className="absolute inset-x-[8%] bottom-0 top-[22%] grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-trait p-6">
          <span className="text-[14px] text-ardoise">Rappel entrant · agent à identifier</span>
          <span className="relative grid h-[96px] w-[96px] place-items-center"><span className="absolute inset-0 rounded-full bg-menthe/30 motion-safe:animate-ping" style={{ animationDuration: "1.8s" }} /><span className="relative grid h-[96px] w-[96px] place-items-center rounded-full bg-menthe text-sur-menthe"><Micro taille={32} /></span></span>
          <span className="flex h-14 w-[260px] items-center justify-center rounded-full bg-alerte text-[17px] text-white">Stop</span>
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] border border-trait p-6">
          <span className={etq}>QUI A APPELÉ</span>
          <span className="flex items-center justify-between gap-3 rounded-[14px] border border-menthe/40 px-4 py-3.5">
            <span className="flex flex-col"><span className="text-[17px] text-encre">Probablement Sophie Martin · Riviera Commerce</span><span className="text-[13px] text-ardoise">Nice · a cité le local de la rue de France</span></span>
            <span className="flex h-10 items-center rounded-full bg-menthe px-5 text-[14px] text-sur-menthe">Confirmer</span>
          </span>
          <span className="flex items-center justify-between gap-3 border-t border-trait py-3"><span className="flex flex-col"><span className="text-[15px] text-encre">Marc Démo · Riviera Test</span><span className="text-[13px] text-ardoise">Nice</span></span><span className="flex h-10 items-center rounded-full border border-trait px-4 text-[14px] text-craie">Confirmer</span></span>
          <span className={`${etq} mt-2`}>POURQUOI IL APPELLE</span>
          <span className="flex flex-wrap gap-2">{["A un bien intéressant", "Pas de bien pour l'instant", "Rien de nouveau"].map((x, k) => <span key={x} className={`rounded-full border px-3 py-1.5 text-[13px] ${k === 0 ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie"}`}>{x}</span>)}</span>
        </div>
      </div>
    </div>
  );
}

const ECRANS = { fiche: Fiche, appel: Appel, actions: Actions, detail: Detail, prepare: Prepare, rappel: Rappel };
const NOM_ECRAN = { fiche: "La fiche avant l'appel", appel: "Pendant l'appel", actions: "Après l'appel", detail: "Le détail d'une action", prepare: "Après Valider", rappel: "Le rappel entrant" };

/** La visite : l'écran en maquette, la zone en lumière, la phrase et « OK ». */
export default function VisiteModeAppel({ onFermer }) {
  const [i, setI] = useState(0);
  const boite = useRef(null);
  const [taille, setTaille] = useState({ w: L, h: H });
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const mesurer = () => setTaille({ w: el.clientWidth, h: el.clientHeight });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fin = () => { try { localStorage.setItem(CLE_VISITE, new Date().toISOString()); } catch { /* navigation privée */ } onFermer(); };
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") fin(); if (e.key === "Enter" || e.key === "ArrowRight") setI((x) => (x < ETAPES.length - 1 ? x + 1 : x)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const e = ETAPES[i];
  const Ecran = ECRANS[e.ecran];
  const derniere = i === ETAPES.length - 1;
  const z = e.zone;
  // Sur un petit écran, la visite zoome sur la zone dont on parle ; sinon tout l'écran tient.
  const entier = Math.min(taille.w / L, taille.h / H, 1);
  const zoom = taille.w < 700 && z ? Math.min(taille.w / ((L * z[2]) / 100 + 24), taille.h / ((H * z[3]) / 100 + 24), 1) : entier;
  const dx = taille.w < 700 && z ? L / 2 - (L * (z[0] + z[2] / 2)) / 100 : 0;
  const dy = taille.w < 700 && z ? H / 2 - (H * (z[1] + z[3] / 2)) / 100 : 0;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-fond/95 backdrop-blur-xl duration-300 animate-in fade-in-0 md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Visite du mode appel">
      <div className="flex flex-none items-center justify-between gap-3 px-8 pb-2 pt-6 max-md:px-4 max-md:pt-[calc(14px+env(safe-area-inset-top))]">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[11px] tracking-[.16em] text-brume">VISITE DU MODE APPEL · {NOM_ECRAN[e.ecran].toUpperCase()}</span>
          <span className="flex max-w-[340px] gap-1">{ETAPES.map((_, k) => <span key={k} className={`h-[3px] flex-1 rounded-full transition-colors ${k <= i ? "bg-encre" : "bg-bord-vif"}`} />)}</span>
        </span>
        <button type="button" onClick={fin} className="h-9 flex-none rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Passer<span className="max-md:hidden"> la visite</span></button>
      </div>

      {/* L'écran en maquette, réduit pour tenir ; la zone dont on parle reste claire, le reste se voile. */}
      <div ref={boite} className="relative min-h-0 flex-1 overflow-hidden px-8 py-4 max-md:px-3">
        <div className="absolute left-1/2 top-1/2 pointer-events-none select-none" style={{ width: L, height: H, transform: `translate(-50%, -50%) scale(${Math.max(zoom, entier)}) translate(${dx}px, ${dy}px)`, transition: "transform 400ms ease" }} aria-hidden="true">
          <div key={e.ecran} className="h-full w-full duration-300 animate-in fade-in-0"><Ecran /></div>
          {z && (
            <>
              <div className="absolute bg-fond/75 transition-all duration-300" style={{ left: 0, top: 0, width: "100%", height: `${z[1]}%` }} />
              <div className="absolute bg-fond/75 transition-all duration-300" style={{ left: 0, top: `${z[1] + z[3]}%`, width: "100%", height: `${100 - z[1] - z[3]}%` }} />
              <div className="absolute bg-fond/75 transition-all duration-300" style={{ left: 0, top: `${z[1]}%`, width: `${z[0]}%`, height: `${z[3]}%` }} />
              <div className="absolute bg-fond/75 transition-all duration-300" style={{ left: `${z[0] + z[2]}%`, top: `${z[1]}%`, width: `${100 - z[0] - z[2]}%`, height: `${z[3]}%` }} />
              <div className="absolute rounded-[18px] ring-2 ring-menthe transition-all duration-300" style={{ left: `${z[0]}%`, top: `${z[1]}%`, width: `${z[2]}%`, height: `${z[3]}%` }} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-none justify-center px-8 pb-8 pt-2 max-md:px-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div key={i} className="flex w-full max-w-[640px] flex-col gap-3 rounded-[20px] border border-bord-doux bg-surface-pleine px-6 py-5 duration-300 animate-in fade-in-0 slide-in-from-bottom-2">
          <span className="text-[12.5px] tabular-nums text-ardoise">{i + 1} / {ETAPES.length}</span>
          <span className="text-[22px] leading-[1.25] tracking-[-0.01em] text-encre">{e.titre}</span>
          <span className="text-[15px] leading-[1.55] text-craie [text-wrap:pretty]">{e.texte}</span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="p-0 text-[14px] text-ardoise hover:text-encre disabled:opacity-35" style={{ background: "transparent" }}>← Précédent</button>
            <button type="button" onClick={() => (derniere ? fin() : setI(i + 1))} autoFocus className="h-11 rounded-full bg-encre px-7 text-[15px] text-fond hover:opacity-90">{derniere ? "C'est parti" : "OK"}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
