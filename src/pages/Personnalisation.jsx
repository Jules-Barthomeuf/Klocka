import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { vueDe } from "@/lib/vue";
import { Check, Eye, EyeOff, Grip, Loader2, Pipette, RotateCcw } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, OPTIONS, POLICES, accentHex, barreHex, barreLisible, hexVersHsv, hsvVersHex, themeEffectif } from "@/lib/personnalisation";
import jetons from "@/design/jetons.json";
import { ENTREES_ADMIN, ENTREES_AUTRE, ENTREES_CLIENT, PAGES_OUVERTURE_ADMIN, PAGES_OUVERTURE_CLIENT, TOUJOURS_VISIBLE, repartir } from "@/lib/menu";
import ProfilCompte from "@/components/compte/ProfilCompte";
import AccesAdmins from "@/components/compte/AccesAdmins";
import CommunesAgent from "@/components/mandataire/CommunesAgent";

// La page Personnalisation : chacun règle l'application pour lui. Tout
// s'applique à l'instant, sur la page elle-même : c'est l'aperçu. Les
// réglages suivent le compte (PersonnalisationProvider), pas l'appareil.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";

/** Une ligne de réglage : le nom et sa note à gauche, les choix à droite. */
function Reglage({ titre, note, children }) {
  return (
    <div className="grid gap-3 border-t border-trait py-5 first:border-t-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div>
        <p className="m-0 text-[14px] font-medium text-encre">{titre}</p>
        {note && <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">{note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Des pilules à choix unique. `rendre` habille un libellé (une police, une forme). */
function Pilules({ valeur, valeurs = null, options, onChoisir, rendre }) {
  return options.map(([v, mot]) => {
    const actif = valeurs ? valeurs.includes(v) : v === valeur;
    return (
      <button
        key={String(v)}
        type="button"
        onClick={() => onChoisir(v)}
        aria-pressed={actif}
        className={`rounded-full border px-3.5 py-1.5 max-md:py-2 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/10 text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: actif ? undefined : "transparent" }}
      >
        {rendre ? rendre(v, mot) : mot}
      </button>
    );
  });
}

/** Les pastilles d'accent : la couleur elle-même, dans le thème affiché. */
function Accents({ valeur, theme, onChoisir }) {
  return OPTIONS.accent.map(([cle, nom]) => {
    const actif = cle === valeur;
    const couleur = accentHex(cle, theme);
    return (
      <button
        key={cle}
        type="button"
        onClick={() => onChoisir(cle)}
        aria-pressed={actif}
        title={nom}
        className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: "transparent" }}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: couleur }}>
          {actif && <Check className="h-3.5 w-3.5" style={{ color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .7)" }} strokeWidth={3} />}
        </span>
        {nom}
      </button>
    );
  });
}

/**
 * La couleur d'accent (9 oct. 2026) : les teintes proposées, la couleur
 * enregistrée (« Ma couleur »), et « Personnaliser » : le sélecteur, un
 * aperçu sur un bouton, puis « Enregistrer la couleur ».
 */
function ChoixAccent({ prefs, changer, theme }) {
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState(() => prefs.accent_perso || accentHex(prefs.accent, theme));
  const perso = /^#/.test(String(prefs.accent || ""));
  const pastille = (couleur, actif) => (
    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: couleur }}>
      {actif && <Check className="h-3.5 w-3.5" style={{ color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .7)" }} strokeWidth={3} />}
    </span>
  );
  const pilule = (actif) => `inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`;
  return (
    <>
      <Accents valeur={prefs.accent} theme={theme} onChoisir={(v) => { changer({ accent: v }); setOuvert(false); }} />
      {prefs.accent_perso && (
        <button type="button" onClick={() => { changer({ accent: prefs.accent_perso }); setOuvert(false); }} aria-pressed={perso} title="Votre couleur enregistrée" className={pilule(perso)} style={{ background: "transparent" }}>
          {pastille(prefs.accent_perso, perso)}Ma couleur
        </button>
      )}
      <button type="button" onClick={() => { setBrouillon(prefs.accent_perso || accentHex(prefs.accent, theme)); setOuvert((x) => !x); }} aria-expanded={ouvert} className={pilule(ouvert)} style={{ background: "transparent" }}>
        <span className="h-6 w-6 rounded-full" style={{ background: "conic-gradient(from 0deg, hsl(0 85% 60%), hsl(60 85% 60%), hsl(120 85% 55%), hsl(180 85% 55%), hsl(240 85% 65%), hsl(300 85% 62%), hsl(360 85% 60%))" }} />
        Personnaliser
      </button>
      {ouvert && (
        <div className="mt-2 flex w-full flex-wrap items-start gap-6 rounded-[14px] border border-trait p-4">
          <SelecteurCouleur valeur={brouillon} onChoisir={setBrouillon} />
          <div className="flex flex-col gap-3">
            <span className="text-[12px] text-brume">Aperçu</span>
            <span className="inline-flex h-10 items-center rounded-full px-5 text-[14px]" style={{ background: brouillon, color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .78)" }}>Valider · 4 étapes</span>
            <span className="text-[14px]" style={{ color: brouillon }}>Un lien, un état actif</span>
            <span className="mt-2 flex gap-2">
              <button type="button" onClick={() => { changer({ accent: brouillon, accent_perso: brouillon }); setOuvert(false); }} className="h-9 rounded-full bg-encre px-4 text-[13.5px] text-fond hover:opacity-90">Enregistrer la couleur</button>
              <button type="button" onClick={() => setOuvert(false)} className="h-9 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Le sélecteur de couleur : un carré (saturation de gauche à droite, valeur
 * de haut en bas) dans la teinte choisie, et le spectre dessous. On glisse
 * le curseur, ou on tape le code.
 */
function SelecteurCouleur({ valeur, onChoisir }) {
  const [hsv, setHsv] = useState(() => hexVersHsv(valeur));
  const [saisie, setSaisie] = useState(valeur);
  const carre = useRef(null);
  const spectre = useRef(null);
  useEffect(() => { setSaisie(valeur); if (hsvVersHex(...hsv) !== valeur) setHsv(hexVersHsv(valeur)); }, [valeur]);
  const poser = (h, s0, v) => { setHsv([h, s0, v]); onChoisir(hsvVersHex(h, s0, v)); };
  const glisser = (zone, lire) => (e) => {
    const el = zone.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    const suivre = (ev) => { const r = el.getBoundingClientRect(); lire(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    suivre(e);
    const fin = () => { el.removeEventListener("pointermove", suivre); el.removeEventListener("pointerup", fin); el.removeEventListener("pointercancel", fin); };
    el.addEventListener("pointermove", suivre);
    el.addEventListener("pointerup", fin);
    el.addEventListener("pointercancel", fin);
  };
  const [h, sat, val] = hsv;
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3">
      <div
        ref={carre}
        onPointerDown={glisser(carre, (x, y) => poser(h, x, 1 - y))}
        className="relative h-[170px] cursor-crosshair touch-none rounded-[10px]"
        style={{ backgroundColor: `hsl(${h} 100% 50%)`, backgroundImage: "linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, rgb(255 255 255), transparent)" }}
      >
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%`, borderColor: "rgb(255 255 255)", boxShadow: "0 0 0 1px rgb(0 0 0 / .4)", background: valeur }} />
      </div>
      <div
        ref={spectre}
        onPointerDown={glisser(spectre, (x) => poser(x * 360, sat, val))}
        className="relative h-3 cursor-pointer touch-none rounded-full"
        style={{ backgroundImage: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((d) => `hsl(${d} 100% 50%)`).join(", ")})` }}
      >
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${(h / 360) * 100}%`, borderColor: "rgb(255 255 255)", boxShadow: "0 0 0 1px rgb(0 0 0 / .4)", background: `hsl(${h} 100% 50%)` }} />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ardoise">
        Code
        <input
          value={saisie}
          onChange={(e) => { const v = e.target.value.trim(); setSaisie(v); if (/^#?[0-9a-f]{6}$/i.test(v)) onChoisir((v.startsWith("#") ? v : `#${v}`).toLowerCase()); }}
          spellCheck={false}
          className="w-[96px] rounded-md border border-bord-doux bg-transparent px-2 py-1 font-mono text-[12.5px] text-encre outline-none focus:border-menthe"
        />
      </label>
    </div>
  );
}

/**
 * La couleur de la barre latérale pour un mode : les teintes proposées, puis
 * « Personnaliser », qui ouvre le sélecteur. Les panneaux de l'application
 * (listes, mode appel, dossiers, fiches, barre de chat) la reprennent.
 */
function ChoixBarre({ mode, prefs, changer, theme }) {
  const cle = `barre_${mode}`;
  const choix = prefs[cle];
  const teintes = Object.entries(jetons.barres[mode]);
  const perso = choix.startsWith("#");
  const [ouvert, setOuvert] = useState(perso);
  const hex = barreHex(prefs, mode === "clair" ? CLAIR : "sombre");
  const pastille = (actif) => `inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`;
  return (
    <>
      {teintes.map(([k, t]) => (
        <button key={k} type="button" onClick={() => { changer({ [cle]: k }); setOuvert(false); }} aria-pressed={choix === k} className={pastille(choix === k)} style={{ background: "transparent" }}>
          <span className="h-6 w-6 rounded-full border border-bord-vif" style={{ background: t.teinte }} />{t.nom}
        </button>
      ))}
      <button type="button" onClick={() => { setOuvert(true); if (!perso) changer({ [cle]: hex }); }} aria-pressed={perso} className={pastille(perso)} style={{ background: "transparent" }}>
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: perso ? choix : "conic-gradient(hsl(0 85% 60%), hsl(60 85% 60%), hsl(120 85% 60%), hsl(180 85% 60%), hsl(240 85% 60%), hsl(300 85% 60%), hsl(360 85% 60%))" }}>
          {!perso && <Pipette className="h-3 w-3" style={{ color: "rgb(255 255 255)" }} />}
        </span>
        Personnaliser
      </button>
      {perso && ouvert && (
        <div className="k-monte mt-2 flex w-full flex-wrap items-start gap-5">
          <SelecteurCouleur valeur={choix} onChoisir={(v) => changer({ [cle]: v })} />
          <div className="flex flex-col gap-2 text-[12.5px]">
            <span className="text-ardoise">Aperçu</span>
            <span className="flex h-[74px] w-[140px] overflow-hidden rounded-[10px] border border-bord-doux">
              <span className="w-[36px]" style={{ background: choix }} />
              <span className="flex-1 bg-fond p-2"><span className="block h-full rounded-[6px]" style={{ background: choix }} /></span>
            </span>
            {!barreLisible(choix, mode === "clair" ? CLAIR : "sombre") && <span className="max-w-[220px] text-ambre">Le texte du mode {mode} sera peu lisible sur cette teinte.</span>}
            {(mode === "clair") !== (theme === CLAIR) && <span className="max-w-[220px] text-brume">Se voit quand le mode {mode} est affiché.</span>}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Le menu en deux listes, le principal et « Autre ». On attrape une entrée
 * et on la pose où l'on veut, dans la même liste ou dans l'autre ; toutes
 * peuvent aller d'un côté comme de l'autre. L'œil la masque (sauf
 * Personnalisation, sans quoi plus moyen de revenir ici).
 */
function EditeurMenu({ principales, autres, prefs, changer }) {
  const { principal, autre } = repartir(principales, autres, { ordre: prefs.menu_ordre, masques: [], menuAutre: prefs.menu_autre });
  const [tenue, setTenue] = React.useState(null); // la clé qu'on déplace
  const [cible, setCible] = React.useState(null); // { groupe, avant } : où elle tomberait

  const poser = (groupe, avant) => {
    if (!tenue) return;
    const listes = { principal: principal.map((e) => e.cle), autre: autre.map((e) => e.cle) };
    for (const g of Object.keys(listes)) listes[g] = listes[g].filter((c) => c !== tenue);
    const dest = listes[groupe];
    const at = avant ? dest.indexOf(avant) : -1;
    if (at < 0) dest.push(tenue); else dest.splice(at, 0, tenue);
    changer({ menu_ordre: [...listes.principal, ...listes.autre], menu_autre: listes.autre });
    setTenue(null); setCible(null);
  };
  const basculer = (cle) => {
    const masques = prefs.menu_masques.includes(cle) ? prefs.menu_masques.filter((c) => c !== cle) : [...prefs.menu_masques, cle];
    changer({ menu_masques: masques });
  };

  // Une fonction et non un composant : un composant défini ici serait remonté
  // à chaque survol, et l'entrée qu'on tient disparaîtrait en plein glisser.
  const liste = (groupe, titre, entrees) => (
    <div
      className={`flex min-h-[120px] flex-col gap-1.5 rounded-[14px] border p-2 transition-colors ${cible?.groupe === groupe ? "border-menthe/60 bg-menthe/[0.05]" : "border-trait"}`}
      onDragOver={(ev) => { ev.preventDefault(); if (cible?.groupe !== groupe || cible?.avant) setCible({ groupe, avant: null }); }}
      onDrop={(ev) => { ev.preventDefault(); poser(groupe, null); }}
    >
      <p className="m-0 px-2 pt-1 pb-1 text-[13px] text-ardoise">{titre}</p>
      {entrees.map((e) => {
        const masquee = prefs.menu_masques.includes(e.cle);
        const fixe = e.cle === TOUJOURS_VISIBLE;
        return (
          <div
            key={e.cle}
            draggable
            onDragStart={(ev) => { setTenue(e.cle); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", e.cle); }}
            onDragEnd={() => { setTenue(null); setCible(null); }}
            onDragOver={(ev) => { ev.preventDefault(); ev.stopPropagation(); if (cible?.avant !== e.cle) setCible({ groupe, avant: e.cle }); }}
            onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); poser(groupe, e.cle); }}
            className={`flex cursor-grab items-center gap-2 rounded-[10px] border bg-surface-pleine px-2.5 py-1.5 active:cursor-grabbing ${tenue === e.cle ? "opacity-40" : ""} ${cible?.avant === e.cle && tenue !== e.cle ? "border-menthe" : "border-trait"} ${masquee ? "opacity-60" : ""}`}
          >
            <span className="grid h-7 w-7 flex-none cursor-grab place-items-center rounded-[8px] text-ardoise hover:bg-relief hover:text-encre active:cursor-grabbing" title="Attraper pour déplacer" aria-label={`Déplacer ${e.label}`}>
              <Grip className="h-4 w-4" />
            </span>
            <span className={`flex-1 text-[13.5px] ${masquee ? "text-brume line-through" : "text-encre"}`}>{e.label}</span>
            {!fixe && (
              <button type="button" onClick={() => basculer(e.cle)} aria-label={masquee ? `Montrer ${e.label}` : `Masquer ${e.label}`} title={masquee ? "Masquée : cliquer pour la montrer" : "Visible : cliquer pour la masquer"} className="grid h-7 w-7 place-items-center rounded-full text-craie hover:text-encre" style={{ background: "transparent" }}>
                {masquee ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        );
      })}
      {!entrees.length && <p className="m-0 px-2 py-3 text-[12.5px] text-brume">Déposez une entrée ici.</p>}
    </div>
  );

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      {liste("principal", "Menu principal", principal)}
      {liste("autre", "Autre", autre)}
    </div>
  );
}

// L'assistant Klocka (AK), réglé par chacun pour lui : s'il le prévient en
// privé quand une fiche arrive, et sa façon de lui répondre (le questionnaire
// de la page Mon assistant, en entier ici). Réservé à l'équipe : un client n'a
// pas AK.
const AVIS = [["oui", "Oui"], ["non", "Non"], ["", "Sans avis"]];

/** La bannière en bas des mails (8 oct. 2026) : celle de son adresse Klocka, telle qu'elle part. */
function SignatureMails({ email }) {
  const [absente, setAbsente] = useState(false);
  const local = String(email || "").toLowerCase().endsWith("@klocka.immo") ? String(email).toLowerCase().split("@")[0] : null;
  return (
    <section className="mt-5 rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
      <p className={`${etiq} pt-4`}>Mails</p>
      <Reglage titre="Signature des mails" note="En bas de chaque mail parti de votre boîte Klocka, à la place de la signature en texte.">
        {local && !absente
          ? <img src={`/signatures/${local}.jpg`} alt="Votre bannière de signature" onError={() => setAbsente(true)} className="block w-full max-w-[500px] rounded-[8px]" />
          : <p className="m-0 text-[13.5px] text-ardoise">Pas encore de bannière pour {email || "cette adresse"} : demandez-la à Jules.</p>}
      </Reglage>
    </section>
  );
}

function ReglagesAssistant() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["ak-questionnaire"], queryFn: () => base44.request("GET", "/api/ak/questionnaire") });
  const [reponses, setReponses] = useState(null);
  const [prevenir, setPrevenir] = useState(null);
  const [etat, setEtat] = useState("ok");
  const dernier = useRef(null);
  const minuteur = useRef(null);
  useEffect(() => {
    if (!data || reponses) return;
    setReponses(data.reponses || {});
    setPrevenir(!!data.prevenir_fiches);
  }, [data, reponses]);

  // Chaque choix part après une courte pause, avec l'état complet : le serveur
  // remplace les réponses d'un bloc.
  const sauver = (suiteReponses, suitePrevenir) => {
    dernier.current = { reponses: suiteReponses, prevenir_fiches: suitePrevenir };
    setEtat("enregistrement");
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      try {
        const r = await base44.request("POST", "/api/ak/questionnaire", { body: dernier.current });
        queryClient.setQueryData(["ak-questionnaire"], (d) => ({ ...d, reponses: r.reponses, consignes: r.consignes, prevenir_fiches: r.prevenir_fiches }));
        setEtat("ok");
      } catch {
        setEtat("erreur");
      }
    }, 500);
  };
  const choisir = (id, v) => {
    const suite = { ...reponses };
    if (v) suite[id] = v; else delete suite[id];
    setReponses(suite);
    sauver(suite, prevenir);
  };

  const themes = [];
  for (const q of data?.questions || []) {
    let t = themes.find((x) => x.nom === q.theme);
    if (!t) themes.push((t = { nom: q.theme, questions: [] }));
    t.questions.push(q);
  }

  return (
    <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
      <div className="flex items-baseline justify-between gap-3 pt-4">
        <p className={etiq}>Assistant Klocka</p>
        <span className={`text-[11.5px] ${etat === "erreur" ? "text-alerte" : "text-brume"}`}>{etat === "enregistrement" ? "Enregistrement…" : etat === "erreur" ? "Pas enregistré" : ""}</span>
      </div>
      {isLoading || (!reponses && !isError) ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
      ) : isError ? (
        <p className="m-0 py-5 text-[13px] text-ardoise">Réglages de l'assistant indisponibles.</p>
      ) : (
        <>
          <div className="border-b border-trait py-5">
            <p className="m-0 text-[14px] font-medium text-encre">Me prévenir quand une fiche arrive</p>
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">AK t'écrit en privé dans Google Chat : qui l'envoie, les pièces, et s'il la préanalyse. Tu réponds oui ou non.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pilules valeur={prevenir} options={[[true, "Oui"], [false, "Non"]]} onChoisir={(v) => { setPrevenir(v); sauver(reponses, v); }} />
            </div>
          </div>
          {themes.map((t) => (
            <div key={t.nom} className="border-b border-trait py-4 last:border-b-0">
              <p className="m-0 mb-3 text-[12.5px] text-brume">{t.nom}</p>
              <div className="flex flex-col gap-4">
                {t.questions.map((q) => (
                  <div key={q.id}>
                    <p className="m-0 text-[13.5px] text-encre" title={q.exemple || undefined}>{q.titre}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pilules valeur={reponses[q.id] || ""} options={AVIS} onChoisir={(v) => choisir(q.id, v)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="m-0 pb-4 pt-3 text-[12px] text-brume">
            Des exemples pour chaque réglage dans <Link to={createPageUrl("MonAssistant")} className="text-craie underline underline-offset-2 hover:text-encre">Mon assistant</Link>.
          </p>
        </>
      )}
    </section>
  );
}

export default function Personnalisation() {
  const user = useUser();
  const { prefs, changer, reinitialiser, etat, connecte } = usePersonnalisation();
  const admin = user?.role === "admin";
  // La vue client (un client, ou un admin qui regarde comme lui) : pas de page
  // d'ouverture, d'entrées de menu ni de bulle d'assistant, et tout dans une
  // seule carte.
  // Un admin en Vue Client ou en Vue Mandataire règle comme un client : pas
  // d'éditeur du menu admin ni de réglages de l'assistant dans ces vues.
  const vueClient = !admin || vueDe(user) !== "admin";
  // Le mandataire (ou l'admin en Vue Mandataire) a la page large de l'équipe :
  // ses réglages à gauche, ses habilitations à droite, là où l'admin a l'assistant.
  const vueMandataire = vueDe(user) === "mandataire";
  // « Choisir les communes » (onglet Agent IA) arrive sur #agent.
  useEffect(() => {
    if (!vueMandataire || window.location.hash !== "#agent") return undefined;
    const t = setTimeout(() => document.getElementById("agent")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [vueMandataire]);
  const large = !vueClient || vueMandataire;
  // Les sections de la page, selon qui regarde.
  const sections = [
    ["profil", "Profil", true],
    ["acces", "Accès de l'équipe", !vueClient && !!user?.gere_les_acces],
    ["agent", "Agent IA", vueMandataire],
    ["couleurs", "Couleurs", true],
    ["affichage", "Affichage", true],
    ["navigation", "Navigation", !vueClient],
    ["signature", "Signature", admin && !vueClient],
    ["assistant", "Assistant", !vueClient],
    ["habilitations", "Habilitations", vueMandataire],
  ].filter((x) => x[2]);
  const [sectionBrute, setSection] = useState(() => { try { return (typeof window !== "undefined" && window.location.hash === "#agent") ? "agent" : localStorage.getItem("compte.section") || "profil"; } catch { return "profil"; } });
  const section = sections.some(([k]) => k === sectionBrute) ? sectionBrute : "profil";
  const choisir = (k) => { setSection(k); try { localStorage.setItem("compte.section", k); } catch { /* navigation privée */ } };
  const theme = themeEffectif(prefs);
  const etatMot = !connecte ? "Sur cet appareil seulement" : etat === "enregistrement" ? "Enregistrement…" : etat === "erreur" ? "Pas enregistré : le serveur n'a pas répondu" : "Enregistré sur votre compte";

  return (
    <div className={`mx-auto w-full px-5 py-8 md:px-6 md:py-10 ${large ? "max-w-[1100px]" : "max-w-[980px]"}`}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Compte</h1>
          <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-craie">Votre profil, puis vos réglages. Tout s'applique tout de suite, et vous suit d'un appareil à l'autre.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[12.5px] ${etat === "erreur" ? "text-alerte" : "text-brume"}`}>{etatMot}</span>
          <button type="button" onClick={reinitialiser} className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" />Réglages d'origine
          </button>
        </div>
      </header>

      {/* Les sections en onglets (9 oct. 2026) : on va droit à la bonne, sans faire défiler toute la page. */}
      <nav className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections du compte">
        {sections.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => choisir(k)} aria-pressed={section === k}
            className={`inline-flex h-9 flex-none items-center rounded-full border-0 px-4 text-[14px] transition-colors ${section === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
            style={section === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </nav>

      <div key={section} className="duration-300 animate-in fade-in-0">
      {/* Qui vous êtes : photo, nom, mot de passe ; pour un mandataire, ses documents. */}
      {section === "profil" && <ProfilCompte user={user} partie={vueMandataire ? "haut" : "tout"} />}

      {/* Jules seul : qui, parmi les admins, ouvre quelles pages. */}
      {section === "acces" && <AccesAdmins />}

      {/* Le mandataire : où cherche son agent IA, réglé à l'accueil, modifiable ici. */}
      {section === "agent" && (
        <section id="agent" className="scroll-mt-6 rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
          <p className={`${etiq} pt-4`}>Votre agent IA</p>
          <Reglage titre="Où il cherche" note="Les villes Klocka sont toujours lues. Cochez les autres communes de votre secteur que vous travaillez pour votre activité.">
            <CommunesAgent />
          </Reglage>
        </section>
      )}

      {section === "couleurs" && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <Reglage titre="Mode" note="Sombre, clair, ou celui de l'appareil, qui change avec lui.">
          <Pilules valeur={prefs.mode} options={OPTIONS.mode} onChoisir={(v) => changer({ mode: v })} />
        </Reglage>
        <Reglage titre="Couleur d'accent" note="Boutons, liens, états actifs et pastilles. En clair, la teinte descend d'un cran pour rester lisible.">
          <ChoixAccent prefs={prefs} changer={changer} theme={theme} />
        </Reglage>
        <Reglage titre="Fond" note="Le fond de l'application, pour chacun des deux modes.">
          <span className="w-full text-[12px] text-brume">En sombre</span>
          <Pilules valeur={prefs.fond_sombre} options={OPTIONS.fond_sombre} onChoisir={(v) => changer({ fond_sombre: v })} />
          <span className="mt-1 w-full text-[12px] text-brume">En clair</span>
          <Pilules valeur={prefs.fond_clair} options={OPTIONS.fond_clair} onChoisir={(v) => changer({ fond_clair: v })} />
        </Reglage>
        <Reglage titre="Couleur de la barre" note="La barre de gauche, et avec elle le fond des listes, du mode appel, des dossiers, des fiches et de la barre de chat. Une teinte proposée, ou n'importe laquelle.">
          <span className="w-full text-[12px] text-brume">En sombre</span>
          <ChoixBarre mode="sombre" prefs={prefs} changer={changer} theme={theme} />
          <span className="mt-1 w-full text-[12px] text-brume">En clair</span>
          <ChoixBarre mode="clair" prefs={prefs} changer={changer} theme={theme} />
        </Reglage>
        <Reglage titre="Halo" note="Les nappes de couleur derrière les pages, en sombre. Le clair n'en a jamais.">
          <Pilules valeur={prefs.halo} options={OPTIONS.halo} onChoisir={(v) => changer({ halo: v })} />
        </Reglage>
      </section>
      )}

      {section === "affichage" && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <Reglage titre="Points dans la fenêtre des actions" note="Le fond de la fenêtre qui détaille les actions proposées après un appel.">
          <Pilules valeur={prefs.points_actions} options={OPTIONS.points_actions} onChoisir={(v) => changer({ points_actions: v })} />
        </Reglage>
        <Reglage titre="Grille de points" note="Des points discrets en fond, là où vous les voulez. « Listes et mode appel » : les listes et le mode appel de la Prospection et des Relances. Plusieurs choix possibles ; aucun, pas de points.">
          <Pilules valeurs={prefs.grille} options={OPTIONS.grille}
            onChoisir={(v) => changer({ grille: prefs.grille.includes(v) ? prefs.grille.filter((z) => z !== v) : [...prefs.grille, v] })} />
          <label className="mt-2 flex w-full max-w-[420px] items-center gap-3">
            <span className="flex-none text-[12px] text-brume">Intensité</span>
            <input type="range" min={10} max={100} step={5} value={prefs.grille_intensite} disabled={!prefs.grille.length}
              onChange={(e) => changer({ grille_intensite: Number(e.target.value) })} aria-label="Intensité des points" className="min-w-0 flex-1 disabled:opacity-40" />
            <span className="w-10 flex-none text-right text-[12px] tabular-nums text-brume">{prefs.grille_intensite} %</span>
          </label>
        </Reglage>
        <Reglage titre="Surfaces" note="Les blocs et les cartes : du verre qui laisse voir le fond, ou des aplats.">
          <Pilules valeur={prefs.surfaces} options={OPTIONS.surfaces} onChoisir={(v) => changer({ surfaces: v })} />
        </Reglage>
        <Reglage titre="Police" note="Partout, ALX compris.">
          <Pilules valeur={prefs.police} options={OPTIONS.police} onChoisir={(v) => changer({ police: v })} rendre={(v, mot) => <span style={{ fontFamily: POLICES[v] }}>{mot}</span>} />
        </Reglage>
        <Reglage titre="Forme des boutons" note="Les pilules sont la forme de l'action chez Klocka. Les autres formes valent pour tous les boutons.">
          <Pilules valeur={prefs.boutons} options={OPTIONS.boutons} onChoisir={(v) => changer({ boutons: v })} rendre={(v, mot) => (
            <span className="inline-flex items-center gap-2"><span className="inline-block h-3.5 w-6 border border-current" style={{ borderRadius: v === "pilule" ? 999 : v === "arrondi" ? 5 : 1 }} />{mot}</span>
          )} />
        </Reglage>
        <Reglage titre="Taille de l'interface" note="Tout grossit ou rétrécit d'un bloc, texte et espacements.">
          <Pilules valeur={prefs.taille} options={OPTIONS.taille} onChoisir={(v) => changer({ taille: v })} />
        </Reglage>
        <Reglage titre="Animations" note="Réduites : les transitions et les mouvements s'effacent.">
          <Pilules valeur={prefs.animations} options={OPTIONS.animations} onChoisir={(v) => changer({ animations: v })} />
        </Reglage>
        {vueClient && (
          <Reglage titre="Barre latérale" note="Au démarrage. Le chevron la replie ou la déplie ensuite, comme avant.">
            <Pilules valeur={prefs.barre} options={OPTIONS.barre} onChoisir={(v) => changer({ barre: v })} />
          </Reglage>
        )}
      </section>
      )}

      {section === "navigation" && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <Reglage titre="Page d'ouverture" note="La page qui s'ouvre quand vous arrivez sur Klocka.">
          <Pilules valeur={prefs.accueil} options={admin ? PAGES_OUVERTURE_ADMIN : PAGES_OUVERTURE_CLIENT} onChoisir={(v) => changer({ accueil: v })} />
        </Reglage>
        <Reglage titre="Barre latérale" note="Au démarrage. Le chevron la replie ou la déplie ensuite, comme avant.">
          <Pilules valeur={prefs.barre} options={OPTIONS.barre} onChoisir={(v) => changer({ barre: v })} />
        </Reglage>
        <Reglage titre="Entrées du menu" note="Glissez une entrée pour la déplacer, dans sa liste ou dans l'autre : tout peut aller dans le menu principal ou dans « Autre ». L'œil masque une entrée.">
          <EditeurMenu principales={admin ? ENTREES_ADMIN : ENTREES_CLIENT} autres={admin ? ENTREES_AUTRE : []} prefs={prefs} changer={changer} />
        </Reglage>
        <Reglage titre="Bulle de l'assistant" note="La pilule qui ouvre AK sur les pages de travail.">
          <Pilules valeur={prefs.assistant} options={OPTIONS.assistant} onChoisir={(v) => changer({ assistant: v })} />
        </Reglage>
      </section>
      )}

      {section === "signature" && <SignatureMails email={user?.email} />}
      {section === "assistant" && <ReglagesAssistant />}
      {section === "habilitations" && <ProfilCompte user={user} partie="habilitations" />}
      </div>
    </div>
  );
}
