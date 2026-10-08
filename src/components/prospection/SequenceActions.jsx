import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";

// Les actions proposées après un appel abouti, en séquence (maquette de
// Jules, 7 oct. 2026) : ce qui part maintenant (Monday, le mail du modèle, la
// liste de diffusion), puis le rappel à la date dite, modifiable. Chaque étape
// a son œil (le détail : ce qui change dans Monday, le mail à relire, la date)
// et son interrupteur ; Monday ne se décoche pas pour un appel abouti. Le
// tracé se dessine une fois à l'ouverture.

const MAILS = { "presentation-cahier": "Présentation + cahier des charges", presentation: "Présentation seule", "demande-fiche": "Murs commerciaux · fiche commerciale", "demande-documents": "Murs commerciaux · documents du dossier" };
const ISSUES = { pas_de_reponse: "Pas de réponse", repondeur: "Répondeur, message laissé", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien intéressant", pas_interesse: "Pas intéressé" };
const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const lenteur = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Le contour qui se dessine autour d'une carte, des deux côtés à partir du haut. */
function Trace({ p, rayon }) {
  const ref = useRef(null);
  const [taille, setTaille] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const mesurer = () => setTaille({ w: el.clientWidth, h: el.clientHeight });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  let chemins = null;
  if (taille) {
    const i = 0.75, w = taille.w - i, h = taille.h - i, c = taille.w / 2, r = rayon;
    const droite = `M${c},${i} H${w - r} A${r},${r} 0 0 1 ${w},${i + r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${c}`;
    const gauche = `M${c},${i} H${i + r} A${r},${r} 0 0 0 ${i},${i + r} V${h - r} A${r},${r} 0 0 0 ${i + r},${h} H${c}`;
    const st = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, pathLength: 100, strokeDasharray: 100, strokeDashoffset: 100 * (1 - p) };
    chemins = <><path d={droite} {...st} /><path d={gauche} {...st} /></>;
  }
  return <svg ref={ref} aria-hidden="true" className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible text-menthe/50">{chemins}</svg>;
}

/** Un trait vertical entre deux étapes, rempli selon p. */
const Trait = ({ p, h = 20 }) => (
  <div className="relative mx-auto w-[2px] overflow-hidden bg-trait" style={{ height: h }}>
    <div className="absolute left-0 top-0 w-full bg-menthe/50" style={{ height: `${p * 100}%` }} />
  </div>
);

/** L'interrupteur d'une étape. */
function Interrupteur({ on, onChange, petit = false, label }) {
  const l = petit ? "w-8 h-[18px]" : "w-[38px] h-[22px]";
  const k = petit ? "h-[14px] w-[14px] top-[2px]" : "h-4 w-4 top-[3px]";
  const x = on ? (petit ? "left-[16px]" : "left-[19px]") : (petit ? "left-[2px]" : "left-[3px]");
  return (
    <button type="button" onClick={onChange} aria-pressed={on} aria-label={label} className="flex flex-none py-2 pl-1" style={{ background: "transparent" }}>
      <span className={`relative rounded-full transition-colors ${l} ${on ? "bg-menthe" : "bg-bord-vif"}`}>
        <span className={`absolute rounded-full transition-[left] ${k} ${x} ${on ? "bg-sur-menthe" : "bg-ardoise"}`} />
      </span>
    </button>
  );
}

const BoutonOeil = ({ onClick }) => (
  <button type="button" onClick={onClick} aria-label="Voir le détail" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
    <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />
  </button>
);

/** Une étape d'une carte : libellé, détail, œil, interrupteur. */
function Etape({ e }) {
  return (
    <div className="flex min-h-[44px] items-center gap-1.5 py-1.5">
      <span className={`flex min-w-0 flex-1 flex-col gap-0.5 transition-opacity ${e.on ? "" : "opacity-40"}`}>
        <span className={`text-[16px] text-encre ${e.on ? "" : "line-through"}`}>{e.label}</span>
        <span className={`text-[13px] ${e.warn && e.on ? "text-ambre" : "text-ardoise"}`}>{e.detail}</span>
      </span>
      <BoutonOeil onClick={e.voir} />
      {e.basculer && <Interrupteur on={e.on} onChange={e.basculer} label={`${e.on ? "Retirer" : "Remettre"} : ${e.label}`} />}
    </div>
  );
}

/** Une carte d'étapes, avec son titre et son contour animé. */
function Carte({ titre, etapes, p, allume }) {
  const actif = etapes.some((e) => e.on);
  return (
    <div className={`relative rounded-[18px] border border-trait bg-transparent px-[18px] pb-1.5 pt-3.5 transition-opacity ${actif ? "" : "opacity-45"}`}>
      <p className={`m-0 mb-0.5 text-[12px] tracking-[.14em] transition-colors ${allume ? "text-menthe" : "text-ardoise"}`}>{titre}</p>
      {etapes.map((e) => <Etape key={e.k} e={e} />)}
      <Trace p={p} rayon={18} />
    </div>
  );
}

// Le voile bleu des cases qu'AK écrit, posé sur la surface (pas d'hexadécimal).
const VOILE_BLEU = { backgroundImage: "linear-gradient(rgb(var(--k-bleu-rgb) / 0.08), rgb(var(--k-bleu-rgb) / 0.08))" };
const enJour = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? jourLong(v).replace(/^./, (c) => c.toUpperCase()) : v);

/**
 * Une case du détail. En bleu (libellé « · modifié » ou « · nouveau ») : ce
 * qu'AK écrit. Une case qui a `edit` se change d'un clic ; les autres se lisent.
 */
function Case({ c }) {
  const bleu = !!c.statut;
  const saisie = "min-w-0 -mx-2 rounded-champ border border-transparent bg-transparent px-2 py-1 text-[16px] leading-[1.4] text-encre outline-none hover:border-bord-doux focus:border-bleu";
  const e = c.edit;
  return (
    <div className={`-ml-px -mt-px flex min-w-0 flex-col gap-2 border-l border-t border-trait bg-transparent px-5 py-4 max-md:px-4 max-md:py-3.5 ${c.large ? "col-span-2 max-md:col-span-1" : ""}`} style={bleu ? VOILE_BLEU : undefined}>
      <span className={`text-[13.5px] ${bleu ? "text-bleu" : "text-ardoise"}`}>{c.label}{c.statut ? ` · ${c.statut}` : ""}</span>
      {e?.type === "date" && (
        <input type="date" value={e.valeur || ""} min={new Date().toISOString().slice(0, 10)} onChange={(x) => x.target.value && e.changer(x.target.value)} aria-label={c.label}
          className="self-start rounded-champ border border-bleu/50 bg-transparent px-3 py-2 text-[16px] text-encre outline-none focus:border-bleu" />
      )}
      {e?.type === "texte" && <input value={e.valeur ?? ""} onChange={(x) => e.changer(x.target.value)} placeholder={e.placeholder || "—"} aria-label={c.label} className={`${saisie} ${c.warn ? "text-ambre" : ""}`} />}
      {e?.type === "zone" && <textarea value={e.valeur ?? ""} onChange={(x) => e.changer(x.target.value)} rows={e.lignes || 3} aria-label={c.label} className={`${saisie} resize-y text-[15px] leading-[1.55]`} />}
      {!e && <span className={`whitespace-pre-line text-[16px] leading-[1.45] [text-wrap:pretty] ${c.warn ? "text-ambre" : c.valeur ? "text-encre" : "text-brume"}`}>{c.valeur || "—"}</span>}
      {c.source && <span className="text-[12.5px] text-menthe">{c.source}</span>}
    </div>
  );
}

/**
 * Le détail des étapes, en fenêtre (maquette de Jules, 7 oct. 2026) : à
 * gauche toutes les étapes, rangées par moment ; à droite celle qu'on lit,
 * en cases. Précédente et Suivante passent d'une étape à l'autre ; Rétablir
 * remet ce qu'AK avait proposé pour l'étape ouverte.
 */
function Panneau({ pas, ouverte, setOuverte, contenuDe, onFermer }) {
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFermer]);
  const i = Math.max(0, pas.findIndex((x) => x.k === ouverte));
  const courant = pas[i];
  const c = contenuDe(courant.q);
  const cases = c.cases || [];
  // Une case seule en fin de ligne prend toute la largeur : pas de trou dans la grille.
  const simples = cases.filter((x) => !x.large).length;
  const groupes = [];
  for (const x of pas) {
    const g = groupes[groupes.length - 1];
    if (g && g.titre === x.groupe) g.pas.push(x); else groupes.push({ titre: x.groupe, pas: [x] });
  }
  const bouton = "p-0 text-[14px] transition-colors disabled:opacity-35";
  // Rendue dans le body : sous un parent qui crée son propre empilement, la barre du téléphone passait devant.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-fond/80 p-6 backdrop-blur-xl md:left-[var(--k-barre-largeur)] max-md:p-0" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div role="dialog" aria-modal="true" aria-label={c.titre}
        className="grid max-h-[min(720px,100%)] w-full max-w-[760px] grid-cols-[190px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-bloc border border-bord-vif bg-transparent shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:h-full max-md:max-w-none max-md:grid-cols-1 max-md:rounded-none">
        <nav className="flex min-h-0 flex-col overflow-y-auto border-r border-trait bg-transparent px-3 py-5 max-md:hidden">
          {groupes.map((g) => (
            <div key={g.titre} className="mb-5 flex flex-col gap-1 last:mb-0">
              <span className="mb-1.5 px-4 text-[11px] uppercase tracking-[.16em] text-ardoise">{g.titre}</span>
              {g.pas.map((x) => (
                <button key={x.k} type="button" onClick={() => setOuverte(x.k)} aria-current={x.k === courant.k ? "step" : undefined}
                  className={`rounded-champ px-3 py-2.5 text-left text-[14.5px] transition-colors ${x.k === courant.k ? "bg-relief text-encre" : "text-craie hover:text-encre"} ${x.on ? "" : "line-through opacity-45"}`}
                  style={x.k === courant.k ? undefined : { background: "transparent" }}>{x.court}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex min-h-0 flex-col px-7 pb-6 pt-6 max-md:px-4 max-md:pb-[calc(72px+env(safe-area-inset-bottom))] max-md:pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[.16em] text-ardoise">{c.kicker}<span className="md:hidden"> · {i + 1} sur {pas.length}</span></span>
              <span className="break-words text-[22px] leading-[1.25] tracking-[-0.01em] text-encre max-md:text-[20px]">{c.titre}</span>
            </div>
            <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-9 w-9 flex-none place-items-center rounded-full border border-bord-doux text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {!courant.on && <p className="m-0 text-[13.5px] text-ardoise">Étape retirée : elle ne partira pas à la validation.</p>}
            {c.haut}
            {cases.length > 0 && (
              <div className="grid grid-cols-2 overflow-hidden rounded-bloc border border-trait max-md:grid-cols-1">
                {cases.map((x, n) => <Case key={`${x.label}-${n}`} c={!x.large && simples % 2 === 1 && cases.slice(n + 1).every((y) => y.large) ? { ...x, large: true } : x} />)}
              </div>
            )}
            {c.aide && <p className="m-0 text-[13.5px] leading-[1.5] text-ardoise">{c.aide}</p>}
          </div>
          <div className="mt-5 flex items-center gap-6 border-t border-trait pt-4 max-md:gap-4">
            <button type="button" disabled={i === 0} onClick={() => setOuverte(pas[i - 1].k)} className={`${bouton} text-craie hover:text-encre`} style={{ background: "transparent" }}>← Précédente</button>
            <button type="button" disabled={!c.retablir} onClick={() => c.retablir?.()} className={`${bouton} text-craie hover:text-encre`} style={{ background: "transparent" }}>Rétablir</button>
            <button type="button" onClick={() => (i < pas.length - 1 ? setOuverte(pas[i + 1].k) : onFermer())}
              className="ml-auto h-10 rounded-full bg-encre px-5 text-[14px] text-fond hover:opacity-90">{i < pas.length - 1 ? "Suivante →" : "Terminer"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * @param {{appel, agence, issue, coches: Set, setCoches, mail, setMail, relanceLe, setRelanceLe, ligneMonday, setLigneMonday, onLancer, envoi}} props
 */
export default function SequenceActions({ appel, agence, issue, coches, setCoches, mail, setMail, relanceLe, setRelanceLe, relance2Le, setRelance2Le, ligneMonday, setLigneMonday, edits = null, setEdits = null, onChangerIssue = null, changementEnCours = false, issuesEnPlus = null, onLancer, envoi = false }) {
  // Relances (8 oct. 2026) : « Agent prévenu » s'ajoute aux issues pour un bien retenu ou refusé.
  const ISS = issuesEnPlus ? { ...ISSUES, ...issuesEnPlus } : ISSUES;
  const props = appel.propositions || [];
  const par = (t) => props.find((p) => p.type === t);
  const pm = par("mail");
  const pr = par("relance");
  const pr2 = par("relance_suivante");
  const pmo = par("monday");
  const pdi = par("diffusion");
  const compris = appel.compris?.champs || {};
  const interlocuteur = compris.interlocuteur?.valeur || agence?.interlocuteurs?.[0] || appel.avant?.interlocuteur || null;
  const [ouverte, setOuverte] = useState(null);
  const [choixIssue, setChoixIssue] = useState(false);
  const [debut] = useState(() => performance.now());
  const [t, setT] = useState(() => (lenteur() ? 99 : 0));
  const ligne = pmo?.ligne || null;
  const doute = ligne?.etat === "doute" && !ligneMonday;

  const segments = useMemo(() => {
    const l = [["maintenant", 1.6, 0.5], ["v1", 0.5], ["rappel", 1.6]];
    let x = 0;
    const out = {};
    for (const [k, d, avant0 = 0] of l) { x += avant0; out[k] = [x, d]; x += d; }
    return { out, fin: x };
  }, []);
  useEffect(() => {
    if (lenteur()) return undefined;
    let ra;
    const f = (now) => { const e = (now - debut) / 1000; setT(e); if (e < segments.fin) ra = requestAnimationFrame(f); };
    ra = requestAnimationFrame(f);
    return () => cancelAnimationFrame(ra);
  }, [debut, segments.fin]);
  const p = (k) => { const sg = segments.out[k]; return sg ? Math.max(0, Math.min(1, (t - sg[0]) / sg[1])) : 0; };

  const basculer = (id) => () => setCoches((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const modifie = pm && mail && (mail.objet !== pm.objet || mail.corps !== pm.corps || (mail.a || "") !== (pm.a || ""));
  const dateRelance = relanceLe || pr?.prochaine?.le;
  const choisie = ligneMonday ? (ligneMonday === "nouvelle" ? { nom: "Nouveau contact" } : (ligne?.candidates || []).find((c) => c.id === ligneMonday)) : null;

  // Le mail tel qu'il partira : celui retouché, sinon celui du modèle.
  const m = pm ? (mail || { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele }) : null;
  const pastille = (on) => `h-9 rounded-full border px-3.5 text-[13.5px] ${on ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`;
  const prenomDe = (e) => { const x = e.split("@")[0].split(".")[0]; return x.charAt(0).toUpperCase() + x.slice(1); };
  // « Pourquoi cette date » (8 oct. 2026) : la phrase exacte d'abord, puis le contexte de l'appel.
  const pourquoi = (q, aLaMain, defaut) => {
    if (aLaMain) return { label: "Pourquoi cette date", valeur: "Choisie à la main", large: true };
    const phrase = q.phrase || q.source || null;
    const lignes = [phrase ? `« ${phrase} »` : null, q.pourquoi || null, !phrase && q.incertain ? defaut : null].filter(Boolean);
    return { label: "Pourquoi cette date", valeur: lignes.join("\n\n") || "Selon l'issue", warn: !phrase && !q.pourquoi && !!q.incertain, large: true };
  };

  // Les cases Monday qu'on corrige ici sont celles que la validation sait reporter :
  // le contact, le téléphone, l'email (corrections) et la date de relance.
  const CLE_MONDAY = { Contact: "interlocuteur", "Téléphone": "telephone", "E-mail": "email" };
  const casesMonday = () => {
    if (!ligne) return [];
    if (ligne.etat === "indisponible" || ligne.etat === "info") return [{ label: "Monday", valeur: ligne.texte, warn: ligne.etat === "indisponible", large: true }];
    return (ligne.apercu || []).map((x) => {
      const statut = String(x.avant || "").replace(/\u200b/g, "").trim() ? "modifié" : "nouveau";
      const apres = String(x.apres ?? "").replace(/\u200b/g, "").trim();
      const cle = CLE_MONDAY[x.titre];
      if (x.titre === "Prochaine relance" && pr) return { label: x.titre, statut, edit: { type: "date", valeur: relanceLe || apres, changer: setRelanceLe } };
      if (cle && setEdits) return { label: x.titre, statut, edit: { type: "texte", valeur: edits?.[cle] ?? apres, changer: (v) => setEdits((e) => ({ ...e, [cle]: v })) } };
      if (x.titre === "Remarques") return { label: x.titre, statut: String(x.avant || "").trim() ? "ajout" : "nouveau", valeur: apres.replace(/^\+\s*/, ""), large: true };
      return { label: x.titre, statut, valeur: apres ? enJour(apres) : "(vidée)" };
    });
  };
  const mondayRetouche = !!relanceLe || ["interlocuteur", "telephone", "email"].some((k) => edits?.[k] != null);

  /** Ce que la fenêtre montre pour une étape : son titre, ses cases, et ce que « Rétablir » remet. */
  const contenuDe = (q) => {
    if (q.type === "monday") {
      const cases = casesMonday();
      return {
        kicker: "MONDAY · AGENTS IMMOBILIERS",
        titre: ligne?.etat === "trouvee" ? `${String(ligne.ligne.nom || "").replace(/\u200b/g, "").trim() || "Contact sans nom"} · ${agence?.nom || ""}`.replace(/ · $/, "") : ligne?.etat === "doute" ? (choisie ? choisie.nom : "Quel contact ?") : agence?.nom || appel.agent,
        haut: (
          <>
            {ligne?.etat === "trouvee" && <p className="m-0 text-[13.5px] text-ardoise">Déjà dans Monday, retrouvé par {ligne.par}.</p>}
            {ligne?.etat === "nouvelle" && <p className="m-0 text-[13.5px] text-ardoise">Pas encore dans Monday : une ligne sera créée.</p>}
            {ligne?.etat === "doute" && (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[15px] text-ambre">Plusieurs contacts possibles dans Monday : lequel est le bon ?</p>
                {(ligne.candidates || []).map((c) => (
                  <button key={c.id} type="button" onClick={() => setLigneMonday(c.id)}
                    className={`flex flex-col items-start gap-0.5 rounded-champ border px-4 py-3 text-left ${ligneMonday === c.id ? "border-menthe bg-menthe/10" : "border-trait hover:border-bord-doux"}`} style={ligneMonday === c.id ? undefined : { background: "transparent" }}>
                    <span className="text-[15px] text-encre">{c.nom}</span>
                    <span className="text-[13.5px] text-ardoise">{[c.entreprise, c.ville, c.telephone, c.email].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setLigneMonday("nouvelle")}
                  className={`rounded-champ border px-4 py-3 text-left text-[15px] ${ligneMonday === "nouvelle" ? "border-menthe bg-menthe/10 text-encre" : "border-trait text-craie hover:border-bord-doux"}`} style={ligneMonday === "nouvelle" ? undefined : { background: "transparent" }}>
                  Aucun : nouveau contact
                </button>
              </div>
            )}
          </>
        ),
        cases,
        aide: cases.some((c) => c.statut) ? `Cases en bleu : ce qu'AK écrit sur la ligne.${cases.some((c) => c.edit) ? " Cliquez sur une case pour la changer." : ""}` : null,
        retablir: mondayRetouche ? () => { setRelanceLe(null); setEdits?.((e) => { const n0 = { ...e }; delete n0.interlocuteur; delete n0.telephone; delete n0.email; return n0; }); } : null,
      };
    }
    if (q.type === "mail") {
      const contexte = pm.contexte && m.corps?.includes(pm.contexte) ? pm.contexte : null;
      const change = (k) => (v) => setMail({ ...m, [k]: v });
      return {
        kicker: "MAIL",
        titre: MAILS[m.modele || pm.modele] || pm.titre,
        haut: (
          <>
            {/* La boîte d'où il part (8 oct. 2026) : on la voit avant de valider. */}
            <p className={`m-0 text-[14px] ${pm.depuis ? "text-ardoise" : "text-ambre"}`}>{pm.depuis ? <>Mail envoyé depuis <span className="text-encre">{pm.depuis}</span></> : "Aucune boîte d'envoi connectée : le mail deviendra un brouillon à envoyer vous-même"}</p>
            {pm.variantes?.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {pm.variantes.map((v) => <button key={v.slug} type="button" onClick={() => setMail({ ...m, objet: v.objet, corps: v.corps, modele: v.slug })} className={pastille(m.modele === v.slug)} style={m.modele === v.slug ? undefined : { background: "transparent" }}>{MAILS[v.slug] || v.titre}</button>)}
              </div>
            )}
            {contexte && (
              <div className="flex items-start justify-between gap-3 rounded-champ bg-ambre/15 px-4 py-3">
                <span className="text-[14px] leading-[1.45] text-ambre">{contexte}</span>
                <button type="button" onClick={() => setMail({ ...m, corps: m.corps.replace(`${contexte}\n\n`, "").replace(contexte, "") })} className="flex-none p-0 text-[13.5px] text-ambre underline" style={{ background: "transparent" }}>Retirer</button>
              </div>
            )}
          </>
        ),
        cases: [
          { label: "À", statut: (m.a || "") !== (pm.a || "") ? "modifié" : null, warn: !m.a || (pm.a_incertain && m.a === pm.a), source: pm.a_incertain && m.a === pm.a ? pm.a_incertain : null, edit: { type: "texte", valeur: m.a, changer: change("a"), placeholder: "adresse@agence.fr" } },
          { label: "Objet", statut: m.objet !== pm.objet ? "modifié" : null, edit: { type: "texte", valeur: m.objet, changer: change("objet") } },
          { label: "Message", statut: m.corps !== pm.corps ? "modifié" : null, large: true, edit: { type: "zone", valeur: m.corps, changer: change("corps"), lignes: 12 } },
        ],
        aide: m.a ? "Le texte du modèle est fixe : seules les variables sont remplies. Il part depuis votre boîte dix secondes après la validation ; {signature} devient votre nom." : "Sans adresse, le mail ne part pas.",
        retablir: modifie || m.modele !== pm.modele ? () => setMail({ a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele }) : null,
      };
    }
    if (q.type === "relance") return {
      kicker: "FILE D'APPELS", titre: `Rappeler ${interlocuteur || agence?.nom || ""}`.trim(),
      cases: [
        { label: "Date", statut: relanceLe ? "modifié" : null, edit: { type: "date", valeur: dateRelance, changer: setRelanceLe } },
        pourquoi(pr, !!relanceLe, "Date par défaut : rien n'a été dit"),
        { label: "Quoi", valeur: pr.prochaine?.quoi, large: true },
        pr.prochaine?.si_fiche && { label: "Annulée", valeur: "Dès que la fiche arrive depuis son adresse", large: true },
      ].filter(Boolean),
      retablir: relanceLe ? () => setRelanceLe(null) : null,
    };
    if (q.type === "relance_suivante") return {
      kicker: "FILE D'APPELS · SECONDE RELANCE", titre: "Faire le point",
      cases: [
        { label: "Date", statut: relance2Le ? "modifié" : null, edit: { type: "date", valeur: relance2Le || pr2.prochaine?.le, changer: setRelance2Le } },
        pourquoi(pr2, !!relance2Le, "Date par défaut : trois semaines"),
        { label: "Quoi", valeur: pr2.prochaine?.quoi, large: true },
        { label: "Ordre", valeur: "Après la relance de la fiche ; si la fiche arrive, c'est elle qui devient la prochaine", large: true },
      ],
      retablir: relance2Le ? () => setRelance2Le(null) : null,
    };
    if (q.type === "diffusion") return {
      kicker: "EMAILING · LISTE DE DIFFUSION", titre: q.liste,
      cases: [
        { label: "Adresse", statut: "nouveau", valeur: m?.a || q.a || "Il manque l'adresse", warn: !(m?.a || q.a) },
        { label: "Annuler", valeur: "Retiré de la liste si vous annulez dans les dix secondes" },
        { label: "Effet", valeur: "Reçoit les nouvelles de Klocka : une partie des relances téléphoniques en moins", large: true },
      ],
    };
    if (q.type === "fiche") return {
      kicker: "FICHE · CE QUI S'AJOUTE", titre: agence?.nom || appel.agent,
      cases: [
        (q.infos?.secteurs || []).length && { label: "Secteurs", statut: "nouveau", valeur: q.infos.secteurs.join(", ") },
        q.infos?.email && { label: "Email", statut: "nouveau", valeur: q.infos.email },
        (q.infos?.notes || []).length && { label: "Notes", statut: "nouveau", valeur: q.infos.notes.join("\n"), large: true },
      ].filter(Boolean),
    };
    if (q.type === "nouveau_contact") return {
      kicker: "CONTACT DONNÉ PENDANT L'APPEL", titre: q.contact.nom || "Nouveau contact",
      cases: [
        q.contact.telephone && { label: "Téléphone", statut: "nouveau", valeur: q.contact.telephone, warn: !!q.incertain, source: q.incertain || null },
        q.contact.email && { label: "Email", statut: "nouveau", valeur: q.contact.email },
        { label: "D'où ça vient", valeur: `« ${q.source} »`, large: true },
        { label: "Suite", valeur: "Ajouté à l'agence et mis en tête de file aujourd'hui", large: true },
      ].filter(Boolean),
    };
    if (q.type === "ne_plus_appeler") return {
      kicker: "MONDAY · FILE D'APPELS", titre: "Ne plus appeler",
      cases: [
        { label: "Monday", statut: "modifié", valeur: "Ligne marquée « Ne plus appeler », relance vidée" },
        { label: "File", valeur: "L'agence ne revient plus dans les sessions" },
      ],
    };
    if (q.type === "signaler_bien") return {
      kicker: "BIEN ÉVOQUÉ", titre: q.biens[0],
      cases: [
        { label: "Biens", statut: "nouveau", valeur: q.biens.join("\n"), source: q.source ? `Dit : « ${q.source} »` : null, large: true },
        { label: "Suite", valeur: "Le dossier se crée quand la fiche arrive par mail", large: true },
      ],
    };
    if (q.type === "prevenir") return {
      kicker: "MESSAGE · NOTIFICATION", titre: "Prévenir un collègue",
      cases: [
        { label: "À", valeur: q.pour.map(prenomDe).join(", ") },
        { label: "Quand", valeur: "À la validation, dans les notifications de l'application" },
        { label: "Message", valeur: `Vous avez appelé ${agence?.nom || appel.agent} : ${ISS[issue] || ""}${appel.resume ? `. ${appel.resume}` : ""}`, large: true },
      ],
    };
    return { kicker: "ÉTAPE", titre: q.titre, cases: [{ label: "Détail", valeur: q.texte || q.titre, large: true }] };
  };

  const etape = (q, champs) => ({ k: q.id, q, on: q.toujours || coches.has(q.id), basculer: q.toujours ? null : basculer(q.id), voir: () => setOuverte(q.id), ...champs });
  const maintenant = [];
  if (pmo) {
    const detail = ligne?.etat === "trouvee" ? `${ligne.ligne.nom?.replace(/\u200b/g, "").trim() || "Contact sans nom"}, retrouvé par ${ligne.par}` : ligne?.etat === "nouvelle" ? "Nouveau contact" : ligne?.etat === "doute" ? (choisie ? `Contact choisi : ${choisie.nom}` : "C'est bien ce contact ? Choisissez") : ligne?.texte || "";
    maintenant.push(etape(pmo, { label: "Contact Monday", detail, warn: doute || ligne?.etat === "indisponible" }));
  }
  if (par("ne_plus_appeler")) maintenant.push(etape(par("ne_plus_appeler"), { label: "Ne plus appeler", detail: "Ni relance ni mail" }));
  if (pm) maintenant.push(etape(pm, { label: "Email", detail: `${MAILS[mail?.modele || pm.modele] || pm.titre} · ${mail?.a ? `à ${mail.a}` : "adresse manquante : il ne part pas"}${pm.a_incertain && mail?.a === pm.a ? " · adresse à vérifier" : ""}${modifie ? " · modifié" : ""}`, warn: !mail?.a || (pm.a_incertain && mail?.a === pm.a) }));
  if (pdi) maintenant.push(etape(pdi, { label: "Ajouter à la liste de diffusion agents", detail: pdi.a || mail?.a ? `${mail?.a || pdi.a}` : "il manque l'adresse", warn: !(pdi.a || mail?.a) }));
  for (const q of props.filter((x) => ["fiche", "signaler_bien", "nouveau_contact"].includes(x.type) && !x.cache)) {
    const lib = { fiche: "Compléter sa fiche", signaler_bien: "Noter le bien évoqué", nouveau_contact: "Appeler le contact donné" }[q.type];
    maintenant.push(etape(q, { label: lib, detail: String(q.titre).replace(/^Ajouter à sa fiche : /, "").replace(/^Noter le bien évoqué : /, ""), warn: !!q.incertain }));
  }
  const ensuite = [];
  if (pr) ensuite.push(etape(pr, { label: "Planifier la relance", detail: `${pr.prochaine?.quoi}${relanceLe ? " · date changée" : ""}`, warn: !relanceLe && !!pr.incertain }));
  if (pr2) ensuite.push(etape(pr2, { label: "Seconde relance", detail: `${jourLong(relance2Le || pr2.prochaine?.le)} · ${pr2.prochaine?.quoi}`, warn: !relance2Le && !!pr2.incertain }));
  const pv = par("prevenir");
  if (pv) ensuite.push(etape(pv, { label: "Prévenir un collègue", detail: pv.pour.map((e) => e.split("@")[0].split(".")[0]).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(", ") }));
  const n = [...maintenant, ...ensuite].filter((e) => e.on).length;
  // Les étapes de la fenêtre, rangées par moment : maintenant, puis chaque date de relance dans l'ordre.
  const COURT = { monday: "Contact Monday", ne_plus_appeler: "Ne plus appeler", mail: "Email", diffusion: "Liste de diffusion", fiche: "Compléter sa fiche", signaler_bien: "Bien évoqué", nouveau_contact: "Contact donné", relance: "Relance", relance_suivante: "Seconde relance", prevenir: "Prévenir un collègue" };
  const dateDe = (e) => (e.q.type === "relance" ? dateRelance : e.q.type === "relance_suivante" ? relance2Le || pr2?.prochaine?.le : null);
  const datees = ensuite.filter((e) => dateDe(e)).sort((x, y) => String(dateDe(x)).localeCompare(String(dateDe(y))));
  const pas = [
    ...[...maintenant, ...ensuite.filter((e) => !dateDe(e))].map((e) => ({ ...e, groupe: "Maintenant" })),
    ...datees.map((e) => ({ ...e, groupe: jourLong(dateDe(e)) })),
  ].map((e) => ({ ...e, court: COURT[e.q.type] || e.label }));
  const allume = (k) => p(k) >= 1;

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[12px] tracking-[.14em] text-ardoise">ACTIONS PROPOSÉES</span>
        <span className="flex items-center gap-2">
          <span className={`text-[13px] ${issue === "pas_interesse" ? "text-ardoise" : "text-menthe"}`}>{ISS[issue] || ""}</span>
          {/* AK s'est trompé d'issue : on la change, les actions se refont sur la même transcription. */}
          {onChangerIssue && <button type="button" onClick={() => setChoixIssue((x) => !x)} disabled={changementEnCours} className="p-0 text-[13px] text-ardoise underline hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>changer</button>}
        </span>
      </div>
      {choixIssue && onChangerIssue && (
        <div className="mb-3 flex flex-wrap justify-end gap-1.5 px-1">
          {Object.entries(ISS).filter(([k]) => k !== issue).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setChoixIssue(false); onChangerIssue(k); }} className="h-8 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>{l}</button>
          ))}
        </div>
      )}

      {maintenant.length > 0 && <Carte titre="MAINTENANT" etapes={maintenant} p={p("maintenant")} allume={allume("maintenant")} />}

      {ensuite.length > 0 && (
        <>
          <Trait p={p("v1")} />
          <Carte titre={pr ? jourLong(dateRelance).toUpperCase() : "ENSUITE"} etapes={ensuite} p={p("rappel")} allume={allume("rappel")} />
        </>
      )}

      {doute && <p className="m-0 mt-4 px-1 text-[14px] text-ambre">Monday a plusieurs contacts possibles : ouvrez « Contact Monday » et choisissez le bon.</p>}
      <button type="button" onClick={onLancer} disabled={envoi || !n || doute}
        className="mt-5 w-full rounded-full bg-encre py-[18px] text-[17px] text-fond hover:opacity-90 disabled:opacity-50">
        {envoi ? "Validation…" : `Valider · ${n} étape${n > 1 ? "s" : ""}`}
      </button>

      {ouverte && pas.some((x) => x.k === ouverte) && <Panneau pas={pas} ouverte={ouverte} setOuverte={setOuverte} contenuDe={contenuDe} onFermer={() => setOuverte(null)} />}
    </div>
  );
}
