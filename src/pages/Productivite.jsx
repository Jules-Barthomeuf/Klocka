import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, themeEffectif } from "@/lib/personnalisation";
import { BoutonOutil, Cases, TitrePage } from "@/components/mandataire/elements";
import {
  PLANNING_DEFAUT, blocsDuJour, compteARebours, dureeCourte, enHeure, enMinutes, enMots, etatDuMoment, nomDeSite, normaliserPlanning, tempsDuJour,
} from "@/lib/productivite";

// Productivité (28 nov. 2026, Jules : « un autre onglet juste pour moi » ; « voir sa journée, préparer les heures où on
// va faire des pauses, et un timer jusqu'à chaque pause » ; « aussi pouvoir dire les temps de pause qu'on veut »).
// Dans le menu de Jules seul (RACCOURCIS_PAR_PERSONNE de src/lib/menu.js). La journée s'enregistre sur le compte
// (champ `productivite`), et se retrouve d'un appareil à l'autre. Le calcul est dans src/lib/productivite.js.
// Même jour : le temps de travail de la journée (« calculer le temps qu'on va passer à travailler »), et un bloqueur
// (« bloquer par exemple YouTube pendant ces temps de travail ») : une page web ne peut fermer aucun autre site, c'est
// donc une extension de navigateur (extensions/bloqueur-productivite : Firefox, Chrome et Safari), à qui la page envoie la
// journée par window.postMessage.

const CHAMP = "h-8 rounded-champ border border-bord-doux bg-surface px-2.5 text-[14px] tabular-nums text-encre outline-none focus:border-bord-vif max-md:h-10 max-md:text-[16px]";
const DUREES = [5, 10, 15, 30, 60];

function useMaintenant() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/** Ce que dit le compteur : l'étiquette au-dessus, la phrase dessous. */
function textes(e, jour) {
  if (e.phase === "avant") return { etiquette: "Avant le début de la journée", phrase: `Ta journée commence dans ${enMots(e.restant)}, à ${jour.debut}.` };
  if (e.phase === "pause") return { etiquette: `Pause de ${dureeCourte(e.pause.a - e.pause.de)}`, phrase: `Reprise dans ${enMots(e.restant)}, à ${enHeure(e.pause.a)}.` };
  if (e.phase === "travail" && e.pause) return { etiquette: `Avant la pause de ${enHeure(e.pause.de)}`, phrase: `Il te reste ${enMots(e.restant)} avant la pause.` };
  if (e.phase === "travail") return { etiquette: "Plus de pause aujourd'hui", phrase: `Fin de journée dans ${enMots(e.restant)}, à ${jour.fin}.` };
  return { etiquette: "Journée terminée", phrase: `C'est fini pour aujourd'hui. Demain, début à ${jour.debut}.` };
}

function Compteur({ jour, maintenant }) {
  const e = etatDuMoment(jour, maintenant);
  const { etiquette, phrase } = textes(e, jour);
  const fait = e.total ? Math.min(1, Math.max(0, 1 - e.restant / e.total)) : e.phase === "fini" ? 1 : 0;
  const ensuite = e.phase === "pause" ? e.suivante : null;

  // Le compte à rebours dans le titre de l'onglet : il se lit même quand la page est derrière.
  useEffect(() => {
    const avant = document.title;
    return () => { document.title = avant; };
  }, []);
  useEffect(() => {
    document.title = e.phase === "fini" ? "Productivité" : `${compteARebours(e.restant)} · ${e.phase === "pause" ? "pause" : e.pause ? "avant la pause" : e.phase === "avant" ? "avant le début" : "avant la fin"}`;
  }, [e.phase, e.restant, e.pause]);

  return (
    <section className="k-verre rounded-bloc px-6 py-8 md:px-10 md:py-12" aria-live="polite">
      <div className="text-[11px] uppercase tracking-[.16em] text-brume">{etiquette}</div>
      <div className={`mt-4 font-light leading-none tracking-[-0.03em] tabular-nums text-[clamp(56px,9vw,112px)] ${e.phase === "pause" ? "text-menthe" : e.phase === "fini" ? "text-brume" : "text-encre"}`}>
        {compteARebours(e.restant)}
      </div>
      <p className="m-0 mt-5 text-[15px] leading-[1.55] text-craie">{phrase}</p>
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-relief" role="progressbar" aria-label="Avancée de la séquence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fait * 100)}>
        <div className="h-full rounded-full bg-menthe transition-[width] duration-1000 ease-linear" style={{ width: `${fait * 100}%` }} />
      </div>
      {ensuite && <p className="m-0 mt-4 text-[13.5px] text-ardoise">Pause suivante à {enHeure(ensuite.de)}, {dureeCourte(ensuite.a - ensuite.de)}.</p>}
    </section>
  );
}

/** La journée sur une ligne : le travail en verre, les pauses en accent, l'heure qu'il est en trait. */
function Frise({ jour, maintenant }) {
  const blocs = blocsDuJour(jour);
  const debut = enMinutes(jour.debut);
  const fin = enMinutes(jour.fin);
  const place = (m) => `${((m - debut) / (fin - debut)) * 100}%`;
  const ici = maintenant.getHours() * 60 + maintenant.getMinutes() + maintenant.getSeconds() / 60;
  const pauses = blocs.filter((b) => b.type === "pause");
  const etat = (b) => (ici >= b.a ? "Passée" : ici >= b.de ? "En cours" : "À venir");
  const temps = tempsDuJour(jour, maintenant);

  return (
    <section className="k-verre rounded-bloc px-6 py-6 md:px-8">
      <h2 className="m-0 text-[20px] font-normal text-encre">Ta journée</h2>
      <Cases className="mt-4" items={[[dureeCourte(temps.travail), "de travail prévu"], [dureeCourte(temps.pauses), "de pause"], [temps.reste ? dureeCourte(temps.reste) : "0 min", "de travail restant"]]} />
      <div className="relative mt-10 h-9">
        <div className="absolute inset-0 overflow-hidden rounded-full bg-relief">
          {pauses.map((b) => (
            <div key={b.de} className={`absolute inset-y-0 bg-menthe ${ici >= b.a ? "opacity-40" : ""}`} style={{ left: place(b.de), width: `calc(${place(b.a)} - ${place(b.de)})` }} title={`Pause ${enHeure(b.de)} - ${enHeure(b.a)}`} />
          ))}
        </div>
        {pauses.map((b) => (
          <div key={`h${b.de}`} className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[12.5px] tabular-nums text-ardoise" style={{ left: `calc((${place(b.de)} + ${place(b.a)}) / 2)` }}>{enHeure(b.de)}</div>
        ))}
        {ici >= debut && ici <= fin && (
          <div className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-encre" style={{ left: place(ici) }} aria-label={`Il est ${enHeure(ici)}`} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[12.5px] tabular-nums text-brume"><span>{jour.debut}</span><span>{jour.fin}</span></div>
      <div className="mt-5">
        {pauses.length === 0 && <p className="m-0 text-[13.5px] text-ardoise">Aucune pause prévue. Ajoute-en une à droite.</p>}
        {pauses.map((b) => (
          <div key={`l${b.de}`} className="flex min-h-[42px] items-center justify-between gap-3.5 border-b border-trait py-1 text-[14px] last:border-b-0">
            <div className="min-w-0 tabular-nums text-encre">{enHeure(b.de)} - {enHeure(b.a)}<span className="ml-2 text-[13.5px] text-ardoise">{dureeCourte(b.a - b.de)}</span></div>
            <span className={`text-[12.5px] ${etat(b) === "En cours" ? "text-menthe" : etat(b) === "Passée" ? "text-brume" : "text-craie"}`}>{etat(b)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Les sites fermés pendant le travail, et si l'extension est là pour le faire. */
function Bloqueur({ brouillon, changer, present }) {
  const [saisie, setSaisie] = useState("");
  const sites = Array.isArray(brouillon.sites) ? brouillon.sites : PLANNING_DEFAUT.sites;
  const allume = brouillon.blocage !== false;
  const nom = nomDeSite(saisie);
  const ajouter = (e) => {
    e.preventDefault();
    if (!nom) return;
    if (!sites.includes(nom)) changer({ sites: [...sites, nom] });
    setSaisie("");
  };
  return (
    <section className="k-verre rounded-bloc px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[20px] font-normal text-encre">Bloquer pendant le travail</h2>
        <Switch checked={allume} onCheckedChange={(v) => changer({ blocage: v })} aria-label="Bloquer les sites pendant le travail" />
      </div>
      <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-ardoise">Ces sites se ferment pendant les temps de travail et rouvrent aux pauses.</p>
      <div className={`mt-4 flex flex-wrap gap-1.5 ${allume ? "" : "opacity-50"}`}>
        {sites.map((s) => (
          <span key={s} className="inline-flex h-8 items-center gap-1 rounded-full bg-relief pl-3 pr-1 text-[13.5px] text-encre max-md:h-10">
            {s}
            <button type="button" onClick={() => changer({ sites: sites.filter((x) => x !== s) })} aria-label={`Ne plus bloquer ${s}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-brume hover:text-alerte" style={{ background: "transparent" }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {sites.length === 0 && <span className="text-[13.5px] text-ardoise">Aucun site.</span>}
      </div>
      <form onSubmit={ajouter} className="mt-3 flex gap-2">
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="instagram.com" aria-label="Site à bloquer" className={`${CHAMP} min-w-0 flex-1`} />
        <BoutonOutil type="submit" disabled={!nom}><Plus className="h-4 w-4" />Ajouter</BoutonOutil>
      </form>
      <div className="mt-5 border-t border-trait pt-4 text-[12.5px] leading-[1.55]">
        {present
          ? <span className="text-menthe">Bloqueur actif dans ce navigateur.</span>
          : <span className="text-ardoise">Le bloqueur n'est pas installé dans ce navigateur (Firefox, Chrome, Arc, Edge ou Safari). La marche à suivre est dans extensions/bloqueur-productivite/LISEZMOI.md ; rouvre ensuite cette page.</span>}
      </div>
    </section>
  );
}

function Reglages({ brouillon, changer, etat, sombre }) {
  const pauses = brouillon.pauses || [];
  const poserPause = (i, patch) => changer({ pauses: pauses.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const ajouter = () => {
    // Une heure après la dernière pause, ou à l'heure pile qui vient.
    const derniere = pauses.map((p) => enMinutes(p.heure)).filter((m) => m != null).sort((x, y) => y - x)[0];
    const maintenant = new Date();
    const base = derniere != null ? derniere + 60 : (maintenant.getHours() + 1) * 60;
    changer({ pauses: [...pauses, { heure: enHeure(Math.min(base, 23 * 60 + 45)), duree: 15 }] });
  };
  const schema = sombre ? "[color-scheme:dark]" : "[color-scheme:light]";
  return (
    <section className="k-verre rounded-bloc px-6 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[20px] font-normal text-encre">Préparer la journée</h2>
        <span className="text-[12.5px] text-brume">{etat === "enregistrement" ? "Enregistrement…" : etat === "erreur" ? "Pas enregistré, réessaie" : "Enregistré"}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Début
          <input type="time" value={brouillon.debut || ""} onChange={(e) => changer({ debut: e.target.value })} className={`${CHAMP} ${schema}`} />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Fin
          <input type="time" value={brouillon.fin || ""} onChange={(e) => changer({ fin: e.target.value })} className={`${CHAMP} ${schema}`} />
        </label>
      </div>
      <div className="mt-6 text-[11px] uppercase tracking-[.16em] text-brume">Pauses</div>
      <div className="mt-2">
        {pauses.map((p, i) => (
          <div key={i} className="border-b border-trait py-3 last:border-b-0">
            <div className="flex items-center gap-2">
              <input type="time" value={p.heure || ""} onChange={(e) => poserPause(i, { heure: e.target.value })} aria-label="Heure de la pause" className={`${CHAMP} ${schema} w-[110px]`} />
              <input type="number" min={1} max={240} value={p.duree ?? ""} onChange={(e) => poserPause(i, { duree: e.target.value === "" ? "" : Number(e.target.value) })} aria-label="Durée de la pause, en minutes" className={`${CHAMP} w-[72px] text-right`} />
              <span className="text-[13.5px] text-ardoise">min</span>
              <button type="button" onClick={() => changer({ pauses: pauses.filter((_, j) => j !== i) })} aria-label="Retirer cette pause"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-brume transition-colors hover:bg-relief hover:text-alerte max-md:h-10 max-md:w-10" style={{ background: "transparent" }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Durées courantes">
              {DUREES.map((d) => (
                <button key={d} type="button" onClick={() => poserPause(i, { duree: d })} aria-pressed={Number(p.duree) === d}
                  className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] transition-colors max-md:h-9 ${Number(p.duree) === d ? "bg-rail-actif text-encre" : "text-ardoise hover:bg-relief hover:text-encre"}`}
                  style={Number(p.duree) === d ? undefined : { background: "transparent" }}>
                  {dureeCourte(d)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <BoutonOutil onClick={ajouter} className="mt-4"><Plus className="h-4 w-4" />Ajouter une pause</BoutonOutil>
    </section>
  );
}

export default function Productivite() {
  const { data: utilisateur } = useCurrentUser();
  const { prefs } = usePersonnalisation();
  const sombre = themeEffectif(prefs) !== CLAIR;
  const maintenant = useMaintenant();
  // Ce qu'on tape, tel quel (une heure à moitié saisie reste dans son champ) ; le compteur lit la version nettoyée.
  const [brouillon, setBrouillon] = useState(() => ({ ...PLANNING_DEFAUT, pauses: PLANNING_DEFAUT.pauses.map((p) => ({ ...p })) }));
  const [etat, setEtat] = useState("ok");
  const lu = useRef(null);
  const minuterie = useRef(null);

  // Le compte se relit toutes les minutes : la journée ne se reprend qu'une fois, sinon elle écraserait la saisie.
  useEffect(() => {
    if (!utilisateur?.id || lu.current === utilisateur.id) return;
    lu.current = utilisateur.id;
    if (utilisateur.productivite && typeof utilisateur.productivite === "object") setBrouillon(normaliserPlanning(utilisateur.productivite));
  }, [utilisateur]);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const jour = useMemo(() => normaliserPlanning(brouillon), [brouillon]);

  // L'extension du bloqueur : elle dit qu'elle est là, la page lui envoie la journée à chaque changement.
  const [bloqueur, setBloqueur] = useState(false);
  const envoyer = useRef(() => {});
  envoyer.current = () => window.postMessage({ source: "klocka-productivite", planning: jour }, window.location.origin);
  useEffect(() => {
    const ecouter = (e) => {
      if (e.source !== window || e.data?.source !== "klocka-bloqueur") return;
      if (e.data.recu) setBloqueur(true);
      if (e.data.pret) envoyer.current();
    };
    window.addEventListener("message", ecouter);
    return () => window.removeEventListener("message", ecouter);
  }, []);
  // Pas avant d'avoir lu le compte : la journée par défaut écraserait celle que l'extension garde.
  useEffect(() => { if (lu.current) envoyer.current(); }, [jour, utilisateur?.id]);

  const changer = (patch) => {
    const suivant = { ...brouillon, ...patch };
    setBrouillon(suivant);
    setEtat("enregistrement");
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(async () => {
      try {
        await base44.auth.updateMe({ productivite: normaliserPlanning(suivant) });
        setEtat("ok");
      } catch {
        setEtat("erreur");
      }
    }, 700);
  };

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1200px] px-5 py-[22px] md:px-8">
        <TitrePage titre="Productivité" className="mb-5" />
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Compteur jour={jour} maintenant={maintenant} />
            <Frise jour={jour} maintenant={maintenant} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Reglages brouillon={brouillon} changer={changer} etat={etat} sombre={sombre} />
            <Bloqueur brouillon={brouillon} changer={changer} present={bloqueur} />
          </div>
        </div>
      </div>
    </div>
  );
}
