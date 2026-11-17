import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CeQueKlockaSait from "@/components/layer/CeQueKlockaSait";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2, Mic, Phone, PhoneOff, Sparkles, Square, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee, versWav } from "@/lib/dictee";
import { garder, enAttente, retirer, erreurReseau } from "@/lib/file-hors-ligne";
import SequenceActions from "@/components/prospection/SequenceActions";
import ToutPrepare, { lignesDuRecu } from "@/components/prospection/ToutPrepare";
import { ChaineEtapes, ChaineRepliee, useEtapesVives } from "@/components/prospection/ChaineEtapes";
import { GROUPES_ESSAI, SCENARIOS_ESSAI, scenarioEssai } from "@/components/prospection/scenarios-essai";
import { ETIQUETTE } from "@/components/prospection/StyleAppel";
import EcranApresAppel, { BoutonTranscription } from "@/components/prospection/EcranApresAppel";
import { CalculatriceEnLigne } from "@/components/prospection/EcranEnLigne";
import LieuEnLigne from "@/components/prospection/LieuEnLigne";
import { avecPhotos } from "@/lib/interlocuteurs";
import { useAuth } from "@/lib/AuthContext";
import * as Ecran from "@/lib/enregistrement-ecran";
import { fusionnerWav, OCTETS_MAX } from "@/lib/parole";
import { clipAutour, morceauDeLaPhrase } from "@/lib/clip-objection";
import { Statut } from "@/components/mandataire/elements";
import Chargement from "@/components/ui/Chargement";
import { ouvrirTranscriptionDirecte, enPhrases } from "@/lib/transcription-directe";
import { objectionEntendue } from "@/lib/objections";
import TranscriptionParVoix from "@/components/prospection/TranscriptionParVoix";
import { niveauEntre, phrasesEtTours, seuilDeuxVoix, texteNormal, voixDe, voixParLesMots } from "@/lib/qui-parle";

// Le mode appel (maquette de Jules, spec du 7 oct. 2026). Un onglet par
// ville, puis une agence à la fois, tenue pour soi tant qu'elle est à
// l'écran : la fiche (badge, ce qu'on sait, le cahier des charges), le
// numéro, le micro. Au raccrochage, cinq issues en deux groupes : les non
// abouties se valident d'un geste ; les abouties ouvrent « Ce qui a été
// compris » et les actions cochées. Une seule validation, puis le reçu relu
// (Monday, le mail retrouvé dans les envoyés) et dix secondes pour annuler.
// Rien ne se perd : un envoi sans réseau attend dans le téléphone, un appel
// resté sans issue est redemandé à la réouverture.
// `relances` (page Relances, spec du 8 oct. 2026) : le même écran, ouvert sur
// une seule ligne prise dans la liste partagée (`relance` : sa clé et son
// agence). Pas d'onglets de ville : en tête de la fiche, pourquoi on relance.
// L'écran garde la ligne tant que l'analyste s'en sert (`garder`, toutes les
// minutes s'il a bougé, ou pendant l'appel) ; après l'issue, « Relance
// suivante » (`onSuivante`) ou « Retour à la liste » (`onRetour`).

const API = "/api/prospection/mode-appel";
const ESSAI = "essai";
const CLE_EN_COURS = "klocka.mode-appel.en-cours";
const telLien = (t) => `tel:${String(t).replace(/\s/g, "")}`;
const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const duree = (debut, maintenant) => {
  const min = Math.max(0, Math.round((maintenant - Date.parse(debut)) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};
const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;
const etiquette = "m-0 text-[12.5px] text-ardoise";
const bouton = "h-8 rounded-full border border-trait px-3.5 text-[13.5px] text-encre transition-colors hover:bg-relief disabled:opacity-50 max-md:h-10";
const nouvelleCle = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const lireLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const poserLocal = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };

// Une conversation d'exemple pour l'appel simulé : AK la lit comme un vrai appel.
// Le cas joué quand on touche le micro sans en avoir choisi (mode Essai).
const SCENARIO_DEFAUT = "date_dite";
// L'appel libre du mode Essai (15 nov. 2026, Jules : « une pill libre où je fais comme si c'était un vrai appel, donc ça
// écoute vraiment ») : sur l'agence d'essai, le micro et la transcription pour de vrai ; rien ne part (essai).
const LIBRE = "libre";
// Les cartes de conseils sur les objections, retirées pour l'instant (15 nov. 2026, Jules : « enlève les cards qui
// donnent des conseils ») : leur repérage (src/lib/objections.js) et leur pop-up restent, éteints.
const CARTES_OBJECTION = false;
const MOTIFS_ESSAI = { bien_retenu: "Bien retenu", bien_refuse: "Bien refusé", point_mensuel: "Point mensuel" };

/** Le mode Essai : les cas de figure, par groupe ; un clic joue l'appel. */
function ChoixScenario({ choisi, onJouer, relancesDabord = false, monday = true, setMonday = null }) {
  const groupes = relancesDabord ? [...GROUPES_ESSAI.filter(([k]) => k === "relance"), ...GROUPES_ESSAI.filter(([k]) => k !== "relance")] : GROUPES_ESSAI;
  const sc = scenarioEssai(choisi);
  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-trait p-5 max-md:p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] tracking-[.16em] text-brume">Mode essai · cas de figure</span>
        <span className="text-[14px] leading-[1.5] text-craie">Choisissez un cas : l'appel se joue tout seul, AK le lit pour de vrai et propose ses actions. Aucun mail ne part, rien ne compte dans les statistiques.</span>
      </div>
      {setMonday && (
        <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-trait px-4 py-3">
          <input type="checkbox" checked={monday} onChange={(e) => setMonday(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--k-menthe-rgb))]" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[14.5px] text-encre">Écrire pour de vrai dans Twenty CRM</span>
            <span className="text-[13px] leading-[1.45] text-ardoise">{monday ? "La ligne de l'agence fictive est créée ou mise à jour dans « Agent immobilier », marquée « (Essai) », remarque « Essai · … ». Annuler la remet comme avant." : "Twenty CRM n'est pas touché : l'écran montre seulement ce qui y serait écrit."}</span>
          </span>
        </label>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] text-ardoise">Appel libre</span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onJouer({ cle: LIBRE })} aria-pressed={choisi === LIBRE}
            className={`h-9 rounded-full border px-3.5 text-[13.5px] transition-colors ${choisi === LIBRE ? "border-menthe bg-menthe/10 text-encre" : "border-trait text-craie hover:border-menthe hover:text-encre"}`}
            style={choisi === LIBRE ? undefined : { background: "transparent" }}>Libre · le micro écoute pour de vrai</button>
          {choisi === LIBRE && <span className="text-[13px] text-ardoise">Touchez Appeler, puis parlez : jouez l'agent vous-même, ou à deux en haut-parleur.</span>}
        </div>
      </div>
      {groupes.map(([g, titre]) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="text-[12.5px] text-ardoise">{titre}</span>
          <div className="flex flex-wrap gap-2">
            {SCENARIOS_ESSAI.filter((x) => x.groupe === g).map((x) => (
              <button key={x.cle} type="button" onClick={() => onJouer(x)} aria-pressed={choisi === x.cle}
                className={`h-9 rounded-full border px-3.5 text-[13.5px] transition-colors ${choisi === x.cle ? "border-menthe bg-menthe/10 text-encre" : "border-trait text-craie hover:border-menthe hover:text-encre"}`}
                style={choisi === x.cle ? undefined : { background: "transparent" }}>{x.titre}</button>
            ))}
          </div>
        </div>
      ))}
      {sc && <p className="m-0 text-[13px] leading-[1.5] text-ardoise"><span className="text-menthe">Attendu :</span> {sc.attendu}</p>}
    </div>
  );
}
// « Message laissé » ouvre les actions proposées (13 oct. 2026, Jules) ; les deux autres se valident d'office.
const ISSUES_NON_ABOUTIES = [["pas_de_reponse", "Pas de réponse", true], ["repondeur", "Message laissé", false], ["invalide", "Mauvais numéro", true]];
const CHAMPS_COMPRIS = [["interlocuteur", "Interlocuteur"], ["fonction", "Fonction"], ["telephone", "Téléphone"], ["email", "Email"], ["biens", "Biens évoqués"], ["mandat", "Mandat à venir"], ["prochaine_etape", "Prochaine étape"], ["date", "Date dite"]];
const MODIFIABLES = ["interlocuteur", "telephone", "email"];
// Relances « Bien retenu » et « Bien refusé » : les quatre issues de la spec du 8 oct. 2026.
const ISSUES_BIEN = [["agent_prevenu", "Agent prévenu", true], ["pas_de_reponse", "Pas de réponse", true], ["a_des_murs", "A un autre bien", false], ["pas_interesse", "Pas intéressé", false]];
const RELANCES = "relances";
// La liste des relances dues, dans le menu des villes (15 nov. 2026) : pas de session, la liste partagée à la place de la carte.
const DUES = "relances-dues";
const MINUTE = 60_000;
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

/** Relances : pourquoi on rappelle, l'agent, le dernier échange, le bien en cours, l'historique replié. */
function PourquoiRelance({ a }) {
  const [histo, setHisto] = useState(false);
  const r = a.relance;
  const etiq = "text-[12.5px] text-ardoise";
  const bien = r.bien;
  const verdict = bien?.verdict === "retenu" ? "Retenu" : bien?.verdict === "refuse" ? "Refusé" : bien?.recue ? "En cours d'analyse" : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-[12px] border border-ambre/40 px-4 py-3.5">
        <span className="text-[12.5px] text-ambre">{r.motif.libelle}</span>
        <span className="text-[17px] leading-[1.45] text-encre [text-wrap:pretty]">{r.phrase}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={etiq}>L'agent</span>
        <span className="text-[15px] text-encre">{[r.agent, a.nom].filter(Boolean).join(" · ")}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-craie">
          {a.lieu && <span>{a.lieu}</span>}
          {a.telephone && <a href={telLien(a.telephone)} className="tabular-nums text-menthe hover:underline">{a.telephone}</a>}
          {a.email && <a href={`mailto:${a.email}`} className="break-all text-craie hover:text-encre">{a.email}</a>}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={etiq}>Dernier échange</span>
        {r.dernier ? (
          <>
            <span className="text-[12.5px] text-ardoise">{[jourCourt(r.dernier.le), r.dernier.par, r.dernier.monday ? "Twenty CRM" : null, r.dernier.issue].filter(Boolean).join(" · ")}</span>
            {r.dernier.resume && <span className="line-clamp-2 text-[14.5px] leading-[1.5] text-craie">{r.dernier.resume}</span>}
          </>
        ) : <span className="text-[13.5px] text-brume">Aucun échange noté</span>}
      </div>
      {bien && (
        <div className="flex flex-col gap-1">
          <span className={etiq}>Le bien en cours</span>
          <span className="text-[15px] text-encre">{bien.titre}{bien.adresse ? <span className="text-ardoise"> · {bien.adresse}</span> : null}</span>
          <span className="text-[13.5px] text-craie">
            {bien.recue ? `Fiche reçue${bien.recue_le ? ` le ${jourCourt(bien.recue_le)}` : ""}` : <span className="text-ambre">Fiche non reçue</span>}
            {verdict && <span className={bien.verdict === "retenu" ? "text-menthe" : bien.verdict === "refuse" ? "text-alerte" : "text-ardoise"}> · {verdict}</span>}
            {bien.raison && <span className="text-ardoise"> : {bien.raison}</span>}
          </span>
        </div>
      )}
      {r.historique?.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setHisto((x) => !x)} className={`${etiq} self-start p-0 hover:text-encre`} style={{ background: "transparent" }} aria-expanded={histo}>
            HISTORIQUE COMPLET · {r.historique.length} {histo ? "▴" : "▾"}
          </button>
          {histo && r.historique.map((h, k) => (
            <span key={k} className="text-[13px] leading-[1.45] text-craie"><span className="text-brume">{[jourCourt(h.le), h.par, h.type].filter(Boolean).join(" · ")}</span> {h.texte}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La machine à écrire (9 oct. 2026) : la transcription s'écrit quand on l'ouvre.
 * Au plus deux secondes et demie, quelle que soit sa longueur ; tout de suite
 * si le système demande moins d'animations.
 */
function useTape(paragraphes, actif) {
  const total = paragraphes.reduce((n, t) => n + t.length, 0);
  const [n, setN] = useState(actif ? 0 : Infinity);
  useEffect(() => {
    if (!actif) { setN(Infinity); return undefined; }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(Infinity); return undefined; }
    setN(0);
    const pas = Math.max(1, Math.ceil(total / 150));
    let vu = 0, id = 0;
    const avancer = () => { vu += pas; if (vu >= total) { setN(Infinity); return; } setN(vu); id = requestAnimationFrame(avancer); };
    id = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(id);
  // Relancée à l'ouverture seulement, pas à chaque morceau qui arrive.
  }, [actif]);
  let reste = n;
  return paragraphes.map((t) => { const vu = t.slice(0, Math.max(0, reste)); reste -= t.length; return vu; });
}

/** La transcription : en direct pendant l'appel, puis relue à côté des actions. Jamais gardée sur le serveur. */
// Partagé avec « Il me rappelle » (13 oct. 2026, Jules : « comme dans l'appel normal »).
export function PanneauTranscription({ direct, notes, fin, enDirect = false, replie = false, tape = false, nu = false, vif = "" }) {
  const [ouvert, setOuvert] = useState(!replie);
  // En direct, la dernière phrase reste en vue (15 nov. 2026, Jules) : le panneau descend seul, sauf si on est remonté lire.
  const zone = useRef(null);
  const colle = useRef(true);
  useEffect(() => {
    const el = zone.current;
    if (enDirect && el && colle.current) el.scrollTop = el.scrollHeight;
  });
  const textes = direct.filter((x) => x.texte);
  const tapes = useTape(textes.map((x) => x.texte), tape);
  const enCours = direct.some((x) => x.etat === "envoi");
  const rates = direct.filter((x) => x.etat === "echec").length;
  return (
    <div className={`flex min-w-0 flex-col gap-3 ${nu ? "" : "rounded-[12px] border border-bord-doux bg-transparent p-6"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={ETIQUETTE}>{enDirect ? "Transcription en direct" : "Transcription"}</span>
        {replie ? <button type="button" onClick={() => setOuvert((x) => !x)} className="p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{ouvert ? "Replier" : "Afficher"}</button>
          : enCours && <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />}
      </div>
      {ouvert && (
        <div ref={zone} onScroll={(e) => { const el = e.currentTarget; colle.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
          className={`flex flex-col gap-2 overflow-y-auto pr-1 text-[15px] leading-[1.55] text-encre ${replie ? "max-h-[260px]" : nu ? "min-h-[180px] max-h-[360px]" : "max-h-[420px]"}`}>
          {!textes.length && !vif && <p className="m-0 text-[14px] text-brume">{!notes ? "Appel sans notes : rien n'est transcrit." : enDirect ? "La transcription apparaît ici, quelques secondes après chaque phrase." : "Rien n'a été entendu."}</p>}
          {textes.map((x, k) => (tapes[k] ? <p key={x.i} className="m-0 [text-wrap:pretty]">{tapes[k]}</p> : null))}
          {/* Les mots tout juste dits, en gris : l'écoute en direct, avant que la transcription fidèle les remplace. */}
          {vif && <p className="m-0 text-ardoise [text-wrap:pretty]">{vif}</p>}
          {rates > 0 && <p className="m-0 text-[13px] text-ambre">{rates} passage{rates > 1 ? "s" : ""} pas encore transcrit{rates > 1 ? "s" : ""} : nouvel essai au raccrochage.</p>}
          {fin && <span ref={fin} />}
        </div>
      )}
    </div>
  );
}

/** La fiche de l'agence, en pile : deux cartes devinées derrière, comme une file. */
function CarteAgence({ a, recherches, cahier }) {
  return (
    <div className="relative min-w-0">
      <div className="relative flex flex-col gap-5 rounded-[12px] border border-trait bg-transparent p-4">
        <div className="flex items-center justify-between gap-3">
          <Statut couleur={a.badge === "Jamais contactée" ? "gris" : "ambre"}>{a.badge || a.statut?.libelle}</Statut>
          <span className="min-w-0 truncate text-[14px] text-ardoise">{a.lieu}</span>
        </div>
        <p className="m-0 break-words text-[32px] leading-[1.15] tracking-[-0.02em] text-encre [text-wrap:balance] max-md:text-[26px]">{a.nom}</p>
        {a.interlocuteurs?.[0] && <p className="m-0 text-[16px] text-craie">{a.interlocuteurs[0]}</p>}
        {a.reseau && <p className="m-0 rounded-[12px] border border-ambre/40 px-3.5 py-2.5 text-[14px] leading-[1.45] text-ambre">{a.reseau}</p>}
        <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
          {a.raison && <span className="text-[15px] leading-[1.5] text-ambre">{a.raison}</span>}
          {(a.historique?.length ? a.historique : ["Aucun appel"]).map((h) => <span key={h} className="text-[14px] text-ardoise">{h}</span>)}
        </div>
        {cahier?.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
            <span className={etiquette}>Cahier des charges</span>
            {cahier.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
        {recherches?.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-trait pt-4">
            <span className={etiquette}>Recherches de clients</span>
            {recherches.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// « À suivre » et « Toute la ville » retirés (16 nov. 2026, Jules : « le mode appel, juste un mode où on voit une après
// l'autre ; les listes complètes sont dans la page Agences ») : on ne voit que l'agence à appeler.

/** Les notes de l'appel, sous la transcription : ce que le micro capte mal. Elles l'emportent sur ce qu'AK a entendu. */
function ZoneNotes({ valeur, onChange, nu = false, rows = 3 }) {
  return (
    <label className={`flex min-w-0 flex-col gap-2 ${nu ? "" : "rounded-[12px] border border-bord-doux bg-transparent p-6 max-md:p-5"}`}>
      <span className={nu ? "m-0 text-[12.5px] text-ardoise" : ETIQUETTE}>Notes</span>
      <textarea value={valeur} onChange={(e) => onChange(e.target.value)} rows={rows}
        placeholder={nu ? "Email, numéro, nom, date : elles l'emportent sur la transcription" : "Email, numéro, nom, date : ce qui compte et que le micro capte mal. Les notes l'emportent sur la transcription."}
        className={`w-full resize-y px-3.5 py-3 text-[15px] leading-[1.5] text-encre outline-none max-md:text-[16px] ${nu ? "rounded-[12px] border border-bord-doux bg-transparent placeholder:text-brume focus:border-bord-vif" : "rounded-champ border border-bord-doux bg-transparent focus:border-bord-vif"}`} />
    </label>
  );
}

/** Une ligne du reçu : vert vérifié, orange en cours ou à faire, rouge raté. Jamais de coche sans relecture. */
function LigneRecu({ l, lien = null, detail = null, children = null }) {
  const [ouvert, setOuvert] = useState(false);
  if (!l) return null;
  const orange = ["attente", "brouillon", "doute"].includes(l.etat);
  const ton = l.etat === "ok" ? "text-menthe" : orange ? "text-ambre" : l.etat === "echec" ? "text-alerte" : "text-ardoise";
  const contenu = (
    <span className="flex items-start gap-3.5 text-[16px] leading-[1.45]">
      <span className={`flex-none ${ton}`}>{l.etat === "ok" ? "✓" : l.etat === "attente" ? <Loader2 className="mt-1 h-4 w-4 animate-spin" /> : l.etat === "echec" ? <X className="mt-1 h-4 w-4" /> : orange ? "!" : "·"}</span>
      <span className={`min-w-0 break-words ${orange ? "text-ambre" : "text-encre"}`}>{l.texte}{detail && <span className="text-menthe"> · voir le mail</span>}</span>
    </span>
  );
  return (
    <li>
      {lien ? <a href={lien} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 hover:opacity-80">{contenu}<ExternalLink className="h-3.5 w-3.5 flex-none text-brume" /></a>
        : detail ? <button type="button" onClick={() => setOuvert((o) => !o)} className="w-full text-left" style={{ background: "transparent" }}>{contenu}</button> : contenu}
      {ouvert && detail && (
        <div className="mt-2 rounded-[12px] border border-trait bg-fond p-3 text-[13px] leading-[1.55] text-craie">
          <p className="m-0 text-ardoise">À {detail.a || "(sans adresse)"} · {detail.objet}</p>
          <p className="m-0 mt-2 whitespace-pre-line">{detail.corps}</p>
        </div>
      )}
      {children}
    </li>
  );
}

/** « C'est bien cette ligne ? » : les lignes Monday possibles, et la nouvelle. */
function ChoixLigne({ candidates, onChoisir, occupe }) {
  return (
    <div className="ml-7 mt-2 flex flex-col gap-1.5">
      {candidates.map((c) => (
        <button key={c.id} type="button" disabled={occupe} onClick={() => onChoisir(c.id)} className="rounded-[12px] border border-trait px-3 py-2 text-left text-[14px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>
          {c.nom} <span className="text-ardoise">· {[c.entreprise, c.ville, c.telephone].filter(Boolean).join(" · ")}</span>
        </button>
      ))}
      <button type="button" disabled={occupe} onClick={() => onChoisir("nouvelle")} className="rounded-[12px] border border-trait px-3 py-2 text-left text-[14px] text-craie hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>Aucun : nouveau contact</button>
    </div>
  );
}


/**
 * La fiche avant l'appel (maquette de Jules, 7 oct. 2026), la même en mode
 * appel et en relances : les interlocuteurs et l'historique à gauche, la fiche
 * de l'agence au centre, le micro et le numéro à droite. On compose le
 * numéro sur son téléphone, puis on touche le micro quand l'agent décroche.
 */
/** Pure : un nom tout en capitales remis en casse normale (« PETROVA INVESTISSEMENT » → « Petrova Investissement ») ; les sigles courts restent. */
const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "d", "l", "sur"]);
function nomLisible(nom) {
  const t = String(nom || "").trim();
  if (!t || /[a-zà-ÿ]/.test(t)) return t;
  return t.toLowerCase().split(/(\s+|-|')/).map((m, k) => {
    if (!/\p{L}/u.test(m)) return m;
    if (k > 0 && PETITS_MOTS.has(m)) return m;
    if (m.length <= 3 && !PETITS_MOTS.has(m) && !/[aeiouyàâéèêëîïôöûü]/.test(m)) return m.toUpperCase();
    return m.charAt(0).toUpperCase() + m.slice(1);
  }).join("");
}

/**
 * Déjà appelé, sans enregistrer (9 oct. 2026) : on dit ou on écrit ce qui
 * s'est dit, en quelques mots, et AK le lit comme un appel : il en déduit
 * l'issue, la relance, le mail et la ligne Monday, puis l'écran d'actions
 * s'ouvre. « Pas de réponse » reste à un geste, sans lecture d'AK.
 */
function ResumeAppel({ onAnalyser, onSansReponse, occupe }) {
  const [texte, setTexte] = useState("");
  const base = useRef("");
  const { supporte, ecoute, demarrer, arreter, finalisation } = useDictee({ onTexte: (t) => setTexte([base.current, t].filter(Boolean).join(base.current ? " " : "")) });
  const dicter = () => { if (ecoute) { arreter(); return; } base.current = texte.trim(); demarrer(); };
  const pret = texte.trim().length >= 8 && !ecoute && !finalisation && !occupe;
  // « Déjà appelé ? » (maquette de Jules, 21 oct. 2026) : une grande carte pour dire ou écrire l'appel, la dictée en bas à
  // gauche, Analyser en bas à droite ; dessous, « Pas de réponse ou répondeur » sur toute la largeur.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={`flex min-h-[200px] flex-1 flex-col rounded-[12px] border bg-transparent transition-colors ${ecoute ? "border-menthe/60" : "border-bord-doux focus-within:border-bord-vif"}`}>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Ce qui s'est dit pendant l'appel" placeholder="Dites ou écrivez ce qui s'est dit"
          className="min-h-[140px] flex-1 resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-[1.55] text-encre outline-none placeholder:text-brume" />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          {supporte ? (
            <button type="button" onClick={dicter} aria-label={ecoute ? "Arrêter la dictée" : "Dicter"} title={ecoute ? "Arrêter la dictée" : "Dicter le résumé"}
              className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${ecoute ? "bg-menthe text-sur-menthe" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={ecoute ? undefined : { background: "transparent" }}>
              {ecoute ? <Square className="h-3 w-3" fill="currentColor" /> : finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : <span />}
          <button type="button" disabled={!pret} onClick={() => onAnalyser(texte.trim())}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-opacity hover:bg-menthe-survol disabled:opacity-40">
            {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Analyser<ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <button type="button" onClick={onSansReponse} className="h-8 max-md:h-10 w-full rounded-full border border-bord-doux text-[13.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Pas de réponse ou répondeur</button>
    </div>
  );
}

/** Pure : une recherche client en deux parts, ce qu'elle cherche à gauche, le budget à droite (« Murs de commerce · PACA » / « 200 k€ à 250 k€ »). */
export function ligneRecherche(q) {
  const parts = String(q || "").split(/,\s+/).map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((x) => /€/.test(x));
  const droite = i >= 0 ? parts[i].replace(/^de\s+/, "") : null;
  const gauche = parts.filter((_, k) => k !== i).join(" · ");
  return { gauche: gauche.charAt(0).toUpperCase() + gauche.slice(1), droite };
}

function FicheAppel({ a, relances, recherches, essai, choisi, onChoisir, onMicro, onSansNotes, onResume, resumeEnCours, passerOuvert, setPasserOuvert, raisons, onPasser, passerEnCours, onRetour = null, enLigne = null, onSansConversation = null, siteLe = null }) {
  const contacts = (a.contacts || []).filter((x) => !x.standard);
  const standard = (a.contacts || []).find((x) => x.standard)?.telephone || a.telephone;
  const numero = choisi?.telephone || standard;
  const personne = choisi && !choisi.standard ? choisi : null;
  const histo = a.historique_detail || [];
  const etiq = "text-[12.5px] text-ardoise";
  const relance = !!a.relance || /relance|tentative/i.test(a.badge || "");
  // L'accroche (ou, en relance, ce qu'on s'est dit) : sous la fiche à l'ordinateur, sous le micro au téléphone.
  const suite = (
    <>
        {relances ? (
        // En relance : ce qui s'est dit aux appels d'avant, pour rappeler en sachant où on en est.
        <div className="flex flex-col gap-3">
          <span className={etiq}>Ce qu'on s'est dit</span>
          {histo.filter((h) => h.resume).map((h, k) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-[12.5px] text-ardoise">{[h.quand, h.qui, h.quoi].filter(Boolean).join(" · ")}</span>
              <span className="text-[15px] leading-[1.55] text-craie [text-wrap:pretty]">{h.resume}</span>
            </div>
          ))}
          {a.notes_avant && <span className="text-[14px] leading-[1.55] text-ardoise [text-wrap:pretty]">{a.notes_avant}</span>}
          {!histo.some((h) => h.resume) && !a.notes_avant && <span className="text-[13.5px] text-brume">Rien de noté aux appels précédents.</span>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className={etiq}>L'accroche</span>
          <span className="text-[18px] leading-[1.5] text-craie [text-wrap:pretty]">Nos recherches clients actives sur {a.ville || "la ville"}, pour recevoir leurs biens avant la mise en ligne.</span>
          {recherches.length > 0 && (
            <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">
              {recherches.map((q) => <li key={q} className="flex gap-2.5 text-[13.5px] text-ardoise"><span className="text-brume">·</span><span className="min-w-0">{q}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
  const etiq2 = "m-0 text-[12.5px] text-ardoise";
  // La fiche d'avant l'appel (maquette de Jules, 21 oct. 2026) : une carte ; en tête l'origine et l'état, le nom, la
  // personne et son numéro, à droite le micro, Appeler et Passer ; dessous trois colonnes : interlocuteurs et
  // historique, l'accroche et les recherches clients, « Déjà appelé ? ».
  // Pendant l'appel (21 oct. 2026, Jules : « comme dans la liste ») : la même carte ; le micro respire comme au rappel,
  // Raccrocher prend la place d'Appeler, la transcription celle de l'accroche, la calculatrice et les notes celle de
  // « Déjà appelé ? ». Après le raccrochage, la note de cinq secondes prend la place de l'en-tête.
  const enCours = !!enLigne;
  // « Déjà appelé ? » replié (15 nov. 2026, avis produit) : un appel passé hors de l'application est rare ; un lien
  // sous les boutons ouvre la colonne. Pendant l'appel, la colonne porte les notes et la calculatrice.
  const [deja, setDeja] = useState(false);
  const troisColonnes = enCours || deja || essai;
  // Avant l'appel, la carte de la maquette de Jules (15 nov. 2026) ; pendant l'appel, la carte à trois colonnes.
  if (!enCours) return <CarteAvantAppel a={a} contacts={contacts} choisi={choisi} onChoisir={onChoisir} numero={numero} histo={histo} essai={essai} onMicro={onMicro} onPasser={onPasser} passerEnCours={passerEnCours} onRetour={onRetour} onSansConversation={onSansConversation} occupe={resumeEnCours} siteLe={siteLe} />;
  return (
    <div className="overflow-hidden k-verre">
      <div className="relative flex flex-wrap items-center justify-between gap-4 px-4 py-3 max-md:px-4">
        {/* Pendant l'appel (16 nov. 2026, Jules) : plus de pastille « En ligne » ni « Essai » ; la durée seule, au milieu,
            sur la ligne du nom. */}
        <span aria-label="Durée de l'appel" className="order-last text-[24px] font-normal leading-[1.2] tabular-nums text-craie md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
          {Math.floor((enLigne?.duree || 0) / 60)}:{String((enLigne?.duree || 0) % 60).padStart(2, "0")}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {relances && <span className="text-[12.5px] text-ardoise">Relances{a.ville ? ` · ${a.ville}` : ""}</span>}
          {/* Pendant l'appel (16 nov. 2026, Jules) : le nom de l'agence, puis la personne à qui l'on parle, sur une ligne
              alignée sur Raccrocher ; plus de numéro dessous ni de colonne des interlocuteurs. */}
          <p className="m-0 break-words text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">
            {nomLisible(a.nom)}
            {personne?.nom && <span className="text-[15px] tracking-normal text-ardoise"> · {nomLisible(personne.nom)}{personne.fonction ? `, ${personne.fonction.charAt(0).toLowerCase()}${personne.fonction.slice(1)}` : ""}</span>}
          </p>
          {(a.raison || a.reseau) && (
            <div className="flex flex-col gap-1">
              {a.raison && <span className="text-[13.5px] leading-[1.5] text-ambre">{a.raison}</span>}
              {a.reseau && <span className="text-[13.5px] leading-[1.5] text-ambre">{a.reseau}</span>}
            </div>
          )}
        </div>
        {enCours ? (
          <div className="flex flex-none flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              {/* Plus de micro qui respire pendant l'appel (16 nov. 2026, Jules) : la pastille « En ligne » et les rubans disent l'écoute. */}
              <button type="button" onClick={enLigne.onRaccrocher} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-menthe px-6 text-[15px] text-sur-menthe transition-colors hover:bg-menthe-survol">
                <PhoneOff className="h-[18px] w-[18px]" strokeWidth={2} />Raccrocher
              </button>
              {/* Annuler : retour à la fiche, comme si l'agence n'avait pas été appelée (rien n'est noté, l'écoute s'efface). */}
              <button type="button" onClick={enLigne.onAnnuler} aria-label="Annuler l'appel" title="Annuler : revenir à la fiche, rien n'est noté"
                className="grid h-11 w-11 place-items-center rounded-full border border-bord-doux text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
            {/* L'analyste sait que son écran est enregistré pendant l'appel (14 oct. 2026) : le pied de la carte le dit. */}
          </div>
        ) : (
        <div className="flex flex-none items-center gap-3">
          <button type="button" onClick={onMicro} aria-label="Enregistrer l'appel" title="Enregistrer quand l'agent décroche"
            className="grid h-8 max-md:h-11 w-8 max-md:w-11 place-items-center rounded-full border border-bord-doux text-craie transition-colors hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}>
            <Mic className="h-4 w-4" strokeWidth={1.8} />
          </button>
          {/* Appeler : composer sur son téléphone, l'écoute part (pas de lien tel:, 7 oct. 2026) ; en essai, l'appel se joue. */}
          <button type="button" onClick={onMicro} title={essai ? "Simuler l'appel" : "Composez le numéro sur votre téléphone : l'écoute démarre"}
            className="inline-flex h-8 max-md:h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe transition-colors hover:bg-menthe-survol">
            <Phone className="h-4 w-4" strokeWidth={1.8} />Appeler
          </button>
          {onRetour
            ? <button type="button" onClick={onRetour} className="h-8 max-md:h-10 rounded-full border border-bord-doux px-5 text-[13.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Retour</button>
            // Passer d'un clic (13 oct. 2026, Jules) : l'agence suivante, sans raison à donner ; celle-ci revient demain.
            : <button type="button" onClick={() => onPasser("plus_tard")} disabled={passerEnCours} className="h-8 max-md:h-10 rounded-full border border-bord-doux px-5 text-[13.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Passer</button>}
          {!essai && !deja && <button type="button" onClick={() => setDeja(true)} className="text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Déjà appelé ?</button>}
        </div>
        )}
      </div>

      {/* Des filets en fond, pas en bordure : la grille de points efface les bordures horizontales (index.css), la maquette les veut. */}
      <div aria-hidden className="h-px bg-trait" />
      {/* Deux colonnes pendant l'appel (16 nov. 2026, Jules) : la transcription et les notes ; interlocuteurs et
          historique servent avant l'appel, ils restent sur la carte d'avant. */}
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        {/* L'accroche et les recherches clients (ou, en relance, ce qu'on s'est dit). */}
        <div className={`flex min-w-0 flex-col gap-3 border-trait p-4 max-lg:order-1 ${troisColonnes ? "lg:border-r" : ""}`}>
          {enCours ? enLigne.milieu : a.relance ? <PourquoiRelance a={a} /> : relances ? suite : (
            <div className="flex flex-col gap-3">
              <span className={etiq2}>L'accroche</span>
              <p className="m-0 text-[15px] leading-[1.5] text-encre [text-wrap:pretty]">Nos recherches clients actives sur {a.ville || "la ville"}, pour recevoir leurs biens avant la mise en ligne.</p>
              {recherches.length > 0 && (
                <div className="flex flex-col">
                  {recherches.map((q) => {
                    const l = ligneRecherche(q);
                    return (
                      <React.Fragment key={q}>
                        <div aria-hidden className="h-px bg-trait" />
                        <div className="flex items-baseline justify-between gap-6 py-2 text-[13.5px]">
                          <span className="min-w-0 text-encre">{l.gauche}</span>
                          {l.droite && <span className="flex-none text-right tabular-nums text-encre">{l.droite}</span>}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {essai && !enCours && <span className="text-[13.5px] leading-[1.5] text-ardoise">Essai : touchez Appeler pour simuler l'appel.</span>}
        </div>

        {/* Déjà appelé ? */}
        {troisColonnes && <div className="flex min-w-0 flex-col gap-3 p-4 max-lg:order-2 max-lg:border-t max-lg:border-trait">
          {enCours ? enLigne.droite : (
            <span className="flex items-center justify-between gap-3">
              <span className={etiq2}>Déjà appelé ?</span>
              {deja && <button type="button" onClick={() => setDeja(false)} aria-label="Replier" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>}
            </span>
          )}
          {enCours ? null : !essai ? <ResumeAppel onAnalyser={onResume} onSansReponse={onSansNotes} occupe={resumeEnCours} />
            : <span className="text-[13.5px] leading-[1.5] text-brume">En essai, l'appel se joue tout seul : touchez Appeler.</span>}
        </div>}
      </div>
      {enCours && enLigne.pied && (
        <>
          <div aria-hidden className="h-px bg-trait" />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">{enLigne.pied}</div>
        </>
      )}
    </div>
  );
}

/** Pure : les initiales d'un nom (« Sophie Le Gall » → « SL »). */
function initiales(nom) {
  const mots = String(nom || "").split(/[\s-]+/).filter((m) => /\p{L}/u.test(m));
  return ((mots[0]?.[0] || "") + (mots.length > 1 ? mots[1][0] : "")).toUpperCase() || "?";
}

/** Pure : ce que la carte dit des annonces de l'agence. */
function texteAnnonces(an) {
  if (!an || (!an.total && !an.commerce && !an.publie_commerce)) return "Aucune relevée";
  if (an.commerce) return `${an.commerce} en commerce${an.total > an.commerce ? ` sur ${an.total}` : ""}`;
  if (an.publie_commerce) return `Publie du commerce${an.total ? ` · ${an.total} relevée${an.total > 1 ? "s" : ""}` : ""}`;
  return `${an.total} relevée${an.total > 1 ? "s" : ""}, aucune en commerce`;
}

/**
 * Une personne de la carte : la tête (sa photo, ses initiales à défaut), le nom, le poste, son numéro, d'où elle vient.
 * Un clic la choisit et l'ouvre en grand (17 nov. 2026, Jules : « cliquer sur un interlocuteur pour voir plus zoomé ») :
 * la photo sur toute la largeur, le nom, le poste, le numéro et le mail ; un second clic la referme. Ni anneau autour de
 * la tête ni pastille « Probable » (Jules, même jour).
 */
function LignePersonne({ x, actif, ouvert, numero, onClic }) {
  const tete = x.photo ? <img src={x.photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : x.standard ? <Phone className="h-4 w-4" strokeWidth={1.8} /> : initiales(x.nom);
  const tel = x.telephone || (actif ? numero : null);
  return (
    <button type="button" onClick={onClic} aria-pressed={actif} aria-expanded={ouvert} title={ouvert ? "Refermer" : "Choisir et voir en grand"}
      className={`w-full rounded-[14px] border px-2.5 py-2 text-left transition-colors ${actif ? "border-bord-doux bg-relief/70" : "border-transparent hover:bg-relief/60"}`} style={actif ? undefined : { background: "transparent" }}>
      {ouvert && !x.standard ? (
        <span className="flex flex-col gap-2.5 py-1 duration-200 animate-in fade-in-0">
          {/* La photo en grand ; sans photo, une tête ronde de 64 px : un grand carré d'initiales ne montrerait rien. */}
          {x.photo
            ? <span className="aspect-[4/5] w-full max-w-[220px] self-center overflow-hidden rounded-[16px] bg-rail-actif">{tete}</span>
            : <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-rail-actif text-[18px] text-craie">{tete}</span>}
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] text-encre">{x.nom}</span>
            {x.fonction && <span className="text-[13.5px] text-ardoise">{x.fonction}</span>}
            {tel && <span className="select-all pt-1 text-[14px] tabular-nums text-encre">{tel}</span>}
            {x.email && <span className="select-all break-all text-[13px] text-craie">{x.email}</span>}
            {x.source !== "Apollo" && <span className="pt-0.5 text-[12px] text-brume">{x.source}</span>}
          </span>
        </span>
      ) : (
        <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-full bg-rail-actif text-[13px] text-craie">{tete}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] text-encre">{x.nom}</span>
            {x.fonction && !x.standard && <span className="truncate text-[13px] text-ardoise">{x.fonction}</span>}
            {/* Le numéro de chacun (17 nov. 2026, Jules : « leur numéro perso, directement ») ; sans le sien, celui à composer. */}
            {tel && <span className="select-all text-[13px] tabular-nums text-encre">{tel}</span>}
            {/* La source, sauf Apollo (17 nov. 2026, Jules : « enlève le "Apollo" »). */}
            {x.source !== "Apollo" && <span className="truncate text-[12px] text-brume">{x.source}</span>}
          </span>
        </span>
      )}
    </button>
  );
}

/**
 * La carte d'avant l'appel (17 nov. 2026, Jules, planche « Carte d'appel », A « Deux colonnes ») : le nom de l'agence,
 * Appeler et Passer en tête ; dessous, à gauche, les interlocuteurs en liste, une ligne par personne (la tête, le nom,
 * le poste, la source ; « Probable » sur la personne d'Apollo choisie d'office) ; à droite, « Résumé IA » et, en lignes,
 * le dernier appel, les annonces et la ville. Pendant et après l'appel, rien ne change.
 */
function CarteAvantAppel({ a, contacts, choisi, onChoisir, numero, histo, essai, onMicro, onPasser, passerEnCours, onRetour, onSansConversation = null, occupe = false, siteLe = null }) {
  const resume = useQuery({
    // Relu quand le site de l'agence vient d'être lu : le résumé dit alors ses villes, sa taille, ses offres.
    queryKey: ["mode-appel", "resume", a.id, siteLe || ""],
    queryFn: () => base44.request("GET", `/api/prospection/mode-appel/agences/${encodeURIComponent(a.id)}/resume`),
    enabled: !!a.id, staleTime: 10 * 60000, retry: false,
  });
  const dernier = histo[0];
  const ville = a.ville || String(a.lieu || "").split(" · ")[0] || null;
  // La personne ouverte en grand : aucune à l'arrivée sur l'agence.
  const [ouvertId, setOuvertId] = useState(null);
  useEffect(() => { setOuvertId(null); }, [a.id]);
  return (
    <div className="overflow-hidden k-verre">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-5 max-md:px-4">
        <p className="m-0 min-w-0 break-words text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">{nomLisible(a.nom)}</p>
        <div className="flex flex-none items-center gap-2.5">
          {/* Appeler : composer sur son téléphone, l'écoute part (pas de lien tel:, 7 oct. 2026) ; en essai, l'appel se joue. */}
          <button type="button" onClick={onMicro} title={essai ? "Simuler l'appel" : "Composez le numéro sur votre téléphone : l'écoute démarre"}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14.5px] text-sur-menthe transition-colors hover:bg-menthe-survol">
            <Phone className="h-4 w-4" strokeWidth={1.8} />Appeler
          </button>
          {onRetour
            ? <button type="button" onClick={onRetour} className="h-10 rounded-full border border-bord-doux px-5 text-[14.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Retour</button>
            // Passer d'un clic (13 oct. 2026, Jules) : l'agence suivante, sans raison à donner ; celle-ci revient demain.
            : <button type="button" onClick={() => onPasser("plus_tard")} disabled={passerEnCours} className="h-10 rounded-full border border-bord-doux px-5 text-[14.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Passer</button>}
        </div>
      </div>
      {/* Un filet en fond, pas en bordure : la grille de points efface les bordures horizontales (index.css). */}
      <div aria-hidden className="h-px bg-trait" />
      <div className="grid min-h-[360px] md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5 px-5 py-5 max-md:px-4 md:max-h-[560px] md:overflow-y-auto md:border-r md:border-trait">
          <span className="px-1 pb-1 text-[12.5px] text-ardoise">Interlocuteur</span>
          {contacts.map((x) => (
            <LignePersonne key={x.id} x={x} actif={choisi?.id === x.id} ouvert={ouvertId === x.id} numero={numero}
              onClic={() => { if (choisi?.id === x.id) setOuvertId((o) => (o === x.id ? null : x.id)); else { onChoisir(x.id); setOuvertId(x.id); } }} />
          ))}
          {!contacts.length && (
            <p className="m-0 px-1 text-[14px] text-ardoise">
              Personne de connu : demandez le responsable commerce{numero && <> · <span className="select-all tabular-nums text-encre">{numero}</span></>}
            </p>
          )}
        </div>
        <div aria-hidden className="h-px bg-trait md:hidden" />
        <div className="flex min-w-0 flex-col gap-4 px-6 py-5 max-md:px-4">
          {!resume.isError && (
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-2 text-[13px] text-menthe"><Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />Résumé IA</span>
              {resume.isLoading ? (
                <div aria-label="Résumé en cours" className="flex flex-col gap-2 pt-1">
                  <span className="h-3 w-[92%] animate-pulse rounded-full bg-rail-actif" />
                  <span className="h-3 w-[70%] animate-pulse rounded-full bg-rail-actif" />
                </div>
              ) : <p className="m-0 max-w-[68ch] text-[15px] leading-[1.6] text-encre [text-wrap:pretty]">{resume.data?.texte}</p>}
            </div>
          )}
          <div className="flex flex-col">
            {[["Dernier appel", dernier ? [dernier.quoi, dernier.quand].filter(Boolean).join(" · ") : "Jamais appelée"], ["Annonces", texteAnnonces(a.annonces)], ["Ville", ville]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t border-trait py-2.5 text-[14px] max-md:grid-cols-[96px_minmax(0,1fr)]">
                <span className="text-[13px] text-ardoise">{k}</span>
                <span className="min-w-0 text-encre">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Pas de réponse, aussi avant l'appel (16 nov. 2026, Jules) : on a composé sans lancer l'écoute, personne ou un répondeur. */}
      {onSansConversation && (
        <>
          <div aria-hidden className="h-px bg-trait" />
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-3 max-md:px-4">
            <span className="mr-1 text-[13.5px] text-ardoise">Pas de réponse ?</span>
            <button type="button" onClick={() => onSansConversation("pas_de_reponse")} disabled={occupe} title="Personne n'a décroché : la relance se planifie, l'agence suivante arrive" className="h-9 max-md:h-10 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50" style={{ background: "transparent" }}>Rappeler plus tard</button>
            <button type="button" onClick={() => onSansConversation("repondeur")} disabled={occupe} title="Répondeur : le message est laissé, les actions proposées s'ouvrent" className="h-9 max-md:h-10 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50" style={{ background: "transparent" }}>Message laissé</button>
          </div>
        </>
      )}
    </div>
  );
}

/** La carte de réponse à une objection entendue, en pop-up (15 nov. 2026, Jules : « en pop-up, pas au-dessus ») : en bas
 * au centre de l'écran, par-dessus tout, la phrase à dire en grand ; ce qui a été entendu dessous. */
function CarteObjection({ carte, onFermer }) {
  return createPortal(
    <div key={carte.le} role="status" aria-live="assertive"
      className="k-verre fixed bottom-8 left-1/2 z-[70] flex w-[min(680px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 !rounded-[22px] !border-menthe/50 px-6 py-5 shadow-[0_18px_40px_rgb(0_0_0/0.28)] duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 md:left-[calc(50%+var(--k-barre-largeur,0px)/2)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-menthe">{carte.titre}</span>
        <button type="button" onClick={onFermer} aria-label="Fermer la carte" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <p className="m-0 text-[19px] leading-[1.45] text-encre">« {carte.reponse} »</p>
      {carte.extrait && <p className="m-0 truncate text-[12.5px] text-ardoise">Entendu : « {carte.extrait} »</p>}
    </div>,
    document.body,
  );
}

// Le choix de la ville (15 nov. 2026, Jules : « au lieu de toutes les villes comme ça, juste un menu drop-down ») :
// le nom de la ville ouverte et un chevron ; la liste des villes dessous, Essai en dernier.
function ChoixVille({ villes, valeur, onChoisir, essai, dues = null, nbDues = 0 }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (!ref.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", fermer); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const nom = valeur === essai ? "Essai" : valeur === dues ? "Relances dues" : villes.find((l) => l.id === valeur)?.ville || "Choisir une ville";
  // Les relances dues en premier (15 nov. 2026) : elles n'avaient plus d'entrée depuis le retrait des intercalaires.
  const options = [...(dues ? [[dues, "Relances dues", nbDues]] : []), ...villes.map((l) => [l.id, l.ville]), [essai, "Essai"]];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-haspopup="listbox" aria-expanded={ouvert}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-bord-doux px-4 text-[14px] text-encre transition-colors hover:border-bord-vif max-md:h-10" style={{ background: "transparent" }}>
        {nom}<ChevronDown className={`h-4 w-4 text-ardoise transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div role="listbox" aria-label="Les villes" className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[60vh] min-w-[220px] overflow-y-auto rounded-[14px] border border-bord-doux bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-150 animate-in fade-in-0">
          {options.map(([id, mot, n]) => (
            <button key={id} type="button" role="option" aria-selected={valeur === id} onClick={() => { setOuvert(false); if (valeur !== id) onChoisir(id); }}
              className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] transition-colors hover:bg-relief ${valeur === id ? "text-encre" : "text-craie"} ${id === essai ? "mt-1 border-t border-trait pt-2.5" : ""} ${id === dues ? "mb-1 border-b border-trait pb-2.5" : ""}`} style={{ background: "transparent" }}>
              <span className="truncate">{mot}{n ? <span className="ml-2 tabular-nums text-ambre">{n}</span> : null}</span>
              {valeur === id && <Check className="h-4 w-4 flex-none text-menthe" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// `listeInitiale` : la ville ouverte d'abord (la ville proposée du tableau de bord), sinon la dernière choisie.
// `relancesDues()` : prend la première relance due libre et l'ouvre.
export default function ModeAppel({ relances = false, relance = null, onSuivante = null, onRetour = null, essaiSeul = false, entete = null, listeInitiale = null, relancesDues = null, onApresAppel = null }) {
  // `essaiSeul` (page Relances, 8 oct. 2026) : seulement le mode Essai, sans les villes, les relances d'abord.
  const [scenario, setScenario] = useState(null);
  // En essai, écrire pour de vrai dans Monday (8 oct. 2026) : oui par défaut, retenu dans le navigateur.
  const [mondayEssai, setMondayEssaiBrut] = useState(() => lireLocal("klocka.essai.monday") !== false);
  const setMondayEssai = (v) => { setMondayEssaiBrut(v); poserLocal("klocka.essai.monday", v); };
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState(null);
  const nbDues = useQuery({ queryKey: ["relances"], queryFn: () => base44.request("GET", "/api/prospection/relances"), enabled: !!relancesDues, refetchInterval: 60_000 }).data?.lignes?.length || 0;
  const [sessions, setSessions] = useState({}); // onglet → { id, liste_id, ville, essai, debut }
  const [ecran, setEcran] = useState("fiche");
  const [passees, setPassees] = useState(() => new Set());
  const [prise, setPrise] = useState(null); // { agence_id, agent_id }
  const [rappel, setRappel] = useState(null); // l'agence d'un appel entrant, ou d'un appel resté sans issue
  const [secondes, setSecondes] = useState(0);
  const [notes, setNotes] = useState(true);
  const [simule, setSimule] = useState(false);
  const [simulerApres, setSimulerApres] = useState(false);
  const [issue, setIssue] = useState(null);
  const [appel, setAppel] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [mail, setMail] = useState(null);
  const [relanceLe, setRelanceLe] = useState(null);
  const [relance2Le, setRelance2Le] = useState(null);
  const [ligneMonday, setLigneMonday] = useState(null);
  const [note, setNote] = useState("");
  // Les notes tapées pendant l'appel (8 oct. 2026) : email, numéro, nom, date ; elles font foi sur la transcription.
  const [notesAppel, setNotesAppel] = useState("");
  // Qui parle (16 nov. 2026) : le niveau du micro, gardé hors de React (src/lib/qui-parle.js) ; `parle` pour l'écran.
  const voix = useRef({ niveau: 0, qui: null, historique: [], seuil: null, arrivees: [], derniere: null });
  const [parle, setParle] = useState(null);
  const [voixCorrigees, setVoixCorrigees] = useState({});
  // Les étiquettes lues au sens par l'IA (16 nov. 2026, Jules), arrivées après la phrase.
  const [voixIA, setVoixIA] = useState({});
  const nouvellesVoix = () => { voix.current = { niveau: 0, qui: null, historique: [], seuil: null, arrivees: [], derniere: null }; setParle(null); setVoixCorrigees({}); setVoixIA({}); dejaRelu.current = ""; personne.current = { nom: null, par: null, envoi: false }; setPersonneAppel(null); };
  // L'assistant d'après l'appel (9 nov. 2026) : « valide » lui fait lancer le bouton ; `annonce` lui fait dire pourquoi il ne peut pas.
  const [annonce, setAnnonce] = useState(null);
  const [voirTranscription, setVoirTranscription] = useState(false);
  const [lancement, setLancement] = useState(0);
  // La chaîne de raisonnement d'AK pendant la lecture, puis repliée à l'écran d'actions (8 oct. 2026).
  const chaine = useEtapesVives();
  const [etapesFinies, setEtapesFinies] = useState([]);
  const [edits, setEdits] = useState({});
  const [cle, setCle] = useState(null);
  const [recu, setRecu] = useState(null);
  const [annulerDans, setAnnulerDans] = useState(0);
  const [passerOuvert, setPasserOuvert] = useState(false);
  const [message, setMessage] = useState(null);
  const [reserveeJusqu, setReserveeJusqu] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [horloge, setHorloge] = useState(Date.now());
  const [horsLigne, setHorsLigne] = useState(0);
  const [enCours, setEnCours] = useState(() => lireLocal(CLE_EN_COURS));
  const chrono = useRef(null);
  const rec = useRef(null);
  // La transcription en direct : un morceau toutes les quelques secondes, transcrit à la volée.
  const morceaux = useRef([]); // [{ i, texte: string|null, wav: Blob|null, etat: 'envoi'|'ok'|'echec' }]
  const [direct, setDirect] = useState([]);
  // L'audio entier de l'appel (16 oct. 2026) : les morceaux gardés, recollés au raccrochage pour la part de parole.
  const audios = useRef([]);
  const parole = useRef(new Set());
  const compte = useRef(null);
  const messageT = useRef(null);

  const [fait, setFait] = useState(null); // relances : ce qui vient d'être noté, avant « Relance suivante »
  const listes = useQuery({ queryKey: ["agent-ia-listes"], queryFn: () => base44.request("GET", "/api/prospection/agent-ia/listes"), enabled: !relances && !essaiSeul });
  const villes = relances || essaiSeul ? [] : (listes.data?.listes || []).filter((l) => l.agences > 0);
  const session = onglet ? sessions[onglet] : null;

  const ouvrir = useMutation({
    mutationFn: (k) => (k === ESSAI ? base44.request("POST", `${API}/essai`) : k === RELANCES ? base44.request("POST", "/api/prospection/relances/session") : base44.request("POST", `${API}/sessions`, { body: { liste_id: k } })),
    onSuccess: (r, k) => {
      setSessions((s) => ({ ...s, [k]: { id: r.session.id, liste_id: r.session.liste_id, ville: r.session.ville, essai: !!r.session.essai, debut: r.session.debut } }));
      if (k === ESSAI) queryClient.removeQueries({ queryKey: ["mode-appel-file", r.session.liste_id] });
    },
    onError: (e) => toast.error(e?.message || "Session impossible"),
  });
  const choisir = (k) => {
    arreterTout();
    if (k !== ESSAI && k !== RELANCES && k !== DUES) poserLocal("prospection.ville", k);
    // Les relances dues une après l'autre (16 nov. 2026, Jules) : la première libre s'ouvre, plus de liste.
    if (k === DUES) { relancesDues?.(); return; }
    setOnglet(k); setEcran("fiche"); setPassees(new Set()); setPrise(null); setRappel(null);
    if (!sessions[k] || k === ESSAI) ouvrir.mutate(k);
  };
  useEffect(() => { if (!onglet && essaiSeul) choisir(ESSAI); else if (!onglet && relances) choisir(RELANCES); else if (!onglet && villes.length) { const derniere = lireLocal("prospection.ville"); const voulue = [listeInitiale, derniere].find((id) => id && villes.some((l) => l.id === id)); choisir(voulue || villes[0].id); } }, [villes.length]);
  useEffect(() => { const t = setInterval(() => setHorloge(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => () => { clearInterval(chrono.current); clearInterval(compte.current); clearTimeout(messageT.current); rec.current?.flux?.getTracks().forEach((t) => t.stop()); }, []);

  // La file d'une ville part dès qu'on la choisit, en même temps que la session (15 nov. 2026) : elle ne l'attend plus.
  const listeDeLaFile = session?.liste_id || (onglet && ![ESSAI, DUES, RELANCES].includes(onglet) ? onglet : null);
  const file = useQuery(relances
    ? { queryKey: ["relance-fiche", relance?.agence_id], queryFn: () => base44.request("GET", `/api/prospection/relances/fiche?agence=${relance.agence_id}`), enabled: !!session && !!relance?.agence_id }
    : { queryKey: ["mode-appel-file", listeDeLaFile], queryFn: () => base44.request("GET", `${API}/file?liste=${listeDeLaFile}`), enabled: !!listeDeLaFile, staleTime: 30_000 });
  const recap = useQuery({ queryKey: ["mode-appel-recap", session?.id], queryFn: () => base44.request("GET", `${API}/sessions/${session.id}`), enabled: !!session?.id, refetchInterval: ecran === "fin" ? 5000 : false });
  const agences = useMemo(() => (file.data?.file || []).filter((x) => relances || !passees.has(x.id)), [file.data, passees]);
  // L'agence de l'appel en cours est figée dès qu'on quitte la fiche (12 oct. 2026) : une file rechargée pendant
  // l'appel ne la décale plus, et c'est bien elle qui passe à la validation, pas la suivante.
  const [figee, setFigee] = useState(null);
  const enTete = agences[0] || null;
  useEffect(() => { if (ecran === "fiche") setFigee(null); else if (enTete) setFigee((f) => f || enTete.id); }, [ecran, enTete?.id]);
  const a0 = rappel || (figee && (file.data?.file || []).find((x) => x.id === figee)) || enTete;
  // La file reprend après mon dernier appel de cette liste (12 oct. 2026) : on le dit une fois, à l'ouverture.
  const repriseDite = useRef(null);
  useEffect(() => {
    const r = file.data?.reprise;
    if (!r || relances || repriseDite.current === session?.liste_id) return;
    repriseDite.current = session?.liste_id;
    toast(`Reprise après « ${r.apres} »`, { description: "Votre dernier appel de cette liste : la file repart à la ligne suivante." });
  }, [file.data, relances, session?.liste_id]);
  // En essai, un cas joué comme une relance (ou l'essai de la page Relances) : la fiche porte son motif, comme une vraie relance.
  const scJoue = session?.essai ? scenarioEssai(scenario) : null;
  const motifEssai = session?.essai && a0 && !a0.relance ? (scJoue?.motif || (essaiSeul ? "point_mensuel" : null)) : null;
  const a = motifEssai ? { ...a0, relance: { motif: { cle: motifEssai, libelle: MOTIFS_ESSAI[motifEssai] }, phrase: `Essai : ${scJoue?.titre || "relance fictive"}.`, dernier: null, bien: null, historique: [] } } : a0;
  // Une nouvelle agence : les actions seules à nouveau.
  useEffect(() => { setAnnonce(null); setVoirTranscription(false); }, [a?.id]);
  const surUnBien = ["bien_retenu", "bien_refuse"].includes(a?.relance?.motif?.cle);
  const c = file.data?.chiffres;
  const recherches = file.data?.recherches || [];
  const cahier = file.data?.cahier || [];

  const dire = (texte) => { setMessage(texte); clearTimeout(messageT.current); messageT.current = setTimeout(() => setMessage(null), 5000); };
  function arreterTout() {
    clearInterval(chrono.current); clearInterval(compte.current);
    couperMicro(true);
    morceaux.current = []; setDirect([]);
  }
  function couperMicro(jeter = false) {
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    if (jeter) r0.jeter = true;
    clearInterval(r0.minuterie); clearInterval(r0.echantillons);
    voix.current.niveau = 0; voix.current.qui = null; setParle(null);
    try { r0.audio?.close(); } catch { /* déjà fermé */ }
    if (jeter && tempsReel.current) { tempsReel.current.arreter(); tempsReel.current = null; tempsReelOk.current = false; }
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
  }
  // Relances : rien ne s'enchaîne seul ; ce qui est noté s'affiche, avec « Relance suivante » et « Retour à la liste ».
  const suivante = (texte = null) => {
    if (relances) {
      arreterTout();
      setFait(texte || "Issue notée"); setEcran("fait");
      queryClient.invalidateQueries({ queryKey: ["relances"] });
      queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
      return;
    }
    arreterTout();
    if (a && !rappel) setPassees((s) => new Set(s).add(a.id));
    setRappel(null); setEcran("fiche"); setPrise(null); setIssue(null); setAppel(null); setRecu(null); setEdits({});
    setSimule(false); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setCle(null); setPasserOuvert(false); setNotesAppel(""); setAnnonce(null); setVoirTranscription(false);
    if (texte) dire(texte);
    queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
    queryClient.invalidateQueries({ queryKey: ["agent-ia-liste"] });
    queryClient.invalidateQueries({ queryKey: ["relances"] });
    queryClient.invalidateQueries({ queryKey: ["mode-appel-file", session?.liste_id] });
  };

  // Relances : une nouvelle ligne prise, l'écran repart de la fiche.
  useEffect(() => {
    if (!relances || !relance?.agence_id) return;
    arreterTout();
    setRappel(null); setEcran("fiche"); setPrise(null); setIssue(null); setAppel(null); setRecu(null); setEdits({}); setFait(null);
    setSimule(false); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setCle(null); setNotesAppel(""); setAnnonce(null); setVoirTranscription(false);
  }, [relance?.agence_id]);
  // Relances : la ligne reste à moi tant que je m'en sers (j'ai bougé dans la dernière minute, ou l'appel est en cours).
  const activite = useRef(Date.now());
  const ecranRef = useRef(ecran);
  useEffect(() => { ecranRef.current = ecran; }, [ecran]);
  // L'enregistrement d'écran (14 oct. 2026, Jules) : de l'appel décroché à sa validation, pour l'équipe seulement,
  // jamais sur un appel simulé. Il part rattaché à l'appel ; un appel annulé ne laisse rien.
  const { user: moi } = useAuth();
  const appelRef = useRef(null);
  useEffect(() => { appelRef.current = appel; }, [appel]);
  useEffect(() => {
    if (ecran === "appel" && !simule && moi?.role === "admin") { Ecran.demarrer(); return; }
    if (!Ecran.enCours()) return;
    if (["recu", "fait", "prepare"].includes(ecran)) {
      const a = appelRef.current;
      Ecran.terminer({ appel_id: a?.id || null, agence_id: a?.agence_id || null, agent: a?.agent || null });
    } else if (ecran === "fiche") {
      // Revenu à la fiche : annulé avant toute issue, rien n'est gardé ; sinon l'appel noté garde son écran.
      const a = appelRef.current;
      if (a?.id) Ecran.terminer({ appel_id: a.id, agence_id: a.agence_id || null, agent: a.agent || null }); else Ecran.abandonner();
    }
  }, [ecran, simule, moi?.role]);
  useEffect(() => () => { if (Ecran.enCours()) Ecran.abandonner(); }, []);
  useEffect(() => {
    if (!relances || !relance?.cle) return undefined;
    const bouger = () => { activite.current = Date.now(); };
    const evts = ["pointerdown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, bouger, { passive: true }));
    const t = setInterval(() => {
      const enAppel = ["appel", "raccroche", "analyse"].includes(ecranRef.current);
      if (!enAppel && Date.now() - activite.current > MINUTE) return;
      base44.request("POST", "/api/prospection/relances/garder", { body: { cle: relance.cle } }).then((r) => {
        if (r?.perdue) { toast.error(`${r.prise_par || "Un collègue"} a repris cette relance`); onRetour?.({ deja_lachee: true }); }
      }).catch(() => { /* sans réseau, la ligne reste prise jusqu'à quinze minutes */ });
    }, MINUTE);
    return () => { clearInterval(t); evts.forEach((e) => window.removeEventListener(e, bouger)); };
  }, [relance?.cle]);

  // --- La réservation : l'agence à l'écran est à moi -------------------------
  useEffect(() => {
    if (!a?.id || ecran !== "fiche" || session?.essai || rappel || relances) return undefined;
    let fini = false;
    const tenir = () => base44.request("POST", `${API}/reserver`, { body: { agence_id: a.id } }).catch((e) => {
      if (!fini && /l'a à l'écran/.test(String(e?.message || ""))) { setPassees((s) => new Set(s).add(a.id)); dire(`${a.nom} : ${e.message}`); }
    });
    // Réservée cinq minutes, sans compte à rebours à l'écran (il stressait) ; renouvelée seule à une minute de la fin.
    const tenirEtCompter = () => tenir().then((r) => { if (!fini && r?.jusqu) setReserveeJusqu(r.jusqu); });
    tenirEtCompter();
    const t = setInterval(() => { if (Date.parse(reserveeRef.current || 0) - Date.now() < 60_000) tenirEtCompter(); }, 5_000);
    return () => { fini = true; clearInterval(t); setReserveeJusqu(null); };
  }, [a?.id, ecran, session?.essai]);
  const reserveeRef = useRef(null);
  useEffect(() => { reserveeRef.current = reserveeJusqu; }, [reserveeJusqu]);
  // L'interlocuteur choisi : le premier de la liste à chaque nouvelle agence.
  useEffect(() => { setChoisi(null); }, [a?.id]);
  // L'équipe Apollo de l'agence (17 nov. 2026, Jules : « l'interlocuteur probable, puis les personnes d'Apollo, pas
  // ceux de la location ; pas leurs numéros, sinon ça consomme trop de crédits ») : la recherche gratuite, lue à
  // l'ouverture de la carte et gardée 90 jours ; prénom, initiale et poste, sans numéro.
  const villeAgence = String(a?.lieu || "").split(" · ")[0] || "";
  const equipe = useQuery({
    queryKey: ["equipe-apollo", a?.id],
    queryFn: () => base44.request("GET", `${API}/agences/${encodeURIComponent(a.id)}/equipe?${new URLSearchParams({ ...(villeAgence ? { ville: villeAgence } : {}), ...(a.place != null ? { place: String(a.place) } : {}) })}`),
    enabled: !!a?.id && !session?.essai, staleTime: Infinity, retry: false,
    // Les noms complets et le site de l'agence se lisent en tâche de fond : relue toutes les six secondes tant qu'ils tournent.
    refetchInterval: (q) => (q.state.data?.noms_en_cours || q.state.data?.site_en_cours || q.state.data?.photos_en_cours ? 6000 : false),
  });
  // Les interlocuteurs recalculés par le serveur à l'ouverture de la carte (toute l'équipe du site, Apollo, les noms
  // complets) ; ceux de la file en attendant. La photo de la page équipe se pose sur chacun.
  const contacts = useMemo(() => avecPhotos(equipe.data?.contacts || a?.contacts || [], equipe.data?.photos || {}), [a?.contacts, equipe.data]);
  // La carte d'avant l'appel montre ces interlocuteurs ; pendant l'appel, la fiche reste celle de la file (17 nov. 2026).
  const aCarte = useMemo(() => (a ? { ...a, contacts } : a), [a, contacts]);
  const contactChoisi = contacts.find((x) => x.id === choisi) || contacts.find((x) => !x.standard) || contacts[0] || null;
  // Le nom de l'autre voix dans la transcription : la personne choisie, sinon « Interlocuteur ».
  const nomAutre = (contactChoisi && !contactChoisi.standard && nomLisible(contactChoisi.nom)) || "Interlocuteur";
  const standard = contacts.find((x) => x.standard)?.telephone || a?.telephone || null;
  const numeroAppel = contactChoisi?.telephone || standard;

  // --- Les envois gardés hors ligne -------------------------------------------
  const vider = async () => {
    const liste = await enAttente();
    setHorsLigne(liste.length);
    for (const x of liste) {
      try {
        let r;
        if (x.genre === "issue") {
          const f = new FormData();
          for (const [k, v] of Object.entries(x.champs)) if (v != null) f.append(k, v);
          if (x.audio) f.append("audio", x.audio, "appel.wav");
          (x.audios || []).forEach((w, k) => f.append("audio", w, `m${k}.wav`));
          r = await base44.request("POST", `${API}/issue`, { body: f, isForm: true });
        } else r = await base44.request("POST", x.url, { body: x.champs });
        await retirer(x.id);
        if (x.genre === "issue" && !r?.simple) queryClient.invalidateQueries({ queryKey: ["mode-appel-suspens"] });
      } catch (e) {
        if (erreurReseau(e)) break;
        await retirer(x.id);
        toast.error(`Un envoi gardé hors ligne a été refusé : ${e?.message || "erreur"}`);
      }
    }
    setHorsLigne((await enAttente()).length);
    queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
  };
  useEffect(() => {
    vider();
    const f = () => vider();
    window.addEventListener("online", f);
    const t = setInterval(f, 30_000);
    return () => { window.removeEventListener("online", f); clearInterval(t); };
  }, []);

  // --- L'appel -------------------------------------------------------------
  const prendre = useMutation({
    mutationFn: (agenceId) => base44.request("POST", `${API}/prendre`, { body: { agence_id: agenceId } }),
    onSuccess: (r, agenceId) => setPrise({ agence_id: agenceId, agent_id: r.agent_id }),
    onError: (e) => { if (!erreurReseau(e)) toast.error(e?.message || "Un collègue l'appelle déjà"); },
  });
  const lancerChrono = (depart = 0) => { clearInterval(chrono.current); setSecondes(depart); chrono.current = setInterval(() => setSecondes((s) => s + 1), 1000); };
  const montrer = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat, niveau: x.niveau ?? null, qui: x.qui ?? null })));
  const transcrireMorceau = async (x) => {
    try {
      const f = new FormData();
      f.append("i", String(x.i));
      f.append("audio", x.wav, `m${x.i}.wav`);
      const r = await base44.request("POST", `${API}/morceau`, { body: f, isForm: true });
      x.texte = r.texte || ""; x.etat = "ok"; x.wav = null;
    } catch { x.etat = "echec"; }
    montrer();
  };
  // Enregistre par morceaux, chacun lisible seul, transcrit pendant que l'appel continue. Coupés aux silences depuis le
  // 15 nov. 2026 (Jules : « pas des blocs de 8 secondes ») : dès 2 s de parole et 0,6 s de silence, au plus tard à 6 s ;
  // un morceau sans parole n'est pas envoyé à la transcription (son audio reste pour la part de parole).
  const enregistrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      setNotes(false); dire("Micro indisponible ou pris par l'appel : appel sans notes, vous taperez l'issue.");
      return;
    }
    const r0 = { flux, actif: true, jeter: false, m: null, minuterie: null, audio: null, debutTour: null };
    rec.current = r0;
    // La transcription en temps réel (15 nov. 2026) sur le même micro : prête, elle remplace les morceaux transcrits ;
    // tombée, les morceaux reprennent.
    tempsReelOk.current = false; tempsReelServi.current = false; setTexteDirect(""); voix.current.arrivees = [];
    tempsReel.current = ouvrirTranscriptionDirecte(flux, {
      onTexte: (t) => {
        const v = voix.current;
        v.arrivees.push({ fin: texteNormal(t).length, t: Date.now() });
        v.derniere = Date.now();
        setTexteDirect(t);
      },
      onEtat: (etat) => {
        if (etat === "pret") { tempsReelOk.current = true; tempsReelServi.current = true; }
        else if (tempsReelOk.current) { tempsReelOk.current = false; dire("Transcription en direct coupée : elle reprend par morceaux."); }
      },
    });
    // Le niveau du son, pour couper aux silences : le bruit de fond se mesure seul, le seuil est trois fois au-dessus.
    let analyse = null;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(flux).connect(an);
      r0.audio = ctx;
      const buf = new Float32Array(an.fftSize);
      let bruit = 0.01;
      let sonne = false;
      // Toutes les 50 ms : le niveau pour les rubans, les instants de parole pour savoir qui parle (16 nov. 2026).
      r0.echantillons = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let somme = 0; for (const x of buf) somme += x * x;
        const n = Math.sqrt(somme / buf.length);
        bruit = n < bruit ? n : bruit + (n - bruit) * 0.001;
        sonne = n > Math.max(0.008, bruit * 3);
        const v = voix.current;
        const t = Date.now();
        v.niveau = n; v.simule = false;
        if (sonne) { v.historique.push({ t, n }); v.dernierSon = t; if (v.historique.length > 12000) v.historique.splice(0, 2000); }
        if (t - (v.calcule || 0) > 2000) { v.calcule = t; v.seuil = seuilDeuxVoix(v.historique.slice(-6000).map((x) => x.n)); }
        const qui = t - (v.dernierSon || 0) < 400 ? voixDe(niveauEntre(v.historique, t - 500, t), v.seuil) : null;
        if (qui !== v.qui) { v.qui = qui; setParle(qui); }
      }, 50);
      analyse = () => sonne;
    } catch { /* sans analyse : des morceaux de 6 s */ }
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const debut = Date.now();
      r0.debutTour = debut;
      let dernierSon = debut;
      let parle = !analyse;
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (e) => { if (e.data?.size) bouts.push(e.data); };
      m.onstop = async () => {
        const encore = r0.actif;
        if (encore) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (r0.jeter || !bouts.length) return;
        const x = { i: morceaux.current.length, texte: null, wav: null, etat: "envoi", debut, niveau: niveauEntre(voix.current.historique, debut, Date.now()) };
        morceaux.current.push(x); montrer();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrer(); return; }
        audios.current[x.i] = x.wav;
        if (!parle) { x.texte = ""; x.etat = "ok"; x.wav = null; montrer(); return; }
        // En temps réel, le texte vient déjà du flux : le morceau ne garde que son son (part de parole).
        if (tempsReelOk.current) { x.texte = ""; x.etat = "son"; montrer(); return; }
        transcrireMorceau(x);
      };
      m.start();
      r0.minuterie = setInterval(() => {
        const t = Date.now();
        if (analyse && analyse()) { dernierSon = t; parle = true; }
        const age = t - debut;
        if (m.state === "recording" && ((parle && age >= 2000 && t - dernierSon >= 600) || age >= 6000)) { clearInterval(r0.minuterie); m.stop(); }
      }, 100);
    };
    tour();
  };
  // Attend la fin des morceaux en cours (au plus vingt secondes), puis réessaie une fois ceux qui ont raté.
  const morceauxPrets = async () => {
    // Le texte final du temps réel, s'il a servi : les phrases deviennent les morceaux de la transcription.
    if (tempsReel.current) {
      const fin = await tempsReel.current.arreter();
      tempsReel.current = null;
      if (tempsReelServi.current && fin?.trim()) {
        const { phrases, enCours } = enPhrases(fin);
        const sons = morceaux.current.filter((x) => x.etat !== "son" && x.texte);
        morceaux.current = [...sons, ...[...phrases, enCours].filter(Boolean).map((t) => ({ texte: t, etat: "ok" }))].map((x, i) => ({ ...x, i }));
        tempsReelOk.current = false;
        montrer();
      }
    }
    const t0 = Date.now();
    while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
    await Promise.all(morceaux.current.filter((x) => x.etat === "echec" && x.wav).map(transcrireMorceau));
  };
  // La lecture en avance (9 oct. 2026) : pendant l'appel, AK lit la transcription du moment, au plus toutes
  // les 25 secondes et une à la fois. Au raccrochage, si la fin n'y change rien, l'écran d'actions s'ouvre aussitôt.
  const preLecture = useRef({ dernier: 0, sig: "", enCours: false });
  useEffect(() => {
    if (ecran !== "appel" || !notes || !a || prise?.agence_id !== a.id || !prise?.agent_id) return;
    const textes = morceaux.current.filter((x) => x.etat === "ok" && x.texte).map((x) => x.texte);
    const sig = `${textes.join("\n")}\n--\n${notesAppel.trim()}`;
    const pl = preLecture.current;
    if (pl.enCours || textes.join("\n").length < 80 || sig === pl.sig || Date.now() - pl.dernier < 25000) return;
    pl.enCours = true; pl.dernier = Date.now(); pl.sig = sig;
    base44.request("POST", `${API}/pre-lecture`, { body: { agent_id: prise.agent_id, agence_id: a.id, morceaux: JSON.stringify(textes), notes: notesAppel.trim() || null } })
      .catch(() => {}).finally(() => { pl.enCours = false; });
  }, [direct, ecran, notesAppel, prise?.agent_id]);
  const retenirEnCours = (x) => { poserLocal(CLE_EN_COURS, x); setEnCours(x); };
  const micro = () => {
    if (session?.essai && scenario !== LIBRE) { simuler(); return; }
    if (!prise || prise.agence_id !== a.id) prendre.mutate(a.id);
    retenirEnCours({ agence: { id: a.id, nom: a.nom, telephone: numeroAppel, lieu: a.lieu, badge: a.badge, historique: a.historique, interlocuteurs: a.interlocuteurs }, onglet, le: new Date().toISOString() });
    preLecture.current = { dernier: 0, sig: "", enCours: false };
    audios.current = [];
    nouvellesVoix();
    setNotes(true); setSimule(false); setEcran("appel"); lancerChrono(); enregistrer();
  };
  // Les cartes de réponse pendant l'appel (15 nov. 2026) : l'écoute en direct du navigateur (quelques centaines de
  // millisecondes) et les morceaux transcrits ; la tournure repérée montre sa carte, une à la fois, qui s'efface seule.
  // Le temps réel (15 nov. 2026) : ses phrases finies s'affichent comme la transcription, la phrase en cours en gris.
  const tempsReel = useRef(null);
  const tempsReelOk = useRef(false);
  const tempsReelServi = useRef(false);
  const [texteDirect, setTexteDirect] = useState("");
  const directTempsReel = useMemo(() => enPhrases(texteDirect), [texteDirect]);
  const motsEnDirect = tempsReelOk.current ? directTempsReel.enCours : "";
  // La transcription par interlocuteur (16 nov. 2026, Jules : « la transcription normale, puis toutes les trois secondes
  // ça étiquette ») : la phrase s'affiche sans nom ; le nom vient de l'étiquetage au sens par l'IA (voixIA), ou d'une
  // correction à la main, qui l'emporte. En temps réel, les phrases du flux ; sinon, les morceaux transcrits.
  const lignesVoix = (() => {
    if (tempsReelOk.current) {
      // Coupées à la ponctuation et aux silences, clées par leur position : une correction plus loin ne les décale pas.
      const { phrases, enCours: bout } = phrasesEtTours(texteDirect, voix.current.arrivees);
      return {
        lignes: phrases.map((p) => ({ cle: p.cle, texte: p.texte, qui: voixCorrigees[p.cle] ?? voixIA[p.cle] ?? null, main: !!voixCorrigees[p.cle] })),
        enCours: bout.texte ? { texte: bout.texte, qui: null } : null,
      };
    }
    return { lignes: direct.filter((x) => x.texte).map((x) => ({ cle: `m${x.i}`, texte: x.texte, qui: voixCorrigees[`m${x.i}`] ?? voixIA[`m${x.i}`] ?? null, main: !!voixCorrigees[`m${x.i}`] })), enCours: null };
  })();
  // Toutes les trois secondes, les phrases finies sans nom partent à l'étiquetage, avec la conversation pour contexte.
  const lignesVoixRef = useRef(lignesVoix);
  lignesVoixRef.current = lignesVoix;
  const etiquetage = useRef(false);
  const dejaRelu = useRef("");
  useEffect(() => {
    if (ecran !== "appel" || !notes) return undefined;
    const id = setInterval(() => {
      const toutes = lignesVoixRef.current.lignes;
      const sansNom = toutes.filter((l) => !l.qui).length;
      // À une pause (plus d'une seconde sans mot) ou quand trois phrases attendent : pas en pleine phrase.
      const der = voix.current.arrivees[voix.current.arrivees.length - 1];
      const pause = !tempsReelOk.current || !der || Date.now() - der.t > 1100;
      // Rien de nouveau depuis la dernière relecture : on n'appelle pas le modèle pour rien.
      const signature = toutes.map((l) => `${l.cle}:${l.texte.length}`).join("|");
      if (etiquetage.current || !sansNom || signature === dejaRelu.current || (!pause && sansNom < 3)) return;
      dejaRelu.current = signature;
      // Toute la conversation récente est relue à chaque passage (16 nov. 2026, essais sur l'appel MACSF : figer les phrases
      // après quatre autres en laissait cinq fausses sur 32, relire tout n'en laisse que les deux vraiment ambiguës) ; une
      // correction à la main reste figée.
      const lignes = toutes.map((l) => (l.main ? l : { ...l, qui: null }));
      etiquetage.current = true;
      base44.request("POST", "/api/prospection/mode-appel/etiqueter", { body: { lignes, analyste: String(moi?.full_name || moi?.email || "").split(/[ .@]/)[0] || null, interlocuteur: nomAutre } })
        .then((r) => { if (r?.etiquettes) setVoixIA((v) => ({ ...v, ...r.etiquettes })); })
        .catch(() => {})
        .finally(() => { etiquetage.current = false; });
    }, 3000);
    return () => clearInterval(id);
  }, [ecran, notes]);
  // La personne de l'agence, cherchée pendant l'appel (16 nov. 2026, Jules : « dès qu'il dit son nom, ou qu'on le tape dans
  // les notes, ça lance la recherche en parallèle ; dès qu'on ferme, c'est instantané ») : toutes les cinq secondes, tant
  // que la conversation n'a pas dit son nom, la transcription et les notes partent au serveur, qui y lit le nom et lance
  // la recherche de sa page sans attendre ; une fois le nom dit, seules les notes changées repartent.
  const personne = useRef({ nom: null, par: null, envoi: false });
  const [personneAppel, setPersonneAppel] = useState(null);
  const notesRef = useRef("");
  notesRef.current = notesAppel;
  const nomAutreRef = useRef(nomAutre);
  nomAutreRef.current = nomAutre;
  const agentPris = prise?.agence_id === a?.id ? prise?.agent_id : null;
  useEffect(() => {
    if (ecran !== "appel" || !agentPris || session?.essai) return undefined;
    const envoyer = () => {
      const p = personne.current;
      if (p.envoi) return;
      const lignes = [...lignesVoixRef.current.lignes, ...(lignesVoixRef.current.enCours ? [lignesVoixRef.current.enCours] : [])];
      const texte = lignes.map((l) => `${l.qui === "vous" ? "Analyste : " : l.qui === "autre" ? "Agent : " : ""}${l.texte}`).join("\n");
      const notesNow = notesRef.current.trim();
      // Le nom déjà dit : on ne relit que si les notes changent ; sinon, à chaque nouveau bout de conversation.
      const notesChangees = notesNow !== (p.notes ?? null);
      const nouveauTexte = texte.length - (p.longueur || 0) >= 60;
      if (p.par === "appel" ? !notesChangees : (!notesChangees && !nouveauTexte && p.longueur !== undefined)) return;
      p.envoi = true; p.notes = notesNow; p.longueur = texte.length;
      base44.request("POST", `${API}/personne`, { body: { agent_id: agentPris, texte, notes: notesNow, connu: nomAutreRef.current !== "Interlocuteur" ? nomAutreRef.current : null, analyste: String(moi?.full_name || moi?.email || "").split(/[ .@]/)[0] || null } })
        .then((r) => { if (r?.nom) { p.nom = r.nom; p.par = r.par; setPersonneAppel(r.nom); } })
        .catch(() => {})
        .finally(() => { p.envoi = false; });
    };
    envoyer();
    const id = setInterval(envoyer, 5000);
    return () => clearInterval(id);
  }, [ecran, agentPris, session?.essai]);
  const motsTranscrits = [...lignesVoix.lignes.map((l) => l.texte), lignesVoix.enCours?.texte || ""].join(" ").split(/\s+/).filter(Boolean).length;
  const [carteObjection, setCarteObjection] = useState(null);
  const objectionsVues = useRef(new Map());
  const texteMorceaux = tempsReelOk.current ? directTempsReel.phrases.join(" ") : direct.filter((x) => x.texte).map((x) => x.texte).join(" ");
  useEffect(() => {
    if (!CARTES_OBJECTION || ecran !== "appel") { setCarteObjection(null); objectionsVues.current = new Map(); return; }
    const maintenant = Date.now();
    const recentes = new Set([...objectionsVues.current].filter(([, le]) => maintenant - le < 60_000).map(([k]) => k));
    const o = objectionEntendue(`${texteMorceaux.slice(-600)} ${motsEnDirect}`, recentes);
    if (!o) return;
    objectionsVues.current.set(o.cle, maintenant);
    setCarteObjection({ ...o, le: maintenant });
  }, [texteDirect, texteMorceaux, ecran]);
  useEffect(() => {
    if (!carteObjection) return undefined;
    const t = setTimeout(() => setCarteObjection((c) => (c?.le === carteObjection.le ? null : c)), 30_000);
    return () => clearTimeout(t);
  }, [carteObjection?.le]);
  // Le temps après l'appel (13 oct. 2026, Jules) : depuis le raccrochage jusqu'aux actions prêtes, à la validation, à « Tout est préparé ».
  const finAppel = useRef(null);
  const noterTemps = (etape, id) => {
    if (!finAppel.current || !id) return;
    base44.request("POST", `${API}/appels/${id}/temps`, { body: { etape, ms: Date.now() - finAppel.current } }).catch(() => {});
  };
  // Au raccrochage : avec la transcription, AK lit l'appel et l'écran d'actions s'ouvre ; sans notes, l'issue se tape.
  const raccrocher = () => {
    finAppel.current = Date.now();
    clearInterval(chrono.current);
    couperMicro(false);
    if (!notes) { setEcran("issue"); return; }
    // Plus de note d'après l'appel (9 nov. 2026, Jules), ni de transition « Appel terminé » (retirée le 15 nov. 2026,
    // Jules) : la lecture de l'assistant s'ouvre aussitôt, et la lecture faite pendant l'appel resert.
    setEcran("analyse");
    noter.mutate({ issue: "auto" });
  };
  // Message laissé (13 oct. 2026, Jules) : rien à lire, l'issue est posée et les actions proposées s'ouvrent.
  const messageLaisse = () => {
    finAppel.current = Date.now();
    clearInterval(chrono.current);
    couperMicro(false);
    setIssue("repondeur");
    setEcran("analyse");
    noter.mutate({ issue: "repondeur", simple: false });
  };
  // Avant l'appel (16 nov. 2026, Jules) : composé sans écoute, personne ou un répondeur ; l'agence est prise, l'issue posée.
  const sansConversation = (is) => {
    if (!prise || prise.agence_id !== a.id) prendre.mutate(a.id);
    finAppel.current = Date.now();
    setNotes(false);
    if (is === "repondeur") { setIssue("repondeur"); setEcran("analyse"); noter.mutate({ issue: "repondeur", simple: false }); return; }
    choisirIssue(is, true);
  };
  // Pas de réponse (16 nov. 2026, maquette de Jules : « Rappeler plus tard ») : l'écoute s'efface, la relance se planifie.
  const pasDeReponse = () => {
    finAppel.current = Date.now();
    clearInterval(chrono.current);
    couperMicro(true);
    choisirIssue("pas_de_reponse", true);
  };
  const annulerAppel = () => { arreterTout(); retenirEnCours(null); setNotes(true); setSimule(false); setEcran("fiche"); };
  const rappeler = () => { setEcran("appel"); lancerChrono(secondes); if (notes && !simule) enregistrer(); };
  // L'appel simulé : la conversation d'exemple défile phrase par phrase, comme une vraie transcription.
  // Un cas de figure du mode Essai : ses phrases défilent comme une vraie transcription, ses notes se posent.
  const simuler = (cas = null) => {
    const sc = cas || scenarioEssai(scenario) || scenarioEssai(SCENARIO_DEFAUT);
    setScenario(sc.cle);
    if (!session?.essai) { setSimulerApres(true); choisir(ESSAI); return; }
    if (!a) return;
    prendre.mutate(a.id);
    morceaux.current = []; setDirect([]);
    preLecture.current = { dernier: 0, sig: "", enCours: false };
    nouvellesVoix();
    setNotesAppel(sc.notes || "");
    setNotes(true); setSimule(true); setEcran("appel"); setSecondes(0);
    let n = 0;
    clearInterval(chrono.current);
    chrono.current = setInterval(() => {
      setSecondes((s0) => s0 + 4);
      if (n < sc.phrases.length) {
        const qui = voixParLesMots(sc.phrases[n]);
        morceaux.current.push({ i: n, texte: sc.phrases[n], etat: "ok", qui }); n += 1; montrer();
        Object.assign(voix.current, { niveau: 0.15, simule: true, qui, derniere: Date.now() }); setParle(qui);
      } else if (voix.current.qui) { voix.current.qui = null; setParle(null); }
    }, 900);
  };
  useEffect(() => { if (simulerApres && session?.essai && a && ecran === "fiche") { setSimulerApres(false); simuler(); } });

  // --- Passer, avec sa raison --------------------------------------------------
  const passer = useMutation({
    mutationFn: (raison) => base44.request("POST", `${API}/passer`, { body: { agence_id: a.id, raison } }),
    onSuccess: (_r, raison) => suivante({ fermee: "Marquée fermée · sortie de la ville", pas_pertinente: "Pas pertinente · sortie de la cible", plus_tard: "Passée · elle revient demain" }[raison]),
    onError: (e) => toast.error(e?.message || "Impossible de passer"),
  });

  // --- L'issue -------------------------------------------------------------
  const ouvrirActions = (ap, is) => {
    noterTemps("pret", ap.id);
    const props = ap.propositions || [];
    setAppel(ap); setIssue(is); setCle(nouvelleCle());
    setCoches(new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
    const pm = props.find((p) => p.type === "mail");
    setMail(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele } : null);
    setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setEdits({});
    setEcran("actions");
  };
  // Le clip d'objection (16 oct. 2026, Jules) : AK a relevé une objection non levée ; quinze secondes
  // autour de sa phrase partent à l'équipe (Dashboard), après coup, sans rien attendre. Jamais en essai.
  const objectionEnvoyee = useRef(new Set());
  const envoyerObjection = (ap) => {
    const phrase = ap?.objection?.phrase;
    // En temps réel, les phrases ne suivent plus les morceaux de son : l'extrait serait faux, il n'est pas envoyé.
    if (!phrase || !ap.id || session?.essai || simule || tempsReelServi.current || objectionEnvoyee.current.has(ap.id)) return;
    const i = morceauDeLaPhrase(morceaux.current.map((x) => x.texte || ""), phrase);
    if (i < 0 || !audios.current[i]) return;
    objectionEnvoyee.current.add(ap.id);
    clipAutour(audios.current, i).then((clip) => {
      if (!clip) return null;
      const f = new FormData();
      f.append("audio", clip, "objection.wav");
      return base44.request("POST", `${API}/appels/${ap.id}/objection`, { body: f, isForm: true });
    }).then((r) => { if (r?.objection && !r.deja) toast("Objection envoyée à l'équipe", { description: `« ${phrase.slice(0, 90)} » : quinze secondes à écouter sur la page Assistant Klocka.` }); }).catch(() => {});
  };
  // La part de parole : l'audio entier part après coup, sans rien attendre ; jamais sur un appel simulé ni sans transcription gardée.
  const envoyerParole = (id) => {
    if (!id || session?.essai || simule || parole.current.has(id)) return;
    const wavs = audios.current.filter(Boolean);
    if (!wavs.length || wavs.reduce((t, b) => t + b.size, 0) > OCTETS_MAX) return;
    parole.current.add(id);
    fusionnerWav(wavs).then((wav) => {
      if (!wav) return null;
      const f = new FormData();
      f.append("audio", wav, "appel.wav");
      return base44.request("POST", `${API}/appels/${id}/parole`, { body: f, isForm: true });
    }).catch(() => {});
  };
  const noter = useMutation({
    mutationFn: async ({ issue: is, simple = false, remplace = null, notes: notesDites = null }) => {
      const notesAEnvoyer = notesDites ?? notesAppel;
      const champs = { agence_id: a.id, agent_id: prise?.agence_id === a.id ? prise.agent_id : null, issue: is, session_id: session?.id || null, numero: numeroAppel || a.telephone || null, remplace, motif: a.relance?.motif?.cle || null, notes: notesAEnvoyer.trim() || null, monday_essai: session?.essai && mondayEssai ? "1" : null,
        // Le suivi de l'usage (9 oct. 2026) : la durée de l'appel et le mode d'où il part.
        duree_s: secondes > 0 ? String(secondes) : null, source: session?.essai ? "essai" : relances ? "relances" : "prospection" };
      let wavs = [];
      if (is === "auto" || remplace) {
        await morceauxPrets();
        // Le texte de chaque morceau ; ceux restés sans texte partent en audio, à leur place.
        champs.morceaux = JSON.stringify(morceaux.current.map((x) => (x.etat === "ok" ? x.texte || "" : x.wav ? null : "")));
        wavs = morceaux.current.filter((x) => x.etat !== "ok" && x.wav).map((x) => x.wav);
      }
      const f = new FormData();
      for (const [k, v] of Object.entries(champs)) if (v != null) f.append(k, v);
      wavs.forEach((w, k) => f.append("audio", w, `m${k}.wav`));
      try {
        chaine.reinitialiser();
        const r = await base44.flux(`${API}/issue?flux=1`, { body: f, isForm: true, surEtape: chaine.pousser });
        await chaine.vider();
        setEtapesFinies(chaine.lire());
        return r;
      } catch (e) {
        // Sans réseau, la transcription et les morceaux restent dans le téléphone.
        if (!erreurReseau(e)) throw e;
        await garder({ id: nouvelleCle(), genre: "issue", champs, audios: wavs });
        setHorsLigne((n) => n + 1);
        return { hors_ligne: true, simple };
      }
    },
    onSuccess: (r, v) => {
      retenirEnCours(null);
      if (r.hors_ligne) return suivante(v.simple ? "Hors ligne : l'issue est gardée et partira au retour du réseau" : "Hors ligne : l'appel et sa transcription sont gardés ; les actions s'ouvriront au retour du réseau");
      // « Que du résidentiel », « Il rappelle tout de suite » (16 oct. 2026) : validés d'office, sans relance ni Monday.
      if (r.simple && r.issue === "residentiel") return suivante("Que du résidentiel · noté, sorti de la file, ni relance ni Twenty CRM");
      if (r.simple && r.issue === "rappelle_bientot") return suivante("Il rappelle tout de suite · l'appel est noté ; quand il rappelle, touchez « Rappel »");
      if (r.simple) return suivante(`${v.issue === "repondeur" ? "Message laissé" : v.issue === "agent_prevenu" ? "Agent prévenu" : "Pas de réponse"} · ${r.recu?.relance?.texte?.toLowerCase() || "relance planifiée"}`);
      envoyerParole(r.appel.id);
      envoyerObjection(r.appel);
      ouvrirActions(r.appel, r.appel.issue_tapee || v.issue);
    },
    onError: (e) => { toast.error(e?.message || "L'appel n'a pas pu être lu"); setEcran(direct.length ? "appel" : "issue"); },
  });
  // Déjà appelé, sans enregistrer : le résumé dit ou écrit tient lieu de notes, AK en déduit tout (9 oct. 2026).
  const analyserResume = (texte) => {
    if (!prise || prise.agence_id !== a.id) prendre.mutate(a.id);
    morceaux.current = []; setDirect([]); setSecondes(0);
    setNotesAppel(texte); setNotes(false);
    setEcran("analyse");
    noter.mutate({ issue: "auto", notes: texte });
  };
  // Sans transcription (appel sans notes), l'issue se tape encore.
  const choisirIssue = (is, simple) => {
    if (!finAppel.current) finAppel.current = Date.now();
    setIssue(is);
    if (!simple) setEcran("analyse");
    noter.mutate({ issue: is, simple });
  };
  // AK s'est trompé d'issue : on la change, les actions se refont sur la même transcription.
  const changerIssue = (is) => { setEcran("analyse"); noter.mutate({ issue: is, remplace: appel.id }); };
  // L'assistant a appris qu'il fallait relire : une autre issue, ou un fait nouveau qui rejoint les notes.
  const refaireActions = ({ issue: is, precision }) => {
    const avec = precision ? [notesAppel.trim(), `Précision après l'appel : ${precision}`].filter(Boolean).join("\n") : notesAppel;
    if (precision) setNotesAppel(avec);
    setEcran("analyse");
    noter.mutate({ issue: is, remplace: appel.id, notes: avec });
  };

  // --- Ce qui a été compris ----------------------------------------------------
  const compris = appel?.compris?.champs || {};
  const faits = useMemo(() => CHAMPS_COMPRIS.map(([k, libelle]) => {
    const x = compris[k];
    const valeur = !x ? "" : k === "date" ? `${jourLong(x.valeur)}${x.mots ? ` (« ${x.mots} »)` : ""}` : k === "mandat" && x.date ? `${x.valeur} · ${jourLong(x.date)}` : Array.isArray(x.valeur) ? x.valeur.join(" ; ") : String(x.valeur);
    // Le numéro appelé n'a pas de phrase : il est sûr, on le dit sans lien « d'où ça vient ».
    return { cle: k, libelle: x?.appele ? "Téléphone (numéro appelé)" : libelle, valeur, citation: x?.appele ? null : x?.source || null, incertain: x?.incertain || null };
  }), [appel]);

  // --- Valider, une fois ; le reçu ; annuler dix secondes -----------------------
  const corpsValidation = () => ({
    choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday, note: String(edits.note || note).trim(), cle,
    session_id: session?.id || null, issue, depuis_fenetre: depuisFenetre.current, etapes_vues: etapesVues.current,
    passe: edits.passe ?? null,
    // Les cases Monday corrigées à l'écran d'actions (16 oct. 2026) : elles partent telles quelles.
    monday_cases: edits.monday && Object.keys(edits.monday).length ? edits.monday : null,
    sans_twenty: !!edits.sans_twenty,
    corrections: faits.filter((f) => MODIFIABLES.includes(f.cle) && edits[f.cle] != null && edits[f.cle].trim() !== f.valeur).map((f) => ({ cle: f.cle, libelle: f.libelle, valeur: edits[f.cle].trim() })),
  });
  // Valider depuis la fenêtre des actions (8 oct. 2026) : elle reste ouverte et suit l'envoi, puis « Tout préparé ».
  const depuisFenetre = useRef(false);
  const etapesVues = useRef([]);
  const valider = useMutation({
    mutationFn: async () => {
      const url = `${API}/appels/${appel.id}/valider`;
      const body = corpsValidation();
      // Plafond de 30 s (12 oct. 2026, « Validation… » qui tournait) : le serveur finit seul, une seule fois (même clé).
      const lente = new Promise((ok) => setTimeout(() => ok({ lente: true }), 30000));
      try { return await Promise.race([base44.request("POST", url, { body }), lente]); } catch (e) {
        if (!erreurReseau(e)) throw e;
        await garder({ id: body.cle, genre: "valider", url, champs: body });
        setHorsLigne((n) => n + 1);
        return { hors_ligne: true };
      }
    },
    onMutate: () => noterTemps("valide", appel?.id),
    onSuccess: (r) => {
      if (r.hors_ligne) return suivante("Hors ligne : la validation est gardée et partira une seule fois au retour du réseau");
      if (r.lente) return suivante("La validation est enregistrée, Twenty CRM suit : le reçu sera dans le Suivi");
      setRecu(r.recu);
      if (!depuisFenetre.current) setEcran("recu");
      queryClient.invalidateQueries({ queryKey: ["mode-appel-suspens"] });
      if (relances) queryClient.invalidateQueries({ queryKey: ["relances"] });
      const fin = Date.parse(r.recu?.annulable_jusqu || 0);
      clearInterval(compte.current);
      const tic = () => setAnnulerDans(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
      tic();
      compte.current = setInterval(tic, 250);
    },
    onError: (e) => { toast.error(e?.message || "Validation impossible"); setEcran("actions"); },
  });
  const annuler = useMutation({
    mutationFn: () => base44.request("POST", `${API}/appels/${appel.id}/annuler`),
    onSuccess: (r) => { clearInterval(compte.current); setRecu(null); setCle(nouvelleCle()); setEcran("actions"); dire(`Annulé : ${(r.fait || []).join(", ") || "rien n'était encore fait"}`); },
    onError: (e) => toast.error(e?.message || "Trop tard pour annuler"),
  });
  const recuFrais = useQuery({
    queryKey: ["mode-appel-recu", appel?.id],
    queryFn: () => base44.request("GET", `${API}/appels/${appel.id}/recu`),
    enabled: (ecran === "recu" || (ecran === "actions" && !!recu)) && !!appel?.id,
    refetchInterval: 2500,
  });
  const r = recuFrais.data?.recu || recu;
  const aFaire = r && (r.mail?.etat === "brouillon" || r.monday?.etat === "doute");
  // Le mail part juste après les dix secondes : on attend de savoir s'il est retrouvé dans les envoyés.
  // On ne retient pas l'analyste plus de six secondes après la fenêtre d'annulation (16 oct. 2026) : le mail finit de partir seul.
  const [envoiLong, setEnvoiLong] = useState(false);
  useEffect(() => { setEnvoiLong(false); if (annulerDans > 0 || !recu) return undefined; const t = setTimeout(() => setEnvoiLong(true), 6000); return () => clearTimeout(t); }, [annulerDans > 0, !!recu]);
  const mailEnRoute = r?.mail?.etat === "attente" && /part dans/.test(r.mail.texte || "") && !envoiLong;
  // Dix secondes, puis « Tout est préparé ! » (8 oct. 2026), puis la suivante ; un brouillon à ouvrir ou une ligne à choisir attendent un geste.
  const [bilan, setBilan] = useState("");
  useEffect(() => {
    if (!(ecran === "recu" || (ecran === "actions" && recu)) || annulerDans > 0 || !r || aFaire || mailEnRoute || annuler.isPending) return;
    clearInterval(compte.current);
    const ok = [r.monday, r.mail, r.diffusion, r.relance].filter(Boolean);
    setBilan(ok.map((x) => x.texte).join(" · "));
    noterTemps("prepare", appel?.id);
    finAppel.current = null;
    setEcran("prepare");
  }, [annulerDans, ecran, aFaire, mailEnRoute]);
  const apresPrepare = () => { if (relances) onSuivante?.(); else suivante(bilan); };
  // Ce que « Tout préparé » récapitule : le prochain appel, puis ce que le reçu a vérifié.
  const prRelance = (appel?.propositions || []).find((x) => x.type === "relance");
  const dateProchain = relanceLe || prRelance?.prochaine?.le || null;
  const nomProchain = (edits?.interlocuteur || "").trim() || appel?.compris?.champs?.interlocuteur?.valeur || a?.nom || "";
  const phrasePrepare = issue === "pas_interesse" ? `${a?.nom || "L'agence"} ne sera plus appelée.` : dateProchain ? `Prochain appel à ${nomProchain} le ${jourLong(dateProchain)}.` : null;
  const lignesPrepare = lignesDuRecu(r, { issue, dateRelance: dateProchain, jourLong });

  const ligne = useMutation({
    mutationFn: ({ id, choix }) => base44.request("POST", `${API}/appels/${id}/ligne-monday`, { body: { ligne_id: choix } }),
    onSuccess: (x) => { if (ecran === "recu") setRecu(x.recu); recap.refetch(); queryClient.invalidateQueries({ queryKey: ["mode-appel-recu"] }); },
    onError: (e) => toast.error(e?.message || "Twenty CRM n'a pas répondu"),
  });
  const renvoyer = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/appels/${id}/renvoyer`),
    onSuccess: (x) => { if (x.ok) toast.success("Mail envoyé"); else toast.error(x.error || "Le mail n'est pas parti"); recap.refetch(); },
    onError: (e) => toast.error(e?.message || "Le mail n'est pas parti"),
  });
  const reessayer = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/appels/${id}/reessayer`),
    onSuccess: () => recap.refetch(),
  });
  const ouvrirBrouillon = (id, mailto) => {
    if (mailto) window.location.href = mailto;
    base44.request("POST", `${API}/appels/${id}/brouillon`).then((x) => { if (ecran === "recu") setRecu(x.recu); recap.refetch(); }).catch(() => {});
  };

  // --- Rendu ---------------------------------------------------------------
  // Après l'appel (15 nov. 2026, Jules, maquette 1) : la page n'est plus que le chat ; le nom de l'appel prend la place
  // du titre et des villes, qui reviennent après la validation.
  // Dès le raccrochage (la lecture) : la page s'épure déjà.
  const apresAppel = ((ecran === "actions" || ecran === "analyse") && !!appel) || (ecran === "analyse" && !!a);
  useEffect(() => { onApresAppel?.(apresAppel); }, [apresAppel]);
  useEffect(() => () => onApresAppel?.(false), []);
  // Sous le nom : la personne jointe (sa fonction), puis la durée de l'appel.
  const sousTitreAppel = (() => {
    const ch = appel?.compris?.champs || {};
    const qui = (edits?.interlocuteur || "").trim() || ch.interlocuteur?.valeur || null;
    const fonction = ch.fonction?.valeur || null;
    const d = secondes > 0 ? (secondes < 60 ? `${secondes} s` : `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, "0")}`) : null;
    return [qui ? [qui, fonction ? String(fonction).toLowerCase() : null].filter(Boolean).join(", ") : null, d].filter(Boolean).join(" · ") || null;
  })();
  const enCoursSansIssue = enCours && ecran === "fiche" && !rappel && Date.now() - Date.parse(enCours.le) < 86400000 ? enCours : null;
  return (
    <div className={`w-full ${apresAppel ? "" : "pb-16"}`}>
      {CARTES_OBJECTION && ecran === "appel" && carteObjection && <CarteObjection carte={carteObjection} onFermer={() => setCarteObjection(null)} />}
      {/* La ville dans un menu déroulant (15 nov. 2026, Jules) ; plus d'onglets de classeur. */}
      {!relances && !essaiSeul && !apresAppel && <div className="flex flex-wrap items-center gap-y-2">
        <ChoixVille villes={villes} valeur={onglet} onChoisir={choisir} essai={ESSAI} dues={relancesDues ? DUES : null} nbDues={nbDues} />
        {/* L'avancement de la ville, à côté de son nom : on le voit monter en appelant. */}
        {c && onglet !== ESSAI && onglet !== DUES && <span className="ml-3 text-[13px] tabular-nums text-ardoise max-md:hidden">{c.appelees} / {c.agences - c.mortes} agences · {c.fait_pourcent} %</span>}
        <span aria-hidden className="min-w-3 flex-1" />
        {entete && <span className="ml-3 flex-none self-center pb-1">{entete}</span>}
      </div>}

      {/* Tous les écrans, raisonnement et actions proposées compris, sur le fond des listes : la couleur de la barre choisie dans Compte, et ses points (9 oct. 2026). */}
      <div data-zone="listes" className="flex flex-col gap-3 pt-3">
        {(!relances && listes.isLoading) || ouvrir.isPending || (session && file.isLoading) ? <Chargement taille="grand" /> : null}
        {!relances && !listes.isLoading && !villes.length && onglet !== ESSAI && <p className="m-0 py-12 text-center text-[14px] text-brume">Aucune ville encore : lancez l'agent IA sur une ville, ou ouvrez l'onglet Essai.</p>}
        {relances && file.isError && <p className="m-0 py-12 text-center text-[14px] text-alerte">Cette relance n'a pas pu s'ouvrir : {file.error?.message || "erreur"}.</p>}

        {horsLigne > 0 && <p className="m-0 flex items-center gap-2 rounded-[12px] border border-ambre/40 px-4 py-2.5 text-[14px] text-ambre"><Loader2 className="h-3.5 w-3.5 animate-spin" />{pl(horsLigne, "envoi gardé", "envois gardés")} dans le téléphone : ils partent au retour du réseau.</p>}
        {enCoursSansIssue && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-ambre/40 px-4 py-3">
            <span className="text-[15px] text-ambre">Dernier appel sans issue : {enCoursSansIssue.agence.nom}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => { setRappel({ ...enCoursSansIssue.agence }); setNotes(false); setEcran("issue"); }} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Taper l'issue</button>
              <button type="button" onClick={() => retenirEnCours(null)} className="rounded-full border border-trait px-3.5 py-1.5 text-[13px] text-ardoise" style={{ background: "transparent" }}>Ignorer</button>
            </span>
          </div>
        )}

        {session && (c || relances) && (
          <>

            {session.essai && ecran === "fiche" && a && <ChoixScenario choisi={scenario} onJouer={(sc) => (sc.cle === LIBRE ? setScenario(LIBRE) : simuler(sc))} relancesDabord={essaiSeul} monday={mondayEssai} setMonday={setMondayEssai} />}
            {session.essai && ecran === "fiche" && !a && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="m-0 text-[14px] text-craie">Les agences d'essai sont toutes appelées.</p>
                <button type="button" onClick={() => choisir(ESSAI)} className="h-8 max-md:h-10 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Recommencer l'essai</button>
              </div>
            )}
            {message && <p className="m-0 flex items-start gap-2.5 px-1 text-[14px] text-ardoise"><span className="text-menthe">✓</span><span className="min-w-0 break-words">{message}</span></p>}

            {/* Chaque écran entre en fondu, avec une légère montée (8 oct. 2026) : la clé change, l'animation rejoue. */}
            <div key={ecran === "analyse" && appel ? "actions" : ecran} className="flex flex-col gap-4 duration-500 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
            {/* La fiche et le panneau d'appel. */}
            {ecran === "fiche" && !a && !relances && !session.essai && <p className="m-0 py-12 text-center text-[14px] text-craie">Plus personne à appeler ici pour l'instant.</p>}
            {ecran === "fiche" && a && (
              <FicheAppel a={aCarte} siteLe={equipe.data?.site_le || null} relances={relances} recherches={recherches} essai={!!session.essai && scenario !== LIBRE}
                choisi={contactChoisi} onChoisir={setChoisi}
                onMicro={micro} onSansNotes={() => { setNotes(false); setEcran("issue"); }}
                onResume={analyserResume} resumeEnCours={noter.isPending}
                passerOuvert={passerOuvert} setPasserOuvert={setPasserOuvert} raisons={file.data?.raisons_passer} onPasser={(k) => (rappel ? suivante() : passer.mutate(k))} passerEnCours={passer.isPending}
                onRetour={relances ? () => onRetour?.() : null}
                onSansConversation={session.essai && scenario !== LIBRE ? null : sansConversation} />
            )}

            {/* Pendant l'appel et la note d'après (21 oct. 2026, Jules) : la fiche de la liste, à l'identique, en ligne. */}
            {ecran === "appel" && a && (
              <FicheAppel a={a} relances={relances} recherches={recherches} essai={!!session.essai && scenario !== LIBRE}
                choisi={contactChoisi} onChoisir={setChoisi}
                enLigne={{
                  ecoute: notes, essai: simule,
                  onRaccrocher: raccrocher, onAnnuler: annulerAppel,
                  ecranEnregistre: !simule && moi?.role === "admin",
                  duree: secondes,
                  milieu: <TranscriptionParVoix lignes={lignesVoix.lignes} enCours={lignesVoix.enCours} nomAutre={nomAutre}
                    onCorriger={(cles, qui) => setVoixCorrigees((c) => ({ ...c, ...Object.fromEntries(cles.map((k) => [k, qui])) }))}
                    notes={notes} rates={direct.filter((x) => x.etat === "echec").length} voix={voix} />,
                  droite: (
                    <>
                      {/* Les notes au-dessus de la calculatrice (22 oct. 2026, Jules). */}
                      <ZoneNotes valeur={notesAppel} onChange={setNotesAppel} nu rows={11} />
                      {/* En temps réel, le texte vient du flux, pas des morceaux (16 nov. 2026, Jules : « la calculatrice quand on parle de prix »). */}
                      {/* Le lieu à côté de la calculatrice (17 nov. 2026, Jules) : la carte s'ouvre dès qu'une adresse est dite. */}
                      <CalculatriceEnLigne textes={[...lignesVoix.lignes.map((l) => l.texte), lignesVoix.enCours?.texte || "", notesAppel]}
                        avant={<LieuEnLigne textes={[...lignesVoix.lignes.map((l) => l.texte), notesAppel]} ville={String(a?.lieu || "").split(" · ")[0] || null} />} />
                    </>
                  ),
                  // Le pied de la carte (16 nov. 2026, maquette de Jules) : ce qui est enregistré, puis les issues sans conversation.
                  pied: (
                    <>
                      <span className="text-[13.5px] text-ardoise">
                        {[!notes ? "Sans enregistrement" : !simule && moi?.role === "admin" ? "Appel et écran enregistrés" : simule ? "Essai, rien n'est enregistré" : "Appel enregistré",
                          notes ? `${motsTranscrits} mot${motsTranscrits > 1 ? "s" : ""} transcrit${motsTranscrits > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
                      </span>
                      {ecran === "appel" && (
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span className="mr-1 text-[13.5px] text-ardoise">Pas de réponse ?</span>
                          <button type="button" onClick={pasDeReponse} disabled={noter.isPending} title="Personne n'a décroché : la relance se planifie, l'agence suivante arrive" className="h-9 max-md:h-10 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50" style={{ background: "transparent" }}>Rappeler plus tard</button>
                          <button type="button" onClick={messageLaisse} disabled={noter.isPending} title="Répondeur : le message est laissé, les actions proposées s'ouvrent" className="h-9 max-md:h-10 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50" style={{ background: "transparent" }}>Message laissé</button>
                        </span>
                      )}
                    </>
                  ),
                }} />
            )}

            {/* Au raccrochage : l'issue, tapée par l'analyste. */}
            {ecran === "issue" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-stretch gap-5">
                <CarteAgence a={a} recherches={[]} cahier={[]} />
                <div className="flex flex-col gap-3 rounded-[12px] border border-trait bg-transparent p-6">
                  <div className="flex items-baseline justify-between"><span className="text-[15px] text-encre">Appel terminé</span></div>
                  {notes ? <span className="text-[13px] text-menthe">✓ Notes enregistrées</span> : <span className="text-[13px] text-ardoise">Sans notes : l'issue suffit</span>}
                  {!rappel && <button type="button" onClick={rappeler} className="self-start p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>L'appel a coupé ? Rappeler</button>}
                  {surUnBien ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {ISSUES_BIEN.map(([k, l, simple]) => (
                        <button key={k} type="button" disabled={noter.isPending} onClick={() => choisirIssue(k, simple)}
                          className={k === "agent_prevenu" ? "col-span-2 h-8 max-md:h-[72px] rounded-full bg-menthe text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50" : bouton} style={k === "agent_prevenu" ? undefined : { background: "transparent" }}>{l}</button>
                      ))}
                    </div>
                  ) : (<>
                  <span className={`${etiquette} mt-3`}>Personne au bout du fil</span>
                  <div className="grid grid-cols-2 gap-2">
                    {ISSUES_NON_ABOUTIES.map(([k, l, simple]) => <button key={k} type="button" disabled={noter.isPending} onClick={() => choisirIssue(k, simple)} className={bouton} style={{ background: "transparent" }}>{l}</button>)}
                  </div>
                  <span className={`${etiquette} mt-3`}>On s'est parlé</span>
                  <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_de_murs", false)} className="h-8 max-md:h-[72px] rounded-full bg-menthe text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Pas de bien pour l'instant</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("a_des_murs", false)} className="h-8 max-md:h-14 rounded-full border border-menthe/60 text-[13.5px] text-menthe hover:bg-menthe/10 disabled:opacity-50" style={{ background: "transparent" }}>A un bien intéressant</button>
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_interesse", false)} className="h-8 max-md:h-14 rounded-full border border-trait text-[13.5px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>Pas intéressé</button>
                  </div>
                  </>)}
                  {noter.isPending && <p className="m-0 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Je note…</p>}
                </div>
              </div>
            )}

            {/* AK lit l'appel : sa chaîne de raisonnement, étape par étape, au moment où il la fait. */}
            {/* L'écran de raisonnement (9 oct. 2026) : le raisonnement seul, au milieu, sur le fond des listes ; pas de transcription. */}

            {/* Après l'appel (9 nov. 2026, Jules) : le vrai chat à gauche, les actions à droite ; il reste ouvert pendant que les actions se refont. */}
            {/* Dès le raccrochage (15 nov. 2026, Jules) : le chat, titré de l'appel ; la lecture s'y déroule, étapes et balayage
                dans le message de l'assistant, avant même que l'appel soit noté ; puis les actions prennent sa place. */}
            {((ecran === "actions" && appel) || ecran === "analyse") && a && (
              <EcranApresAppel key={a.id} appel={appel} personneAppel={personneAppel} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} edits={edits} setEdits={setEdits} voirTranscription={voirTranscription} enRelecture={ecran === "analyse"}
                annonce={annonce} onRefaire={refaireActions} onLancer={() => setLancement((n) => n + 1)}
                titre={nomLisible(a.nom)} sousTitre={sousTitreAppel} onTranscription={() => setVoirTranscription((x) => !x)}
                transcription={<div className="flex flex-col gap-4"><ChaineRepliee etapes={etapesFinies} /><PanneauTranscription direct={direct} notes={!appel?.sans_details} fin={null} nu /></div>}>
                {ecran === "analyse" || !appel ? <ChaineEtapes etapes={chaine.etapes} nu /> : (
                  <SequenceActions appel={appel} agence={a} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                    relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
                    edits={edits} setEdits={setEdits} lancement={lancement} onLancementRefuse={(contenu) => setAnnonce({ id: Date.now(), contenu })} onChangerIssue={changerIssue} changementEnCours={noter.isPending} issuesEnPlus={surUnBien ? { agent_prevenu: "Agent prévenu" } : null}
                    onLancer={(o) => { depuisFenetre.current = !!o?.depuisFenetre; etapesVues.current = o?.vues || []; valider.mutate(); }} envoi={valider.isPending}
                    envoiFenetre={recu ? { recu: r, annulerDans, onAnnuler: () => annuler.mutate(), annulation: annuler.isPending, onBrouillon: () => ouvrirBrouillon(appel.id, r?.mail?.mailto), onChoisirLigne: (choix) => ligne.mutate({ id: appel.id, choix }) } : null}
                    onQuitterEnvoi={() => { depuisFenetre.current = false; setEcran("recu"); }} />
                )}
              </EcranApresAppel>
            )}

            {/* Le reçu : chaque coche est une relecture. Dix secondes pour annuler. */}
            {ecran === "recu" && r && (
              <div className="flex w-full max-w-[620px] flex-col gap-3.5 self-center rounded-[12px] border border-trait bg-transparent p-4">
                <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                  <LigneRecu l={r.monday ? { ...r.monday, texte: r.monday.etat === "ok" ? `Twenty CRM : ${r.monday.texte}` : r.monday.texte } : null} lien={r.monday?.etat === "ok" ? r.monday.lien : null}>
                    {r.monday?.etat === "doute" && <ChoixLigne candidates={r.monday.candidates || []} occupe={ligne.isPending} onChoisir={(choix) => ligne.mutate({ id: appel.id, choix })} />}
                  </LigneRecu>
                  <LigneRecu l={r.mail} detail={r.mail?.detail || null}>
                    {r.mail?.etat === "brouillon" && <button type="button" onClick={() => ouvrirBrouillon(appel.id, r.mail.mailto)} className="ml-7 mt-2 rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Ouvrir le brouillon</button>}
                  </LigneRecu>
                  <LigneRecu l={r.diffusion} />
                  <LigneRecu l={r.relance} />
                  {(r.extras || []).map((x, i) => <LigneRecu key={i} l={x} />)}
                </ul>
                <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-trait pt-4">
                  {annulerDans > 0 ? <button type="button" onClick={() => annuler.mutate()} disabled={annuler.isPending} className="rounded-full border border-trait px-[18px] py-2.5 text-[14px] text-encre hover:bg-surface disabled:opacity-50" style={{ background: "transparent" }}>{annuler.isPending ? "Annulation…" : `Annuler · ${annulerDans} s`}</button> : <span />}
                  {relances ? (
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <button type="button" onClick={() => { clearInterval(compte.current); onRetour?.(); }} className="h-8 max-md:h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Retour à la liste</button>
                      <button type="button" onClick={() => { clearInterval(compte.current); onSuivante?.(); }} className="h-8 max-md:h-10 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Relance suivante</button>
                    </span>
                  ) : <button type="button" onClick={() => { clearInterval(compte.current); suivante(); }} className="p-0 text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Agence suivante →</button>}
                </div>
              </div>
            )}

            {/* Tout est envoyé : la ligne fait le tour du texte en cinq secondes, puis on passe à la suivante. */}
            {ecran === "prepare" && <ToutPrepare phrase={phrasePrepare} lignes={lignesPrepare} onSuivant={apresPrepare} />}

            {/* Relances : l'issue est notée (sans réponse, hors ligne) ; on enchaîne ou on revient à la liste. */}
            {ecran === "fait" && relances && (
              <div className="flex w-full max-w-[620px] flex-col gap-5 self-center rounded-[12px] border border-trait bg-transparent p-4">
                <p className="m-0 flex items-start gap-3 text-[16px] leading-[1.45] text-encre"><span className="text-menthe">✓</span><span className="min-w-0 break-words">{fait}</span></p>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-trait pt-4">
                  <button type="button" onClick={() => onRetour?.()} className="h-8 max-md:h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Retour à la liste</button>
                  <button type="button" onClick={() => onSuivante?.()} className="h-8 max-md:h-10 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Relance suivante</button>
                </div>
              </div>
            )}

            {/* La fin de session. */}
            {ecran === "fin" && recap.data && (
              <div className="flex flex-col gap-[18px] rounded-[12px] border border-trait bg-transparent p-4">
                <p className="m-0 text-[26px] text-encre">Session {recap.data.ville} · {duree(session.debut, horloge)}</p>
                <p className="m-0 text-[16px] leading-[1.7] text-craie">
                  {pl(recap.data.appels, "appel")} · {recap.data.par_issue?.pas_de_reponse ?? 0} sans réponse · {recap.data.par_issue?.repondeur ?? 0} répondeur · {recap.data.pas_de_bien} pas de bien pour l'instant · {recap.data.a_un_bien} avec un bien · {recap.data.pas_interesses} pas intéressé{recap.data.pas_interesses > 1 ? "s" : ""}<br />
                  {pl(recap.data.mails_envoyes, "mail envoyé", "mails envoyés")} · {pl(recap.data.diffusion, "ajout à la liste", "ajouts à la liste")} · {pl(recap.data.relances, "relance planifiée", "relances planifiées")}
                </p>
                {recap.data.progression && (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-[15px] text-encre">{recap.data.progression.texte}</p>
                    <span className="h-[5px] overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full bg-menthe" style={{ width: `${recap.data.progression.agences ? Math.round((recap.data.progression.contactees / recap.data.progression.agences) * 100) : 0}%` }} /></span>
                  </div>
                )}
                {(recap.data.echecs || []).map((x) => (
                  <div key={`${x.appel_id}-${x.quoi}`} className="flex flex-col gap-2 rounded-[12px] border border-ambre/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-[15px] text-ambre">{x.texte}</span>
                      {x.quoi === "mail" && <button type="button" onClick={() => renvoyer.mutate(x.appel_id)} disabled={renvoyer.isPending} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre disabled:opacity-50" style={{ background: "transparent" }}>Renvoyer</button>}
                      {x.quoi === "brouillon" && <button type="button" onClick={() => ouvrirBrouillon(x.appel_id, x.mailto)} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Ouvrir le brouillon</button>}
                      {x.quoi === "monday" && <button type="button" onClick={() => reessayer.mutate(x.appel_id)} disabled={reessayer.isPending} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre disabled:opacity-50" style={{ background: "transparent" }}>{reessayer.isPending ? "…" : "Réessayer"}</button>}
                    </div>
                    {x.quoi === "monday_ligne" && <ChoixLigne candidates={x.candidates || []} occupe={ligne.isPending} onChoisir={(choix) => ligne.mutate({ id: x.appel_id, choix })} />}
                  </div>
                ))}
                <p className="m-0 flex gap-2.5 text-[15px] text-craie">
                  <span className={recap.data.monday_a_jour ? "text-menthe" : "text-ambre"}>{recap.data.monday_a_jour ? "✓" : "!"}</span>
                  {session.essai ? (mondayEssai ? "Essai : Twenty CRM écrit sur les lignes « (Essai) », aucun mail n'est parti." : "Essai : rien n'a été écrit dans Twenty CRM, aucun mail n'est parti.") : recap.data.monday_a_jour ? "Tout est à jour dans Twenty CRM" : `${pl(recap.data.monday_en_attente, "ligne Twenty CRM", "lignes Twenty CRM")} en attente : nouvel essai automatique`}
                </p>
                <button type="button" onClick={() => setEcran("fiche")} className="self-start rounded-full border border-trait px-[18px] py-2.5 text-[14px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Reprendre la session</button>
              </div>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
