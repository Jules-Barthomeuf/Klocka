import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { versWav } from "@/lib/dictee";
import { garder, enAttente, retirer, erreurReseau } from "@/lib/file-hors-ligne";
import SequenceActions from "@/components/prospection/SequenceActions";
import { ChaineEtapes, ChaineRepliee, useEtapesVives } from "@/components/prospection/ChaineEtapes";

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
const etiquette = "m-0 text-[12px] tracking-[.14em] text-ardoise";
const bouton = "rounded-full border border-trait px-4 py-3 text-[15px] text-encre transition-colors hover:bg-relief disabled:opacity-50";
const nouvelleCle = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const lireLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const poserLocal = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };

// Une conversation d'exemple pour l'appel simulé : AK la lit comme un vrai appel.
const EXEMPLE = "Bonjour, Madame Sophie Essai à l'appareil, je suis la gérante. Pour l'instant je n'ai rien en murs commerciaux, mais j'aurai peut-être un bien dans un mois, une boulangerie louée en centre-ville. Mon adresse c'est sophie@agence-essai.fr. Rappelez-moi jeudi prochain si vous voulez.";
const ISSUES_NON_ABOUTIES = [["pas_de_reponse", "Pas de réponse"], ["repondeur", "Répondeur, message laissé"]];
const CHAMPS_COMPRIS = [["interlocuteur", "Interlocuteur"], ["fonction", "Fonction"], ["telephone", "Téléphone"], ["email", "Email"], ["biens", "Biens évoqués"], ["mandat", "Mandat à venir"], ["prochaine_etape", "Prochaine étape"], ["date", "Date dite"]];
const MODIFIABLES = ["interlocuteur", "telephone", "email"];
const ISSUES_TOUTES = { pas_de_reponse: "Pas de réponse", repondeur: "Répondeur, message laissé", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien intéressant", pas_interesse: "Pas intéressé" };
// Relances « Bien retenu » et « Bien refusé » : les quatre issues de la spec du 8 oct. 2026.
const ISSUES_BIEN = [["agent_prevenu", "Agent prévenu", true], ["pas_de_reponse", "Pas de réponse", true], ["a_des_murs", "A un autre bien", false], ["pas_interesse", "Pas intéressé", false]];
const RELANCES = "relances";
const MINUTE = 60_000;
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

/** Relances : pourquoi on rappelle, l'agent, le dernier échange, le bien en cours, l'historique replié. */
function PourquoiRelance({ a }) {
  const [histo, setHisto] = useState(false);
  const r = a.relance;
  const etiq = "text-[11px] tracking-[.16em] text-brume";
  const bien = r.bien;
  const verdict = bien?.verdict === "retenu" ? "Retenu" : bien?.verdict === "refuse" ? "Refusé" : bien?.recue ? "En cours d'analyse" : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-[14px] border border-ambre/40 px-4 py-3.5">
        <span className="text-[12.5px] text-ambre">{r.motif.libelle}</span>
        <span className="text-[17px] leading-[1.45] text-encre [text-wrap:pretty]">{r.phrase}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={etiq}>L'AGENT</span>
        <span className="text-[15px] text-encre">{[r.agent, a.nom].filter(Boolean).join(" · ")}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-craie">
          {a.lieu && <span>{a.lieu}</span>}
          {a.telephone && <a href={telLien(a.telephone)} className="tabular-nums text-menthe hover:underline">{a.telephone}</a>}
          {a.email && <a href={`mailto:${a.email}`} className="break-all text-craie hover:text-encre">{a.email}</a>}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={etiq}>DERNIER ÉCHANGE</span>
        {r.dernier ? (
          <>
            <span className="text-[12.5px] text-ardoise">{[jourCourt(r.dernier.le), r.dernier.par, r.dernier.monday ? "Monday" : null, r.dernier.issue].filter(Boolean).join(" · ")}</span>
            {r.dernier.resume && <span className="line-clamp-2 text-[14.5px] leading-[1.5] text-craie">{r.dernier.resume}</span>}
          </>
        ) : <span className="text-[13.5px] text-brume">Aucun échange noté</span>}
      </div>
      {bien && (
        <div className="flex flex-col gap-1">
          <span className={etiq}>LE BIEN EN COURS</span>
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

/** La transcription : en direct pendant l'appel, puis relue à côté des actions. Jamais gardée sur le serveur. */
function PanneauTranscription({ direct, notes, fin, enDirect = false, replie = false }) {
  const [ouvert, setOuvert] = useState(!replie);
  const textes = direct.filter((x) => x.texte);
  const enCours = direct.some((x) => x.etat === "envoi");
  const rates = direct.filter((x) => x.etat === "echec").length;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-trait bg-transparent p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="m-0 text-[12px] tracking-[.14em] text-ardoise">{enDirect ? "TRANSCRIPTION EN DIRECT" : "TRANSCRIPTION"}</span>
        {replie ? <button type="button" onClick={() => setOuvert((x) => !x)} className="p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{ouvert ? "Replier" : "Afficher"}</button>
          : enCours && <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />}
      </div>
      {ouvert && (
        <div className={`flex flex-col gap-2 overflow-y-auto pr-1 text-[15px] leading-[1.55] text-encre ${replie ? "max-h-[260px]" : "max-h-[420px]"}`}>
          {!textes.length && <p className="m-0 text-[14px] text-brume">{!notes ? "Appel sans notes : rien n'est transcrit." : enDirect ? "La transcription apparaît ici, quelques secondes après chaque phrase." : "Rien n'a été entendu."}</p>}
          {textes.map((x) => <p key={x.i} className="m-0 [text-wrap:pretty]">{x.texte}</p>)}
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
      <div className="relative flex flex-col gap-5 rounded-[28px] border border-trait bg-transparent p-7 max-md:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-[7px] px-2.5 py-1 text-[13px] ${a.badge === "Jamais contactée" ? "bg-menthe/15 text-menthe" : "bg-ambre/15 text-ambre"}`}>{a.badge || a.statut?.libelle}</span>
          <span className="min-w-0 truncate text-[14px] text-ardoise">{a.lieu}</span>
        </div>
        <p className="m-0 break-words text-[32px] leading-[1.15] tracking-[-0.02em] text-encre [text-wrap:balance] max-md:text-[26px]">{a.nom}</p>
        {a.interlocuteurs?.[0] && <p className="m-0 text-[16px] text-craie">{a.interlocuteurs[0]}</p>}
        {a.reseau && <p className="m-0 rounded-[14px] border border-ambre/40 px-3.5 py-2.5 text-[14px] leading-[1.45] text-ambre">{a.reseau}</p>}
        <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
          {a.raison && <span className="text-[15px] leading-[1.5] text-ambre">{a.raison}</span>}
          {(a.historique?.length ? a.historique : ["Aucun appel"]).map((h) => <span key={h} className="text-[14px] text-ardoise">{h}</span>)}
        </div>
        {cahier?.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
            <span className={etiquette}>CAHIER DES CHARGES</span>
            {cahier.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
        {recherches?.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-trait pt-4">
            <span className={etiquette}>RECHERCHES DE CLIENTS</span>
            {recherches.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Les notes de l'appel, sous la transcription : ce que le micro capte mal. Elles l'emportent sur ce qu'AK a entendu. */
function ZoneNotes({ valeur, onChange }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 rounded-[20px] border border-trait bg-transparent p-6 max-md:p-5">
      <span className="m-0 text-[12px] tracking-[.14em] text-ardoise">NOTES</span>
      <textarea value={valeur} onChange={(e) => onChange(e.target.value)} rows={3}
        placeholder="Email, numéro, nom, date : ce qui compte et que le micro capte mal. Les notes l'emportent sur la transcription."
        className="w-full resize-y rounded-champ border border-trait bg-fond px-3.5 py-3 text-[15px] leading-[1.5] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
    </label>
  );
}

/** Le micro : il appelle et prend les notes. */
function IconeMicro({ taille = 34 }) {
  return (
    <svg width={taille * 0.76} height={taille} viewBox="0 0 22 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="6" y="1" width="10" height="16" rx="5" /><path d="M2 13a9 9 0 0 0 18 0" /><line x1="11" y1="22" x2="11" y2="27" />
    </svg>
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

function FicheAppel({ a, relances, recherches, essai, choisi, onChoisir, onMicro, onSansNotes, passerOuvert, setPasserOuvert, raisons, onPasser, passerEnCours, onRetour = null }) {
  const contacts = (a.contacts || []).filter((x) => !x.standard);
  const standard = (a.contacts || []).find((x) => x.standard)?.telephone || a.telephone;
  const numero = choisi?.telephone || standard;
  const personne = choisi && !choisi.standard ? choisi : null;
  const histo = a.historique_detail || [];
  const etiq = "text-[11px] tracking-[.16em] text-brume";
  const relance = !!a.relance || /relance|tentative/i.test(a.badge || "");
  // L'accroche (ou, en relance, ce qu'on s'est dit) : sous la fiche à l'ordinateur, sous le micro au téléphone.
  const suite = (
    <>
        {relances ? (
        // En relance : ce qui s'est dit aux appels d'avant, pour rappeler en sachant où on en est.
        <div className="flex flex-col gap-3">
          <span className={etiq}>CE QU'ON S'EST DIT</span>
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
          <span className={etiq}>L'ACCROCHE</span>
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
  const ligne = "grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] items-baseline gap-4 border-t border-trait py-3.5";
  return (
    <div className="grid overflow-hidden rounded-bloc border border-bord-doux bg-transparent lg:grid-cols-[minmax(210px,0.75fr)_minmax(0,1.9fr)_minmax(280px,1.15fr)]">
      {/* Les interlocuteurs et l'historique. */}
      <div className="flex min-w-0 flex-col gap-6 border-bord-doux p-6 max-lg:order-4 max-lg:border-t lg:border-r">
        <div className="flex flex-col gap-1.5">
          <span className={`${etiq} px-3`}>INTERLOCUTEURS</span>
          {contacts.map((x) => {
            const actif = choisi?.id === x.id;
            return (
              <button key={x.id} type="button" onClick={() => onChoisir(x.id)} aria-pressed={actif}
                className={`flex flex-col items-start gap-0.5 rounded-champ px-3 py-2.5 text-left transition-colors ${actif ? "bg-menthe/10" : "hover:bg-relief"}`} style={actif ? undefined : { background: "transparent" }}>
                <span className="break-words text-[15px] text-encre">{x.nom}</span>
                <span className={`text-[12.5px] ${actif ? "text-menthe" : "text-ardoise"}`}>{x.source}</span>
              </button>
            );
          })}
          {!contacts.length && <span className="px-3 pt-1 text-[13.5px] leading-[1.5] text-brume">Personne de connu : demandez le responsable commerce.</span>}
        </div>
        <div className="flex flex-col gap-1">
          <span className={`${etiq} px-3`}>HISTORIQUE</span>
          {histo.map((h, k) => (
            <div key={k} className="flex gap-3 px-3 py-2">
              <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-bord-vif" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] text-encre">{h.quoi}</span>
                <span className="text-[12.5px] text-ardoise">{[h.quand, h.qui].filter(Boolean).join(" · ")}</span>
              </span>
            </div>
          ))}
          {!histo.length && <span className="px-3 pt-1 text-[13.5px] text-brume">Jamais appelée</span>}
        </div>
      </div>

      {/* La fiche. */}
      <div className="flex min-w-0 flex-col gap-6 border-bord-doux p-7 max-lg:order-1 max-md:p-5 lg:border-r">
        <div className="flex flex-col gap-3">
          <span className={etiq}>{relances ? "RELANCES" : "TABLEAU PROSPECTION"} · {String(a.ville || "").toUpperCase()}</span>
          <p className="m-0 break-words text-[clamp(24px,2.2vw,32px)] font-normal leading-[1.15] tracking-[-0.02em] text-encre [text-wrap:balance]">{nomLisible(a.nom)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] ${relance ? "bg-ambre/15 text-ambre" : "bg-menthe/15 text-menthe"}`}>{a.badge || a.statut?.libelle}</span>
            {a.secteur && <span className="text-[13.5px] text-ardoise">{a.secteur}</span>}
          </div>
        </div>
        <div className="flex flex-col border-b border-trait">
          <div className={ligne}>
            <span className="text-[13.5px] text-ardoise">Interlocuteur</span>
            <span className={`break-words text-[15px] ${personne ? "text-encre" : "text-brume"}`}>{personne?.nom || "Non connu"}</span>
          </div>
          {personne?.fonction && (
            <div className={ligne}>
              <span className="text-[13.5px] text-ardoise">Fonction</span>
              <span className="text-[15px] text-encre">{personne.fonction}</span>
            </div>
          )}
        </div>
        {(a.raison || a.reseau) && (
          <div className="flex flex-col gap-1.5">
            {a.raison && <span className="text-[13.5px] leading-[1.5] text-ambre">{a.raison}</span>}
            {a.reseau && <span className="text-[13.5px] leading-[1.5] text-ambre">{a.reseau}</span>}
          </div>
        )}
        {a.relance ? <PourquoiRelance a={a} /> : <div className="max-lg:hidden">{suite}</div>}
      </div>

      {/* Le micro et le numéro. */}
      <div className="flex min-w-0 flex-col p-6 max-lg:order-2 max-lg:border-t max-lg:border-bord-doux max-md:p-5">
        <div className="flex items-center justify-between gap-3">
          <span />
          {/* En relances, on quitte sans appeler : la ligne se libère pour les autres. */}
          {onRetour
            ? <button type="button" onClick={onRetour} className="h-9 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Retour à la liste</button>
            : <button type="button" onClick={() => setPasserOuvert((x) => !x)} className="h-9 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Passer</button>}
        </div>
        {passerOuvert && !onRetour && (
          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            {Object.entries(raisons || { fermee: "Fermée", pas_pertinente: "Pas pertinente", plus_tard: "Plus tard" }).map(([k, l]) => (
              <button key={k} type="button" disabled={passerEnCours} onClick={() => onPasser(k)} className="h-8 rounded-full border border-trait px-3 text-[13px] text-encre hover:border-menthe disabled:opacity-50" style={{ background: "transparent" }}>{l}</button>
            ))}
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 max-md:py-8">
          <button type="button" onClick={onMicro} aria-label="Enregistrer l'appel" title="Enregistrer quand l'agent décroche"
            className="group grid h-[220px] w-[220px] place-items-center rounded-full border border-menthe/20 max-md:h-[184px] max-md:w-[184px]" style={{ background: "transparent" }}>
            <span className="grid h-[78%] w-[78%] place-items-center rounded-full border border-menthe/30">
              <span className="grid h-[74%] w-[74%] place-items-center rounded-full bg-menthe text-sur-menthe transition-transform group-hover:scale-[1.04]"><IconeMicro taille={38} /></span>
            </span>
          </button>
          <span className="max-w-[260px] text-center text-[14px] leading-[1.5] text-ardoise">{essai ? "Touchez le micro pour simuler un appel" : "Composez ce numéro sur votre téléphone, puis enregistrez"}</span>
          {/* Pas de lien tel: (7 oct. 2026) : l'application n'est qu'un micro, on compose sur son téléphone. */}
          <span className="flex flex-col items-center gap-1.5">
            <span className="select-all whitespace-nowrap font-mono text-[26px] leading-none tracking-[.04em] text-encre tabular-nums max-md:text-[22px]">{numero || "—"}</span>
            <span className="text-[13px] text-brume">{personne ? `${personne.nom} · ${personne.telephone ? "sa ligne" : "par le standard"}` : "Standard"}</span>
          </span>
          {!essai && <button type="button" onClick={onSansNotes} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Appelé sans enregistrer ? Taper l'issue</button>}
        </div>
      </div>
      {!a.relance && <div className="border-t border-bord-doux p-5 max-lg:order-3 lg:hidden">{suite}</div>}
    </div>
  );
}

export default function ModeAppel({ relances = false, relance = null, onSuivante = null, onRetour = null }) {
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState(null);
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
  const [notesLues, setNotesLues] = useState(null);
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
  const directFin = useRef(null);
  const compte = useRef(null);
  const messageT = useRef(null);

  const [fait, setFait] = useState(null); // relances : ce qui vient d'être noté, avant « Relance suivante »
  const listes = useQuery({ queryKey: ["agent-ia-listes"], queryFn: () => base44.request("GET", "/api/prospection/agent-ia/listes"), enabled: !relances });
  const villes = relances ? [] : (listes.data?.listes || []).filter((l) => l.agences > 0);
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
    setOnglet(k); setEcran("fiche"); setPassees(new Set()); setPrise(null); setRappel(null);
    if (!sessions[k] || k === ESSAI) ouvrir.mutate(k);
  };
  useEffect(() => { if (!onglet && relances) choisir(RELANCES); else if (!onglet && villes.length) choisir(villes[0].id); }, [villes.length]);
  useEffect(() => { const t = setInterval(() => setHorloge(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => () => { clearInterval(chrono.current); clearInterval(compte.current); clearTimeout(messageT.current); rec.current?.flux?.getTracks().forEach((t) => t.stop()); }, []);

  const file = useQuery(relances
    ? { queryKey: ["relance-fiche", relance?.agence_id], queryFn: () => base44.request("GET", `/api/prospection/relances/fiche?agence=${relance.agence_id}`), enabled: !!session && !!relance?.agence_id }
    : { queryKey: ["mode-appel-file", session?.liste_id], queryFn: () => base44.request("GET", `${API}/file?liste=${session.liste_id}`), enabled: !!session?.liste_id, staleTime: 30_000 });
  const recap = useQuery({ queryKey: ["mode-appel-recap", session?.id], queryFn: () => base44.request("GET", `${API}/sessions/${session.id}`), enabled: !!session?.id, refetchInterval: ecran === "fin" ? 5000 : false });
  const agences = useMemo(() => (file.data?.file || []).filter((x) => relances || !passees.has(x.id)), [file.data, passees]);
  const a = rappel || agences[0] || null;
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
    clearTimeout(r0.minuterie);
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
    setSimule(false); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setCle(null); setPasserOuvert(false); setNotesAppel(""); setNotesLues(null);
    if (texte) dire(texte);
    queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
    queryClient.invalidateQueries({ queryKey: ["agent-ia-liste"] });
    queryClient.invalidateQueries({ queryKey: ["relances"] });
  };

  // Relances : une nouvelle ligne prise, l'écran repart de la fiche.
  useEffect(() => {
    if (!relances || !relance?.agence_id) return;
    arreterTout();
    setRappel(null); setEcran("fiche"); setPrise(null); setIssue(null); setAppel(null); setRecu(null); setEdits({}); setFait(null);
    setSimule(false); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setCle(null); setNotesAppel(""); setNotesLues(null);
  }, [relance?.agence_id]);
  // Relances : la ligne reste à moi tant que je m'en sers (j'ai bougé dans la dernière minute, ou l'appel est en cours).
  const activite = useRef(Date.now());
  const ecranRef = useRef(ecran);
  useEffect(() => { ecranRef.current = ecran; }, [ecran]);
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
  const contacts = a?.contacts || [];
  const contactChoisi = contacts.find((x) => x.id === choisi) || contacts.find((x) => !x.standard) || contacts[0] || null;
  const standard = contacts.find((x) => x.standard)?.telephone || a?.telephone || null;
  const numeroAppel = contactChoisi?.telephone || standard;
  // Les autres numéros de l'agence (interlocuteurs, standard, agents), sans celui qu'on appelle.
  const autresNumeros = [...contacts.filter((x) => x.telephone).map((x) => ({ nom: x.nom, telephone: x.telephone })), ...(a?.autres_numeros || []).map((t) => ({ nom: "", telephone: t }))]
    .filter((x, k, t) => x.telephone && telLien(x.telephone) !== telLien(numeroAppel || "") && t.findIndex((y) => telLien(y.telephone) === telLien(x.telephone)) === k).slice(0, 4);

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
  const montrer = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat })));
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
  // Enregistre par morceaux de huit secondes, chacun lisible seul, transcrit pendant que l'appel continue.
  const enregistrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      setNotes(false); dire("Micro indisponible ou pris par l'appel : appel sans notes, vous taperez l'issue.");
      return;
    }
    const r0 = { flux, actif: true, jeter: false, m: null, minuterie: null };
    rec.current = r0;
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (e) => { if (e.data?.size) bouts.push(e.data); };
      m.onstop = async () => {
        const encore = r0.actif;
        if (encore) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (r0.jeter || !bouts.length) return;
        const x = { i: morceaux.current.length, texte: null, wav: null, etat: "envoi" };
        morceaux.current.push(x); montrer();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrer(); return; }
        transcrireMorceau(x);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, 8000);
    };
    tour();
  };
  // Attend la fin des morceaux en cours (au plus vingt secondes), puis réessaie une fois ceux qui ont raté.
  const morceauxPrets = async () => {
    const t0 = Date.now();
    while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
    await Promise.all(morceaux.current.filter((x) => x.etat === "echec" && x.wav).map(transcrireMorceau));
  };
  useEffect(() => { directFin.current?.scrollIntoView({ block: "nearest" }); }, [direct.length, direct.filter((x) => x.texte).length]);
  const retenirEnCours = (x) => { poserLocal(CLE_EN_COURS, x); setEnCours(x); };
  const micro = () => {
    if (session?.essai) { simuler(); return; }
    if (!prise || prise.agence_id !== a.id) prendre.mutate(a.id);
    retenirEnCours({ agence: { id: a.id, nom: a.nom, telephone: numeroAppel, lieu: a.lieu, badge: a.badge, historique: a.historique, interlocuteurs: a.interlocuteurs }, onglet, le: new Date().toISOString() });
    setNotes(true); setSimule(false); setEcran("appel"); lancerChrono(); enregistrer();
  };
  // Au raccrochage : avec la transcription, AK lit l'appel et l'écran d'actions s'ouvre ; sans notes, l'issue se tape.
  const raccrocher = () => {
    clearInterval(chrono.current);
    couperMicro(false);
    if (!notes) { setEcran("issue"); return; }
    // Une courte transition (« Appel terminé ») avant la lecture, pendant qu'AK commence déjà à lire.
    setEcran("raccroche");
    setTimeout(() => setEcran((e) => (e === "raccroche" ? "analyse" : e)), 1100);
    noter.mutate({ issue: "auto" });
  };
  const annulerAppel = () => { arreterTout(); retenirEnCours(null); setNotes(true); setSimule(false); setEcran("fiche"); };
  const rappeler = () => { setEcran("appel"); lancerChrono(secondes); if (notes && !simule) enregistrer(); };
  // L'appel simulé : la conversation d'exemple défile phrase par phrase, comme une vraie transcription.
  const simuler = () => {
    if (!session?.essai) { setSimulerApres(true); choisir(ESSAI); return; }
    if (!a) return;
    prendre.mutate(a.id);
    morceaux.current = []; setDirect([]);
    setNotes(true); setSimule(true); setEcran("appel"); setSecondes(0);
    const phrases = EXEMPLE.split(/(?<=[.?!])\s+/);
    let n = 0;
    clearInterval(chrono.current);
    chrono.current = setInterval(() => {
      setSecondes((s0) => s0 + 4);
      if (n < phrases.length) { morceaux.current.push({ i: n, texte: phrases[n], etat: "ok" }); n += 1; montrer(); }
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
    const props = ap.propositions || [];
    setAppel(ap); setIssue(is); setCle(nouvelleCle());
    setCoches(new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
    const pm = props.find((p) => p.type === "mail");
    setMail(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele } : null);
    setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setEdits({});
    setEcran("actions");
  };
  const noter = useMutation({
    mutationFn: async ({ issue: is, simple = false, remplace = null }) => {
      const champs = { agence_id: a.id, agent_id: prise?.agence_id === a.id ? prise.agent_id : null, issue: is, session_id: session?.id || null, numero: numeroAppel || a.telephone || null, remplace, motif: a.relance?.motif?.cle || null, notes: notesAppel.trim() || null };
      setNotesLues(notesAppel);
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
      if (r.simple) return suivante(`${v.issue === "repondeur" ? "Message laissé" : v.issue === "agent_prevenu" ? "Agent prévenu" : "Pas de réponse"} · ${r.recu?.relance?.texte?.toLowerCase() || "relance planifiée"}`);
      ouvrirActions(r.appel, r.appel.issue_tapee || v.issue);
    },
    onError: (e) => { toast.error(e?.message || "L'appel n'a pas pu être lu"); setEcran(direct.length ? "appel" : "issue"); },
  });
  // Sans transcription (appel sans notes), l'issue se tape encore.
  const choisirIssue = (is, simple) => {
    setIssue(is);
    if (!simple) setEcran("analyse");
    noter.mutate({ issue: is, simple });
  };
  // AK s'est trompé d'issue : on la change, les actions se refont sur la même transcription.
  const changerIssue = (is) => { setEcran("analyse"); noter.mutate({ issue: is, remplace: appel.id }); };

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
    choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday, note: note.trim(), cle,
    session_id: session?.id || null, issue,
    corrections: faits.filter((f) => MODIFIABLES.includes(f.cle) && edits[f.cle] != null && edits[f.cle].trim() !== f.valeur).map((f) => ({ cle: f.cle, libelle: f.libelle, valeur: edits[f.cle].trim() })),
  });
  const valider = useMutation({
    mutationFn: async () => {
      const url = `${API}/appels/${appel.id}/valider`;
      const body = corpsValidation();
      try { return await base44.request("POST", url, { body }); } catch (e) {
        if (!erreurReseau(e)) throw e;
        await garder({ id: body.cle, genre: "valider", url, champs: body });
        setHorsLigne((n) => n + 1);
        return { hors_ligne: true };
      }
    },
    onSuccess: (r) => {
      if (r.hors_ligne) return suivante("Hors ligne : la validation est gardée et partira une seule fois au retour du réseau");
      setRecu(r.recu); setEcran("recu");
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
    enabled: ecran === "recu" && !!appel?.id,
    refetchInterval: 2500,
  });
  const r = recuFrais.data?.recu || recu;
  const aFaire = r && (r.mail?.etat === "brouillon" || r.monday?.etat === "doute");
  // Le mail part juste après les dix secondes : on attend de savoir s'il est retrouvé dans les envoyés.
  const mailEnRoute = r?.mail?.etat === "attente" && /part dans/.test(r.mail.texte || "");
  // Dix secondes, puis l'agence suivante ; un brouillon à ouvrir ou une ligne à choisir attendent un geste.
  useEffect(() => {
    if (relances || ecran !== "recu" || annulerDans > 0 || !r || aFaire || mailEnRoute || annuler.isPending) return;
    clearInterval(compte.current);
    const ok = [r.monday, r.mail, r.diffusion, r.relance].filter(Boolean);
    suivante(ok.map((x) => x.texte).join(" · "));
  }, [annulerDans, ecran, aFaire, mailEnRoute]);

  const ligne = useMutation({
    mutationFn: ({ id, choix }) => base44.request("POST", `${API}/appels/${id}/ligne-monday`, { body: { ligne_id: choix } }),
    onSuccess: (x) => { if (ecran === "recu") setRecu(x.recu); recap.refetch(); queryClient.invalidateQueries({ queryKey: ["mode-appel-recu"] }); },
    onError: (e) => toast.error(e?.message || "Monday n'a pas répondu"),
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
  const enCoursSansIssue = enCours && ecran === "fiche" && !rappel && Date.now() - Date.parse(enCours.le) < 86400000 ? enCours : null;
  return (
    <div className="w-full pb-16">
      {/* Les villes, en onglets de classeur : le même que les Listes (7 oct. 2026), l'intercalaire ouvert raccordé à la page à points. */}
      {!relances && <div role="tablist" aria-label="Les villes" className="flex items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span aria-hidden className="w-3 flex-none" />
        {villes.map((l, i) => {
          const actif = onglet === l.id;
          return (
            <React.Fragment key={l.id}>
              {i > 0 && <span aria-hidden className="w-1 flex-none" />}
              <button type="button" role="tab" aria-selected={actif} onClick={() => choisir(l.id)}
                className={`flex max-w-[240px] flex-none items-center gap-2 rounded-t-[10px] px-4 text-left text-[13px] transition-colors ${actif ? "bg-rail pb-[11px] pt-2.5 text-encre" : "bg-surface py-2 text-ardoise hover:bg-rail hover:text-encre"}`}>
                <span className="truncate">{l.ville}</span>
                <span className={`flex-none text-[11.5px] tabular-nums ${actif ? "text-menthe" : "text-brume"}`}>{l.agences_seules ?? l.agences}</span>
              </button>
            </React.Fragment>
          );
        })}
        {!relances && (
          <>
            {villes.length > 0 && <span aria-hidden className="w-1 flex-none" />}
            <button type="button" role="tab" aria-selected={onglet === ESSAI} onClick={() => choisir(ESSAI)}
              className={`flex flex-none items-center gap-2 rounded-t-[10px] border border-b-0 border-dashed border-bord-vif px-4 text-[13px] transition-colors ${onglet === ESSAI ? "bg-rail pb-[11px] pt-2.5 text-encre" : "py-2 text-ardoise hover:bg-rail hover:text-encre"}`}
              style={onglet === ESSAI ? undefined : { background: "transparent" }}>
              Essai
            </button>
          </>
        )}
        <span aria-hidden className="min-w-3 flex-1" />
      </div>}

      <div data-zone="listes" className={`k-points relative flex flex-col gap-4 bg-rail px-5 pb-5 pt-4 max-md:px-3 ${relances ? "rounded-[12px]" : "rounded-b-md rounded-t-[12px]"}`}>
        {(!relances && listes.isLoading) || ouvrir.isPending || (session && file.isLoading) ? <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : null}
        {!relances && !listes.isLoading && !villes.length && onglet !== ESSAI && <p className="m-0 py-12 text-center text-[14px] text-brume">Aucune ville encore : lancez l'agent IA sur une ville, ou ouvrez l'onglet Essai.</p>}
        {relances && file.isError && <p className="m-0 py-12 text-center text-[14px] text-alerte">Cette relance n'a pas pu s'ouvrir : {file.error?.message || "erreur"}.</p>}

        {horsLigne > 0 && <p className="m-0 flex items-center gap-2 rounded-[14px] border border-ambre/40 px-4 py-2.5 text-[14px] text-ambre"><Loader2 className="h-3.5 w-3.5 animate-spin" />{pl(horsLigne, "envoi gardé", "envois gardés")} dans le téléphone : ils partent au retour du réseau.</p>}
        {enCoursSansIssue && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ambre/40 px-4 py-3">
            <span className="text-[15px] text-ambre">Dernier appel sans issue : {enCoursSansIssue.agence.nom}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => { setRappel({ ...enCoursSansIssue.agence }); setNotes(false); setEcran("issue"); }} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Taper l'issue</button>
              <button type="button" onClick={() => retenirEnCours(null)} className="rounded-full border border-trait px-3.5 py-1.5 text-[13px] text-ardoise" style={{ background: "transparent" }}>Ignorer</button>
            </span>
          </div>
        )}

        {session && (c || relances) && (
          <>

            {session.essai && ecran === "fiche" && <p className="m-0 px-1 text-[13px] text-ardoise"><span className="text-menthe">Essai.</span> Agences fictives : rien n'est écrit dans Monday, aucun mail ne part, rien ne compte dans les statistiques.</p>}
            {message && <p className="m-0 flex items-start gap-2.5 px-1 text-[14px] text-ardoise"><span className="text-menthe">✓</span><span className="min-w-0 break-words">{message}</span></p>}

            {/* La fiche et le panneau d'appel. */}
            {ecran === "fiche" && !a && !relances && <p className="m-0 py-12 text-center text-[14px] text-craie">Plus personne à appeler ici pour l'instant.</p>}
            {ecran === "fiche" && a && (
              <FicheAppel a={a} relances={relances} recherches={recherches} essai={!!session.essai}
                choisi={contactChoisi} onChoisir={setChoisi}
                onMicro={micro} onSansNotes={() => { setNotes(false); setEcran("issue"); }}
                passerOuvert={passerOuvert} setPasserOuvert={setPasserOuvert} raisons={file.data?.raisons_passer} onPasser={(k) => (rappel ? suivante() : passer.mutate(k))} passerEnCours={passer.isPending}
                onRetour={relances ? () => onRetour?.() : null} />
            )}

            {/* Pendant l'appel : le micro qui écoute, la transcription en direct à droite. */}
            {ecran === "appel" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
                <div className="flex flex-col gap-[22px] rounded-[20px] border border-trait bg-transparent p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 break-words text-[22px] text-encre">{a.nom}</p>
                      <p className="m-0 mt-1 text-[14px] text-ardoise">{[contactChoisi && !contactChoisi.standard ? contactChoisi.nom : null, numeroAppel].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {/* Pas de chronomètre (7 oct. 2026, il stressait) : le micro qui pulse, « Je vous écoute ». */}
                  <div className="flex flex-col items-center gap-3 py-4">
                    {notes ? (
                      <span className="relative grid h-[104px] w-[104px] place-items-center">
                        <span className="absolute inset-0 rounded-full bg-menthe/30 motion-safe:animate-ping" style={{ animationDuration: "1.8s" }} />
                        <span className="relative grid h-[104px] w-[104px] place-items-center rounded-full bg-menthe text-sur-menthe"><IconeMicro /></span>
                      </span>
                    ) : (
                      <span className="grid h-[104px] w-[104px] place-items-center rounded-full border border-trait text-ardoise"><IconeMicro /></span>
                    )}
                    <span className={`text-[16px] ${notes ? "text-encre" : "text-ardoise"}`}>{notes ? "Je vous écoute" : "Je n'écoute pas"}</span>
                  </div>
                  <div className="flex gap-2.5">
                    {/* L'appel a coupé : on rappelle le même numéro, l'écoute continue. */}
                    <button type="button" onClick={() => dire(`Recomposez le ${numeroAppel || "numéro"} sur votre téléphone : l'écoute continue`)} className="flex-1 rounded-full border border-trait py-4 text-[15px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Rappeler</button>
                    <button type="button" onClick={raccrocher} className="flex-[2] rounded-full bg-alerte py-4 text-[16px] text-white hover:opacity-90">Raccrocher</button>
                    {/* Annuler : retour à la fiche, comme si l'agence n'avait pas été appelée (rien n'est noté, l'écoute s'efface). */}
                    <button type="button" onClick={annulerAppel} aria-label="Annuler l'appel" title="Annuler : revenir à la fiche, rien n'est noté"
                      className="grid h-14 w-14 flex-none place-items-center rounded-full border border-trait bg-black text-white hover:border-bord-vif"><X className="h-5 w-5" /></button>
                  </div>
                  {/* Les autres numéros trouvés et le site, pour rebondir si la ligne ne répond pas. */}
                  {(autresNumeros.length > 0 || a.site) && (
                    <div className="flex flex-col gap-2 border-t border-trait pt-4">
                      {autresNumeros.length > 0 && <span className={etiquette}>AUTRES NUMÉROS</span>}
                      {autresNumeros.map((x) => (
                        <span key={x.telephone} className="flex items-baseline justify-between gap-3 text-[15px]">
                          <span className="select-all font-mono tracking-[.04em] text-encre">{x.telephone}</span><span className="min-w-0 truncate text-[13px] text-ardoise">{x.nom}</span>
                        </span>
                      ))}
                      {a.site && <a href={/^https?:/.test(a.site) ? a.site : `https://${a.site}`} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 text-[15px] text-menthe hover:underline ${autresNumeros.length ? "mt-2" : ""}`}>{String(a.site).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")}<ExternalLink className="h-3.5 w-3.5" /></a>}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <PanneauTranscription direct={direct} notes={notes} fin={directFin} enDirect />
                  <ZoneNotes valeur={notesAppel} onChange={setNotesAppel} />
                </div>
              </div>
            )}

            {/* Au raccrochage : l'issue, tapée par l'analyste. */}
            {ecran === "issue" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-stretch gap-5">
                <CarteAgence a={a} recherches={[]} cahier={[]} />
                <div className="flex flex-col gap-3 rounded-[28px] border border-trait bg-transparent p-6">
                  <div className="flex items-baseline justify-between"><span className="text-[15px] text-encre">Appel terminé</span></div>
                  {notes ? <span className="text-[13px] text-menthe">✓ Notes enregistrées</span> : <span className="text-[13px] text-ardoise">Sans notes : l'issue suffit</span>}
                  {!rappel && <button type="button" onClick={rappeler} className="self-start p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>L'appel a coupé ? Rappeler</button>}
                  {surUnBien ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {ISSUES_BIEN.map(([k, l, simple]) => (
                        <button key={k} type="button" disabled={noter.isPending} onClick={() => choisirIssue(k, simple)}
                          className={k === "agent_prevenu" ? "col-span-2 h-[72px] rounded-full bg-menthe text-[18px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50" : bouton} style={k === "agent_prevenu" ? undefined : { background: "transparent" }}>{l}</button>
                      ))}
                    </div>
                  ) : (<>
                  <span className={`${etiquette} mt-3`}>PERSONNE AU BOUT DU FIL</span>
                  <div className="grid grid-cols-2 gap-2">
                    {ISSUES_NON_ABOUTIES.map(([k, l]) => <button key={k} type="button" disabled={noter.isPending} onClick={() => choisirIssue(k, true)} className={bouton} style={{ background: "transparent" }}>{l}</button>)}
                  </div>
                  <span className={`${etiquette} mt-3`}>ON S'EST PARLÉ</span>
                  <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_de_murs", false)} className="h-[72px] rounded-full bg-menthe text-[18px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Pas de bien pour l'instant</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("a_des_murs", false)} className="h-14 rounded-full border border-menthe/60 text-[15px] text-menthe hover:bg-menthe/10 disabled:opacity-50" style={{ background: "transparent" }}>A un bien intéressant</button>
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_interesse", false)} className="h-14 rounded-full border border-trait text-[15px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>Pas intéressé</button>
                  </div>
                  </>)}
                  {noter.isPending && <p className="m-0 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Je note…</p>}
                </div>
              </div>
            )}

            {ecran === "raccroche" && a && (
              <div className="flex flex-col items-center justify-center gap-5 rounded-[20px] border border-trait bg-transparent px-5 py-20 text-center duration-500 animate-in fade-in-0">
                <span className="grid h-[104px] w-[104px] place-items-center rounded-full bg-menthe text-sur-menthe duration-500 animate-in zoom-in-50"><Check className="h-10 w-10" strokeWidth={2.2} /></span>
                <p className="m-0 text-[22px] text-encre duration-700 animate-in fade-in-0 slide-in-from-bottom-2">Appel terminé</p>
                <p className="m-0 text-[14px] text-ardoise delay-300 duration-700 animate-in fade-in-0 fill-mode-both">{a.nom}</p>
              </div>
            )}
            {/* AK lit l'appel : sa chaîne de raisonnement, étape par étape, au moment où il la fait. */}
            {ecran === "analyse" && a && direct.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-3">
                <PanneauTranscription direct={direct} notes fin={directFin} />
                <ChaineEtapes etapes={chaine.etapes} />
              </div>
            )}
            {ecran === "analyse" && a && !direct.length && <ChaineEtapes etapes={chaine.etapes} titre={`AK lit l'appel · ${a.nom}`} />}

            {/* Ce qui a été compris, et les actions proposées. */}
            {ecran === "actions" && appel && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-3">
                <div className="flex min-w-0 flex-col gap-4">
                {/* « Ce qu'AK a compris » retiré (7 oct. 2026) : il doublait la fenêtre de Contact Monday. */}
                <ChaineRepliee etapes={etapesFinies} />
                <PanneauTranscription direct={direct} notes={!appel.sans_details} fin={null} />
                <ZoneNotes valeur={notesAppel} onChange={setNotesAppel} />
                {notesLues != null && notesAppel !== notesLues && (
                  <button type="button" onClick={() => changerIssue("auto")} disabled={noter.isPending} className="self-start rounded-full border border-trait px-4 py-2 text-[14px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Ré-analyser avec les notes</button>
                )}
                </div>
                <div className="min-w-0 max-md:order-first">
                  <SequenceActions appel={appel} agence={a} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                    relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
                    edits={edits} setEdits={setEdits} onChangerIssue={changerIssue} changementEnCours={noter.isPending} issuesEnPlus={surUnBien ? { agent_prevenu: "Agent prévenu" } : null}
                    onLancer={() => valider.mutate()} envoi={valider.isPending} />
                </div>
              </div>
            )}

            {/* Le reçu : chaque coche est une relecture. Dix secondes pour annuler. */}
            {ecran === "recu" && r && (
              <div className="flex w-full max-w-[620px] flex-col gap-3.5 self-center rounded-[20px] border border-trait bg-transparent p-7 max-md:p-5">
                <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                  <LigneRecu l={r.monday ? { ...r.monday, texte: r.monday.etat === "ok" ? `Monday : ${r.monday.texte}` : r.monday.texte } : null} lien={r.monday?.etat === "ok" ? r.monday.lien : null}>
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
                      <button type="button" onClick={() => { clearInterval(compte.current); onRetour?.(); }} className="h-10 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Retour à la liste</button>
                      <button type="button" onClick={() => { clearInterval(compte.current); onSuivante?.(); }} className="h-10 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">Relance suivante</button>
                    </span>
                  ) : <button type="button" onClick={() => { clearInterval(compte.current); suivante(); }} className="p-0 text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Agence suivante →</button>}
                </div>
              </div>
            )}

            {/* Relances : l'issue est notée (sans réponse, hors ligne) ; on enchaîne ou on revient à la liste. */}
            {ecran === "fait" && relances && (
              <div className="flex w-full max-w-[620px] flex-col gap-5 self-center rounded-[20px] border border-trait bg-transparent p-7 max-md:p-5">
                <p className="m-0 flex items-start gap-3 text-[16px] leading-[1.45] text-encre"><span className="text-menthe">✓</span><span className="min-w-0 break-words">{fait}</span></p>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-trait pt-4">
                  <button type="button" onClick={() => onRetour?.()} className="h-10 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Retour à la liste</button>
                  <button type="button" onClick={() => onSuivante?.()} className="h-10 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">Relance suivante</button>
                </div>
              </div>
            )}

            {/* La fin de session. */}
            {ecran === "fin" && recap.data && (
              <div className="flex flex-col gap-[18px] rounded-[20px] border border-trait bg-transparent p-7 max-md:p-5">
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
                  <div key={`${x.appel_id}-${x.quoi}`} className="flex flex-col gap-2 rounded-[14px] border border-ambre/40 px-4 py-3">
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
                  {session.essai ? "Essai : rien n'a été écrit dans Monday, aucun mail n'est parti." : recap.data.monday_a_jour ? "Tout est à jour dans Monday" : `${pl(recap.data.monday_en_attente, "ligne Monday", "lignes Monday")} en attente : nouvel essai automatique`}
                </p>
                <button type="button" onClick={() => setEcran("fiche")} className="self-start rounded-full border border-trait px-[18px] py-2.5 text-[14px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Reprendre la session</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
