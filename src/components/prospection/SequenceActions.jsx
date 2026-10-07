import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, X } from "lucide-react";

// Les actions proposées après un appel abouti, en séquence (maquette de
// Jules, 7 oct. 2026) : ce qui part maintenant (Monday, le mail du modèle, la
// liste de diffusion), puis le rappel à la date dite, modifiable. Chaque étape
// a son œil (le détail : ce qui change dans Monday, le mail à relire, la date)
// et son interrupteur ; Monday ne se décoche pas pour un appel abouti. Le
// tracé se dessine une fois à l'ouverture.

const MAILS = { "presentation-cahier": "Présentation + cahier des charges", presentation: "Présentation seule", "demande-documents": "Murs commerciaux" };
const ISSUES = { pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien intéressant", pas_interesse: "Pas intéressé" };
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
    <div className={`relative rounded-[18px] border border-trait bg-fond px-[18px] pb-1.5 pt-3.5 transition-opacity ${actif ? "" : "opacity-45"}`}>
      <p className={`m-0 mb-0.5 text-[12px] tracking-[.14em] transition-colors ${allume ? "text-menthe" : "text-ardoise"}`}>{titre}</p>
      {etapes.map((e) => <Etape key={e.k} e={e} />)}
      <Trace p={p} rayon={18} />
    </div>
  );
}

/** La feuille de détail qui glisse du bas : les champs avant → après, ou le mail à relire. */
function Feuille({ feuille, mail, onMail, onFermer }) {
  const [brouillon, setBrouillon] = useState(() => (feuille.mail ? { a: mail?.a || "", objet: mail?.objet || "", corps: mail?.corps || "", modele: mail?.modele || feuille.mail.modele } : null));
  const [date, setDate] = useState(feuille.date?.valeur || "");
  // La phrase de contexte du mail Murs commerciaux : surlignée, retirable.
  const contexte = feuille.mail?.contexte && brouillon?.corps?.includes(feuille.mail.contexte) ? feuille.mail.contexte : null;
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFermer]);
  const champ = "rounded-[12px] border border-trait bg-surface px-3.5 py-3 text-[16px] text-encre outline-none focus:border-menthe";
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="flex max-h-[86vh] w-full max-w-[520px] flex-col gap-[18px] overflow-auto rounded-t-[24px] border border-b-0 border-trait bg-surface-pleine px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
        <span className="h-1 w-10 self-center rounded-full bg-bord-vif" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] tracking-[.14em] text-ardoise">{feuille.kicker}</span>
            <span className="text-[22px] leading-[1.25] text-encre">{feuille.titre}</span>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-10 w-10 flex-none place-items-center rounded-full border border-trait text-craie hover:bg-relief" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>

        {feuille.champs && (
          <div className="flex flex-col">
            {feuille.champs.map((f) => (
              <div key={f.label} className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-3 border-t border-trait py-3">
                <span className="pt-0.5 text-[13px] text-ardoise">{f.label}</span>
                <span className="flex flex-col gap-0.5">
                  {f.avant && <span className="text-[13px] text-brume line-through">{f.avant}</span>}
                  <span className={`text-[16px] leading-[1.4] [text-wrap:pretty] ${f.warn ? "text-ambre" : "text-encre"}`}>{f.apres}</span>
                  {f.source && <span className="text-[12px] text-menthe">{f.source}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {feuille.texte && (
          <div className="flex flex-col gap-3">
            {feuille.a && <div className="flex gap-2.5 border-b border-trait pb-3 text-[14px]"><span className="w-11 flex-none text-ardoise">À</span><span className="text-encre">{feuille.a}</span></div>}
            {feuille.objet && <p className="m-0 text-[15px] text-encre">{feuille.objet}</p>}
            <p className="m-0 whitespace-pre-line rounded-[12px] border border-trait bg-surface px-3.5 py-3 text-[15px] leading-[1.55] text-craie">{feuille.texte}</p>
            {feuille.note && <span className="text-[12px] text-ardoise">{feuille.note}</span>}
          </div>
        )}

        {feuille.doute && (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[15px] text-ambre">C'est bien cette ligne ?</p>
            {feuille.doute.candidates.map((c) => (
              <button key={c.id} type="button" onClick={() => { feuille.doute.choisir(c.id); onFermer(); }}
                className={`flex flex-col items-start gap-0.5 rounded-[12px] border px-3.5 py-3 text-left ${feuille.doute.choisie === c.id ? "border-menthe bg-menthe/10" : "border-trait"}`} style={feuille.doute.choisie === c.id ? undefined : { background: "transparent" }}>
                <span className="text-[15px] text-encre">{c.nom}</span>
                <span className="text-[13px] text-ardoise">{[c.entreprise, c.ville, c.telephone, c.email].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
            <button type="button" onClick={() => { feuille.doute.choisir("nouvelle"); onFermer(); }}
              className={`rounded-[12px] border px-3.5 py-3 text-left text-[15px] ${feuille.doute.choisie === "nouvelle" ? "border-menthe bg-menthe/10 text-encre" : "border-trait text-craie"}`} style={feuille.doute.choisie === "nouvelle" ? undefined : { background: "transparent" }}>
              Aucune : créer une nouvelle ligne
            </button>
          </div>
        )}

        {feuille.date && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] text-ardoise">Date de la relance</span>
              <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={champ} /></label>
            <div className="flex justify-end">
              <button type="button" disabled={!date} onClick={() => { feuille.date.changer(date); onFermer(); }} className="rounded-full bg-encre px-6 py-3.5 text-[16px] text-fond hover:opacity-90 disabled:opacity-50">Enregistrer</button>
            </div>
          </div>
        )}

        {feuille.mail && brouillon && (
          <>
            {feuille.mail.variantes?.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {feuille.mail.variantes.map((v) => (
                  <button key={v.slug} type="button" onClick={() => setBrouillon({ ...brouillon, objet: v.objet, corps: v.corps, modele: v.slug })}
                    className={`h-8 rounded-full border px-3 text-[13px] ${brouillon.modele === v.slug ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie"}`} style={brouillon.modele === v.slug ? undefined : { background: "transparent" }}>
                    {MAILS[v.slug] || v.titre}
                  </button>
                ))}
              </div>
            )}
            {contexte && (
              <div className="flex items-start justify-between gap-3 rounded-[12px] bg-ambre/15 px-3.5 py-2.5">
                <span className="text-[14px] leading-[1.45] text-ambre">{contexte}</span>
                <button type="button" onClick={() => setBrouillon({ ...brouillon, corps: brouillon.corps.replace(`${contexte}\n\n`, "").replace(contexte, "") })} className="flex-none p-0 text-[13px] text-ambre underline" style={{ background: "transparent" }}>Retirer</button>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="text-[13px] text-ardoise">À</span>
                <input value={brouillon.a} onChange={(e) => setBrouillon({ ...brouillon, a: e.target.value })} placeholder="adresse@agence.fr" className={`${champ} ${brouillon.a ? "" : "border-ambre/60"}`} /></label>
              <label className="flex flex-col gap-1.5"><span className="text-[13px] text-ardoise">Objet</span>
                <input value={brouillon.objet} onChange={(e) => setBrouillon({ ...brouillon, objet: e.target.value })} className={champ} /></label>
              <label className="flex flex-col gap-1.5"><span className="text-[13px] text-ardoise">Message</span>
                <textarea value={brouillon.corps} onChange={(e) => setBrouillon({ ...brouillon, corps: e.target.value })} rows={12} className={`${champ} resize-y text-[15px] leading-[1.55]`} /></label>
              <span className="text-[12px] text-ardoise">{brouillon.a ? "Le texte du modèle est fixe : seules les variables sont remplies. Il part depuis votre boîte dix secondes après la validation ; {signature} devient votre nom." : "Sans adresse, le mail ne part pas."}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setBrouillon({ a: feuille.mail.a || "", objet: feuille.mail.objet, corps: feuille.mail.corps, modele: feuille.mail.modele })} className="p-0 text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Rétablir le texte proposé</button>
              <button type="button" onClick={() => { onMail(brouillon); onFermer(); }} className="rounded-full bg-encre px-6 py-3.5 text-[16px] text-fond hover:opacity-90">Enregistrer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{appel, agence, issue, coches: Set, setCoches, mail, setMail, relanceLe, setRelanceLe, ligneMonday, setLigneMonday, onLancer, envoi}} props
 */
export default function SequenceActions({ appel, agence, issue, coches, setCoches, mail, setMail, relanceLe, setRelanceLe, ligneMonday, setLigneMonday, onLancer, envoi = false }) {
  const props = appel.propositions || [];
  const par = (t) => props.find((p) => p.type === t);
  const pm = par("mail");
  const pr = par("relance");
  const pmo = par("monday");
  const pdi = par("diffusion");
  const compris = appel.compris?.champs || {};
  const interlocuteur = compris.interlocuteur?.valeur || agence?.interlocuteurs?.[0] || appel.avant?.interlocuteur || null;
  const [feuille, setFeuille] = useState(null);
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
  const choisie = ligneMonday ? (ligneMonday === "nouvelle" ? { nom: "Nouvelle ligne" } : (ligne?.candidates || []).find((c) => c.id === ligneMonday)) : null;

  const feuilles = {
    monday: () => ({
      kicker: "MONDAY · AGENTS IMMOBILIERS",
      titre: ligne?.etat === "trouvee" ? `${ligne.ligne.nom} · ligne existante` : ligne?.etat === "nouvelle" ? "Nouvelle ligne" : ligne?.etat === "doute" ? (choisie ? `${choisie.nom}` : "Quelle ligne ?") : agence?.nom || appel.agent,
      ...(ligne?.etat === "doute" ? { doute: { candidates: ligne.candidates || [], choisie: ligneMonday, choisir: setLigneMonday } } : {}),
      champs: ligne?.etat === "indisponible" || ligne?.etat === "info"
        ? [{ label: "Monday", apres: ligne.texte, warn: ligne.etat === "indisponible" }]
        : (ligne?.apercu || []).map((x) => ({ label: x.titre, avant: x.avant && x.avant !== x.apres ? String(x.avant).split("\n").slice(-1)[0] : null, apres: x.apres || "(vidée)", source: x.titre === "Prochaine relance" && relanceLe ? "Date changée : appliquée à la validation" : null })),
    }),
    mail: () => ({ kicker: "MAIL · DEPUIS VOTRE BOÎTE", titre: MAILS[mail?.modele || pm.modele] || pm.titre, mail: { ...pm, modele: pm.modele } }),
    diffusion: () => ({ kicker: "EMAILING · LISTE DE DIFFUSION", titre: pdi.liste, champs: [
      { label: "Adresse", apres: pdi.a || mail?.a || "(il manque l'adresse)", warn: !(pdi.a || mail?.a) },
      { label: "Effet", apres: "Reçoit les nouvelles de Klocka : une partie des relances téléphoniques en moins" },
      { label: "Annuler", apres: "Retiré de la liste si vous annulez dans les dix secondes" },
    ] }),
    relance: () => ({ kicker: "FILE D'APPELS", titre: `Rappeler ${interlocuteur || agence?.nom || ""}`.trim(), date: { valeur: dateRelance, changer: setRelanceLe }, champs: [
      { label: "Quoi", apres: pr.prochaine?.quoi },
      { label: "Pourquoi cette date", apres: relanceLe ? "Choisie à la main" : pr.source ? `Dit : « ${pr.source} »` : pr.incertain ? "Date par défaut : rien n'a été dit" : "Selon l'issue", warn: !relanceLe && !!pr.incertain },
      pr.prochaine?.si_fiche && { label: "Annulée", apres: "Dès que la fiche arrive depuis son adresse" },
    ].filter(Boolean) }),
    fiche: () => ({ kicker: "FICHE · CE QUI S'AJOUTE", titre: agence?.nom || appel.agent, champs: [
      ...(par("fiche")?.infos?.secteurs || []).length ? [{ label: "Secteurs", apres: par("fiche").infos.secteurs.join(", ") }] : [],
      ...par("fiche")?.infos?.email ? [{ label: "Email", apres: par("fiche").infos.email }] : [],
      ...(par("fiche")?.infos?.notes || []).map((n, i) => ({ label: i ? "" : "Notes", apres: n })),
    ] }),
    nouveau_contact: () => { const x = par("nouveau_contact"); return { kicker: "CONTACT DONNÉ PENDANT L'APPEL", titre: x.contact.nom || "Nouveau contact", champs: [
      x.contact.telephone && { label: "Téléphone", apres: x.contact.telephone, warn: !!x.incertain, source: x.incertain || null },
      x.contact.email && { label: "Email", apres: x.contact.email },
      { label: "D'où ça vient", apres: `« ${x.source} »` },
      { label: "Suite", apres: "Ajouté à l'agence et mis en tête de file aujourd'hui" },
    ].filter(Boolean) }; },
    ne_plus_appeler: () => ({ kicker: "MONDAY · FILE D'APPELS", titre: "Ne plus appeler", champs: [
      { label: "Monday", apres: "Ligne marquée « Ne plus appeler », relance vidée" },
      { label: "File", apres: "L'agence ne revient plus dans les sessions" },
    ] }),
    signaler_bien: () => { const b = par("signaler_bien"); return { kicker: "BIEN ÉVOQUÉ", titre: b.biens[0], champs: [
      ...b.biens.map((x, i) => ({ label: i ? "" : "Biens", apres: x, source: i === 0 && b.source ? `Dit : « ${b.source} »` : null })),
      { label: "Suite", apres: "Le dossier se crée quand la fiche arrive par mail" },
    ] }; },
    prevenir: () => { const x = par("prevenir"); return { kicker: "MESSAGE · NOTIFICATION", titre: "Prévenir un collègue", a: x.pour.map((e) => e.split("@")[0].split(".")[0]).join(", "), texte: `Vous avez appelé ${agence?.nom || appel.agent} : ${ISSUES[issue] || ""}${appel.resume ? `. ${appel.resume}` : ""}`, note: "Envoyé à la validation, dans les notifications de l'application." }; },
    autre: (q) => ({ kicker: "ÉTAPE", titre: q.titre, texte: q.texte || q.titre }),
  };
  const voir = (k, q) => () => setFeuille((feuilles[k] || feuilles.autre)(q));

  const etape = (q, champs) => ({ k: q.id, on: q.toujours || coches.has(q.id), basculer: q.toujours ? null : basculer(q.id), voir: voir(q.type, q), ...champs });
  const maintenant = [];
  if (pmo) {
    const detail = ligne?.etat === "trouvee" ? `Ligne de ${ligne.ligne.nom}, retrouvée par ${ligne.par}` : ligne?.etat === "nouvelle" ? "Nouvelle ligne" : ligne?.etat === "doute" ? (choisie ? `Ligne choisie : ${choisie.nom}` : "C'est bien cette ligne ? Choisissez") : ligne?.texte || "";
    maintenant.push(etape(pmo, { label: "Mettre à jour Monday", detail, warn: doute || ligne?.etat === "indisponible" }));
  }
  if (par("ne_plus_appeler")) maintenant.push(etape(par("ne_plus_appeler"), { label: "Ne plus appeler", detail: "Ni relance ni mail" }));
  if (pm) maintenant.push(etape(pm, { label: MAILS[mail?.modele || pm.modele] || "Mail", detail: `${mail?.a ? `à ${mail.a}` : "adresse manquante : il ne part pas"}${pm.a_incertain && mail?.a === pm.a ? " · adresse à vérifier" : ""}${modifie ? " · modifié" : ""}`, warn: !mail?.a || (pm.a_incertain && mail?.a === pm.a) }));
  if (pdi) maintenant.push(etape(pdi, { label: "Ajouter à la liste de diffusion agents", detail: pdi.a || mail?.a ? `${mail?.a || pdi.a}` : "il manque l'adresse", warn: !(pdi.a || mail?.a) }));
  for (const q of props.filter((x) => ["fiche", "signaler_bien", "nouveau_contact"].includes(x.type))) {
    const lib = { fiche: "Compléter sa fiche", signaler_bien: "Noter le bien évoqué", nouveau_contact: "Appeler le contact donné" }[q.type];
    maintenant.push(etape(q, { label: lib, detail: String(q.titre).replace(/^Ajouter à sa fiche : /, "").replace(/^Noter le bien évoqué : /, ""), warn: !!q.incertain }));
  }
  const ensuite = [];
  if (pr) ensuite.push(etape(pr, { label: "Planifier la relance", detail: `${pr.prochaine?.quoi}${relanceLe ? " · date changée" : ""}`, warn: !relanceLe && !!pr.incertain }));
  const pv = par("prevenir");
  if (pv) ensuite.push(etape(pv, { label: "Prévenir un collègue", detail: pv.pour.map((e) => e.split("@")[0].split(".")[0]).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(", ") }));
  const n = [...maintenant, ...ensuite].filter((e) => e.on).length;
  const allume = (k) => p(k) >= 1;

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[12px] tracking-[.14em] text-ardoise">ACTIONS PROPOSÉES</span>
        <span className={`text-[13px] ${issue === "pas_interesse" ? "text-ardoise" : "text-menthe"}`}>{ISSUES[issue] || ""}</span>
      </div>

      {maintenant.length > 0 && <Carte titre="MAINTENANT" etapes={maintenant} p={p("maintenant")} allume={allume("maintenant")} />}

      {ensuite.length > 0 && (
        <>
          <Trait p={p("v1")} />
          <Carte titre={pr ? jourLong(dateRelance).toUpperCase() : "ENSUITE"} etapes={ensuite} p={p("rappel")} allume={allume("rappel")} />
        </>
      )}

      {doute && <p className="m-0 mt-4 px-1 text-[14px] text-ambre">Monday a plusieurs lignes possibles : ouvrez « Mettre à jour Monday » et choisissez la bonne.</p>}
      <button type="button" onClick={onLancer} disabled={envoi || !n || doute}
        className="mt-5 w-full rounded-full bg-encre py-[18px] text-[17px] text-fond hover:opacity-90 disabled:opacity-50">
        {envoi ? "Validation…" : `Valider · ${n} étape${n > 1 ? "s" : ""}`}
      </button>

      {feuille && <Feuille feuille={feuille} mail={mail} onMail={(m) => setMail(m)} onFermer={() => setFeuille(null)} />}
    </div>
  );
}
