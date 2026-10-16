import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import LecteurEcran from "@/components/monitoring/LecteurEcran";
import { useAuth } from "@/lib/AuthContext";
import { TempsPostAppel, TempsEtAppels, AppelsParJour, BarresHorizontales, Chiffre, CarteSemaine, ClassementAnalystes, CourbesAnalystes, Cumul, Cadre, DureeParJour, Durees, ParHeure, PetitsMultiples, TauxJoints, useCouleurs } from "@/components/monitoring/GraphesAppels";

// Le Suivi des appels (9 oct. 2026) : l'usage de chacun en Prospection, en
// Relances et au Rappel, pour voir qui appelle, combien, comment, et faire en
// sorte que l'outil serve de plus en plus. L'équipe d'abord, puis chaque
// analyste, la courbe par jour, les heures, les issues, et le journal de
// chaque appel (résumé, phrases exactes, ce qui a été compris, notes,
// validation, corrections d'AK, reçu).

// « Aujourd'hui » (14 oct. 2026, Jules) : la journée en cours, depuis minuit.
const PERIODES = [[1, "Aujourd'hui"], [7, "7 jours"], [30, "30 jours"], [90, "90 jours"]];
const VUES = [["ensemble", "Vue d'ensemble"], ["analystes", "Par analyste"], ["moi", "Mes appels"], ["journal", "Journal des appels"]];
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const filtre = (actif) => `px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${actif ? "border-menthe text-menthe bg-menthe/[0.1]" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`;
const dureeLisible = (s) => (s == null ? "—" : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);
const p100 = (v) => (v == null ? "—" : `${v} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const SOURCES = { prospection: "Prospection", relances: "Relances", rappel: "Rappel", essai: "Essai", carnet: "Ancien carnet" };


// Les colonnes du tableau par analyste : [clé, titre, mise en forme].
const COLONNES = [
  ["appels", "Appels", (v) => v],
  ["par_jour_actif", "Par jour actif", (v) => v ?? "—"],
  ["joints_pct", "Joints", p100],
  ["enregistres_pct", "Enregistrés", p100],
  ["notes_pct", "Avec notes", p100],
  ["duree_moyenne_s", "Durée moy.", dureeLisible],
  ["duree_totale_s", "Au téléphone", dureeLisible],
  ["temps_mode_appel_s", "En mode appel", dureeLisible],
  ["valides", "Validés", (v) => v],
  ["oublies", "Non validés", (v) => v],
  ["fenetre_pct", "Validés depuis la fenêtre", p100],
  ["etapes_vues_pct", "Étapes ouvertes", p100],
  ["sans_correction_pct", "Sans correction AK", p100],
  ["issue_changee", "Issue changée", (v) => v],
  ["annulations", "Annulations", (v) => v],
  ["mails_partis", "Mails partis", (v) => v],
  ["biens", "Biens", (v) => v],
  ["nouvelles_agences", "Agences appelées", (v) => v],
  ["envoyees_en_relance", "Envoyées en relance", (v) => v],
  ["dernier", "Dernier appel", quand],
];

/** « 42 s », « 2 min 05 ». */
const secondesLisibles = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`; };

function DetailAppel({ x, modifiable = true }) {
  // Validé ou non, à la main (13 oct. 2026, Jules) : seul l'état change, rien n'est envoyé ni écrit ailleurs.
  const queryClient = useQueryClient();
  const marquer = useMutation({
    mutationFn: (valide) => base44.request("POST", `/api/monitoring/appels/${x.id}/validation`, { body: { valide } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suivi-appels"] }),
  });
  const valide = x.etat === "valide";
  const ligne = "grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-4 border-t border-trait py-2.5 text-[13px] max-md:grid-cols-1 max-md:gap-1";
  const v = x.validation;
  const m = x.mesure_ak;
  return (
    <div className="flex flex-col bg-relief/30 px-4 pb-3 pt-1">
      {x.rappel ? (
        <div className={ligne}><span className="text-ardoise">État</span><span className="text-ambre">{x.issue} · aucun appel n'a été créé, donc rien à valider</span></div>
      ) : <div className={ligne}><span className="text-ardoise">État</span>
        <span className="flex flex-wrap items-center gap-3">
          <span className={valide ? "text-craie" : "text-ambre"}>{valide ? "Validé" : "Pas validé"}{x.validation_main ? <span className="text-brume"> · à la main par {String(x.validation_main.par || "").split("@")[0]} le {new Date(x.validation_main.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span> : null}</span>
          {modifiable && <button type="button" onClick={() => marquer.mutate(!valide)} disabled={marquer.isPending}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            {marquer.isPending && <Loader2 className="h-3 w-3 animate-spin" />}{valide ? "Marquer non validé" : "Marquer validé"}
          </button>}
          {modifiable && <span className="text-[12px] text-brume">Seul l'état change : rien n'est envoyé ni écrit dans Monday.</span>}
        </span>
      </div>}
      <div className={ligne}><span className="text-ardoise">Résumé</span><span className="text-encre">{x.resume || "—"}</span></div>
      {x.issue_proposee && x.issue_proposee !== x.issue && <div className={ligne}><span className="text-ardoise">Issue</span><span className="text-encre">AK proposait « {x.issue_proposee} », changée en « {x.issue} »</span></div>}
      {x.citations.length > 0 && (
        <div className={ligne}><span className="text-ardoise">Phrases exactes</span>
          <span className="flex flex-col gap-1">{x.citations.map((c) => <span key={c.cle} className="text-craie"><span className="text-brume">{c.cle} · </span>« {c.phrase} »</span>)}</span>
        </div>
      )}
      {Object.entries(x.champs).filter(([, val]) => val).length > 0 && (
        <div className={ligne}><span className="text-ardoise">Compris</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">{Object.entries(x.champs).filter(([, val]) => val).map(([k, val]) => <span key={k} className="text-craie"><span className="text-brume">{k} : </span>{String(val)}</span>)}</span>
        </div>
      )}
      {x.pourquoi_relance && <div className={ligne}><span className="text-ardoise">Pourquoi la relance</span><span className="text-craie">{x.pourquoi_relance}</span></div>}
      {x.notes && <div className={ligne}><span className="text-ardoise">Notes tapées</span><span className="whitespace-pre-line text-craie">{x.notes}</span></div>}
      <div className={ligne}><span className="text-ardoise">Enregistrement</span>
        <span className="text-craie">{x.rappel ? (x.enregistre ? "Enregistré" : "Pas de transcription gardée") : x.enregistre == null ? "Non mesuré (avant le 9 oct.)" : x.enregistre ? "Enregistré" : "Sans enregistrement"}{x.duree_s ? ` · ${dureeLisible(x.duree_s)}` : ""}{x.lecture_ms ? ` · lu par AK en ${(x.lecture_ms / 1000).toFixed(1)} s` : ""}.</span>
      </div>
      {/* La transcription, gardée avec l'appel depuis le 13 oct. 2026 (avant, elle ne l'était pas). */}
      <div className={ligne}><span className="text-ardoise">Transcription</span>
        {x.transcription ? <span className="max-h-[320px] overflow-y-auto whitespace-pre-line text-craie">{x.transcription}</span> : <span className="text-brume">{x.enregistre ? "Pas gardée (appel d'avant le 13 octobre)" : "Pas d'enregistrement"}</span>}
      </div>
      {/* L'écran de l'analyste pendant l'appel (14 oct. 2026) : rejoué d'un clic, gardé 30 jours. */}
      {x.ecran_id && <BoutonEcran id={x.ecran_id} ligne={ligne} titre={`Écran de ${String(x.par || "l'analyste").split("@")[0]} · ${x.agence || x.agent || "appel"}`} />}
      {x.temps && <div className={ligne}><span className="text-ardoise">Après l'appel</span><span className="text-craie">{[["pret_ms", "actions prêtes"], ["valide_ms", "validé"], ["prepare_ms", "tout préparé"]].filter(([k]) => x.temps[k] != null).map(([k, t]) => `${t} en ${secondesLisibles(x.temps[k])}`).join(" · ")}, depuis le raccrochage</span></div>}
      {v && <div className={ligne}><span className="text-ardoise">Validation</span><span className="text-craie">{v.depuis_fenetre ? "Depuis la fenêtre des actions" : "Depuis la page"} · {v.vues ?? "?"} étape{(v.vues || 0) > 1 ? "s" : ""} ouverte{(v.vues || 0) > 1 ? "s" : ""} sur {v.etapes}{v.retirees?.length ? ` · retirées : ${v.retirees.join(", ")}` : ""}{v.ajoutees?.length ? ` · ajoutées : ${v.ajoutees.join(", ")}` : ""}{x.annulations ? ` · annulé ${x.annulations} fois` : ""}</span></div>}
      {m && <div className={ligne}><span className="text-ardoise">Corrections d'AK</span><span className="text-craie">{!m.propose_par_ak ? "Issue tapée à la main : AK n'a rien proposé" : !m.corrige ? "Aucune" : [m.issue && "issue changée", m.champs?.length && `champs : ${m.champs.join(", ")}`, m.date && "date retouchée", m.mail && "mail retouché"].filter(Boolean).join(" · ")}</span></div>}
      {x.recu && <div className={ligne}><span className="text-ardoise">Reçu</span><span className="flex flex-col gap-0.5 text-craie">{x.recu.monday && <span>Monday : {x.recu.monday.texte}</span>}{x.recu.mail && <span>Mail : {x.recu.mail.texte}</span>}{x.recu.relance && <span>{x.recu.relance}</span>}</span></div>}
    </div>
  );
}

/**
 * Mes appels (16 oct. 2026, Jules) : à la place de « Contexte », chacun voit ses
 * propres chiffres, tous ceux du tableau par analyste, et sa courbe par jour.
 * Le contexte gagné par les appels se lit dans l'Intelligence.
 */
function VueMesAppels({ data, c, onJournal }) {
  const { user } = useAuth();
  const email = String(user?.email || "").toLowerCase();
  const moi = data.analystes.find((a) => a.email === email);
  if (!moi) return <p className="m-0 py-10 text-center text-[13.5px] text-brume">Aucun appel à votre nom sur la période.</p>;
  return (
    <div className="k-monte flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {COLONNES.map(([k, titre, f]) => <Chiffre key={k} valeur={f(moi[k])} libelle={titre} />)}
      </div>
      <PetitsMultiples analystes={[moi]} parJour={data.par_jour} c={c} />
      <div>
        <button type="button" onClick={() => onJournal(moi.prenom)} className="p-0 text-[13px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>Voir mes appels, un par un</button>
      </div>
    </div>
  );
}

const ISSUES_MOTS = { pas_de_reponse: "Pas de réponse", repondeur: "Répondeur", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien", pas_interesse: "Pas intéressé", agent_prevenu: "Agent prévenu", rien_de_nouveau: "Rien de nouveau", interesse: "Intéressé" };

/**
 * La vue d'ensemble, redessinée en graphiques (14 oct. 2026, Jules : « plein de
 * courbes, des graphiques »). En tête les chiffres ; puis la période jour par
 * jour (ou heure par heure sur une seule journée) ; puis les répartitions.
 */
function VueEnsemble({ data, jours, c, onChoisir }) {
  const e = data.equipe;
  const unJour = jours === 1;
  const issues = Object.entries(e.issues || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ nom: ISSUES_MOTS[k] || k, valeur: n }));
  const modes = data.sources.map((x) => ({ nom: x.libelle, valeur: x.appels }));
  const apres = e.apres_appel || {};
  const post = apres.valide;
  return (
    <div className="k-monte flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Chiffre valeur={e.appels} libelle="Appels" note={`${e.jours_actifs} jour${e.jours_actifs > 1 ? "s" : ""} actif${e.jours_actifs > 1 ? "s" : ""}`} />
        <Chiffre valeur={p100(e.joints_pct)} libelle="Joints" note={`${e.aboutis} conversation${e.aboutis > 1 ? "s" : ""}`} />
        <Chiffre valeur={p100(e.enregistres_pct)} libelle="Enregistrés" note="depuis le 9 oct." />
        <Chiffre valeur={dureeLisible(e.duree_moyenne_s)} libelle="Durée moyenne" note={`${dureeLisible(e.duree_totale_s)} au téléphone`} />
        {/* Le post-appel moyen (14 oct. 2026, Jules) : du raccrochage à la validation des actions. */}
        <Chiffre valeur={post?.moyenne_ms != null ? secondesLisibles(post.moyenne_ms) : "—"} libelle="Post-appel moyen" note={post?.n ? `raccroché → validé · ${post.n} appel${post.n > 1 ? "s" : ""}` : "mesuré depuis le 13 oct."} />
        <Chiffre valeur={p100(e.sans_correction_pct)} libelle="Sans correction AK" note={`${e.issue_changee} issue${e.issue_changee > 1 ? "s" : ""} changée${e.issue_changee > 1 ? "s" : ""}`} />
        <Chiffre valeur={e.oublies} libelle="Non validés" note="plus d'une heure après l'appel" />
      </div>

      {unJour ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ClassementAnalystes analystes={data.analystes} c={c} titre="Appels par analyste aujourd'hui" onChoisir={onChoisir} />
          <ParHeure heures={data.heures} c={c} titre="Appels heure par heure, aujourd'hui" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <AppelsParJour parJour={data.par_jour} c={c} />
            <ClassementAnalystes analystes={data.analystes} c={c} titre="Appels par analyste" onChoisir={onChoisir} />
          </div>
          {/* Le temps d'appel et le nombre d'appels, avec la croissance sur la veille (16 oct. 2026, Jules). */}
          <TempsEtAppels parJour={data.par_jour} c={c} />
          {/* Le temps après l'appel, jour par jour (16 oct. 2026, Jules). */}
          <TempsPostAppel parJour={data.par_jour} c={c} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CourbesAnalystes parJour={data.par_jour} analystes={data.analystes} c={c} />
            <TauxJoints parJour={data.par_jour} c={c} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Cumul parJour={data.par_jour} c={c} />
            <DureeParJour parJour={data.par_jour} c={c} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <CarteSemaine semaine={data.semaine || []} c={c} />
            <ParHeure heures={data.heures} c={c} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <BarresHorizontales titre="Issues" lignes={issues} c={c} vide="Aucun appel sur la période." />
        <BarresHorizontales titre="Par mode" lignes={modes} c={c} />
        <Durees durees={data.durees || []} c={c} />
        <Cadre titre="Après l'appel" aide="Depuis le raccrochage, mesuré depuis le 13 octobre.">
          {[["pret", "Actions prêtes"], ["valide", "Validé"], ["prepare", "Tout préparé"]].map(([k, t]) => {
            const x = apres[k];
            const max = Math.max(1, ...["pret", "valide", "prepare"].map((y) => apres[y]?.moyenne_ms || 0));
            return (
              <div key={k} className="mb-2.5 text-[12.5px] last:mb-0" title={x?.n ? `Médiane ${secondesLisibles(x.mediane_ms)}, moyenne ${secondesLisibles(x.moyenne_ms)}, sur ${x.n} appels` : "Pas encore mesuré"}>
                <div className="flex justify-between"><span className="text-craie">{t}</span><span className="tabular-nums text-encre">{x?.moyenne_ms != null ? secondesLisibles(x.moyenne_ms) : "—"}{x?.n ? <span className="text-brume"> · médiane {secondesLisibles(x.mediane_ms)}</span> : null}</span></div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: c.trait }}><span className="block h-full rounded-full" style={{ width: `${((x?.moyenne_ms || 0) / max) * 100}%`, background: c.menthe }} /></span>
              </div>
            );
          })}
        </Cadre>
      </div>

      <Cadre titre="Rappels entrants">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Reçus", data.rappels.total], ["Terminés", data.rappels.termines], ["Abandonnés", data.rappels.abandonnes], ["À terminer", data.rappels.en_cours]].map(([t, n]) => <div key={t}><p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{t}</p><p className="m-0 mt-1 text-[22px] font-light text-encre">{n}</p></div>)}
        </div>
        <p className="m-0 mt-3 text-[12px] text-brume">Mails partis : {e.mails_partis} · Monday écrit : {e.monday_ok} · lecture AK moyenne : {e.lecture_moyenne_ms ? `${(e.lecture_moyenne_ms / 1000).toFixed(1)} s` : "—"}</p>
      </Cadre>
    </div>
  );
}

// `dansProspection` (13 oct. 2026, Jules) : la même page dans l'onglet Suivi de la Prospection, ouverte à
// toute l'équipe : les trois vues, sans le titre ni la remise à zéro ni la validation à la main (réservées au Suivi).
export default function SuiviAppels({ dansProspection = false }) {
  const base = dansProspection ? "/api/prospection/suivi-appels" : "/api/monitoring/appels";
  const [jours, setJours] = useState(30);
  const [ouvert, setOuvert] = useState(null);
  const [qui, setQui] = useState("");
  const [vue, setVue] = useState("ensemble");
  const voirJournalDe = (prenom) => { setQui(prenom); setVue("journal"); };
  const c = useCouleurs();
  // Remettre à zéro (9 oct. 2026) : le suivi compte à partir de maintenant ; rien ne s'efface, « Tout afficher » revient en arrière.
  const queryClient = useQueryClient();
  const zero = useMutation({
    mutationFn: (quoi) => base44.request("POST", `/api/monitoring/appels/${quoi}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suivi-appels"] }),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["suivi-appels", jours, dansProspection],
    queryFn: () => base44.request("GET", `${base}?jours=${jours}`),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  const journal = (data?.journal || []).filter((x) => !qui || x.par === qui);

  return (
    <div className={dansProspection ? "text-encre" : "min-h-screen text-encre"}>
      <div className={dansProspection ? "" : "mx-auto max-w-[1300px] px-4 py-8 md:px-8 md:py-10"}>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          {!dansProspection && <div>
            <OngletsSuivi className="mb-3.5" />
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Appels et relances</h1>
          </div>}
          {/* md:pr-14 : la marge du bouton Rappel, fixé dans le coin. */}
          <div className={`flex flex-col items-end gap-2 ${dansProspection ? "ml-auto" : "md:pr-14"}`}>
            <div className="flex flex-wrap gap-1.5">{PERIODES.map(([j, mot]) => <button key={j} type="button" onClick={() => setJours(j)} className={filtre(jours === j)}>{mot}</button>)}</div>
            {!dansProspection && <button type="button" disabled={zero.isPending} onClick={() => { if (window.confirm("Remettre le suivi des appels à zéro ? Il comptera à partir de maintenant. Rien n'est effacé : « Tout afficher » revient en arrière.")) zero.mutate("remettre-a-zero"); }}
              className="h-8 rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Remettre à zéro</button>}
          </div>
        </div>

        {data?.remise_a_zero && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-trait px-4 py-2.5">
            <span className="text-[13.5px] text-craie">Compté depuis la remise à zéro du {new Date(data.remise_a_zero.le).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}{data.remise_a_zero.par ? ` par ${data.remise_a_zero.par.split("@")[0].split(".")[0].replace(/^./, (c) => c.toUpperCase())}` : ""}.</span>
            <button type="button" disabled={zero.isPending} onClick={() => zero.mutate("tout-afficher")} className="p-0 text-[13px] text-menthe underline-offset-4 hover:underline disabled:opacity-50" style={{ background: "transparent" }}>Tout afficher</button>
          </div>
        )}

        {/* Avant le 13 octobre, c'était de l'essai (16 oct. 2026, Jules) : rien n'est compté avant. */}
        {data?.debut_mesures && !data?.remise_a_zero && <p className="m-0 mb-4 text-[12.5px] text-brume">Compté à partir du 13 octobre : avant, les appels étaient des essais.</p>}
        <div className="mb-6 flex gap-5 border-b border-trait">
          {VUES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setVue(k)} className={`-mb-px border-b-[1.5px] pb-2 text-[13.5px] transition-colors ${vue === k ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
          ))}
        </div>

        {isLoading || !data ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div> : (
          <>
            {vue === "ensemble" && <VueEnsemble data={data} jours={jours} c={c} onChoisir={voirJournalDe} />}

            {vue === "analystes" && <div className="mb-8 rounded-md border border-trait p-4 k-monte">
              <h2 className={titreCase}>Par analyste</h2>
              <div className="mb-5"><PetitsMultiples analystes={data.analystes} parJour={data.par_jour} c={c} onChoisir={voirJournalDe} /></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1500px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-bord">
                      <th className="sticky left-0 bg-fond py-2 pr-3 text-left text-[11px] font-normal uppercase tracking-[.14em] text-brume">Analyste</th>
                      {COLONNES.map(([k, t]) => <th key={k} className="px-2 py-2 text-right text-[11px] font-normal uppercase tracking-[.1em] text-brume">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.analystes.map((a) => (
                      <tr key={a.email} onClick={() => voirJournalDe(a.prenom)} className="cursor-pointer border-b border-trait hover:bg-relief/30" title="Voir les appels de cette personne">
                        <td className="sticky left-0 bg-fond py-2.5 pr-3 text-encre">{a.prenom}</td>
                        {COLONNES.map(([k, , f]) => <td key={k} className={`px-2 py-2.5 text-right tabular-nums ${a.appels ? "text-craie" : "text-brume"}`}>{f(a[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-0 mt-3 text-[12px] text-brume">Durée, enregistrement, notes, validation depuis la fenêtre, étapes ouvertes et corrections d'AK sont mesurés depuis le 9 octobre 2026 : avant, « — ». Un clic sur une personne ouvre ses appels.</p>
            </div>}

            {vue === "moi" && <VueMesAppels data={data} c={c} onJournal={voirJournalDe} />}

            {vue === "journal" && <div className="rounded-md border border-trait p-4 k-monte">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={`${titreCase} mb-0`}>Journal des appels</h2>
                <div className="flex flex-wrap gap-1.5">{["", ...data.analystes.filter((a) => a.appels).map((a) => a.prenom)].map((p) => <button key={p || "tous"} type="button" onClick={() => setQui(p)} className={filtre(qui === p)}>{p || "Tout le monde"}</button>)}</div>
                <span className="text-[12px] text-brume">{journal.length} appel{journal.length > 1 ? "s" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[110px_80px_100px_minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_110px_110px_20px] gap-3 border-b border-bord py-2 text-[11px] uppercase tracking-[.1em] text-brume">
                    <span>Quand</span><span>Qui</span><span>Mode</span><span>Agence</span><span>Issue</span><span>Durée</span><span>Enreg.</span><span>Validation</span><span>AK</span><span />
                  </div>
                  {journal.map((x) => (
                    <div key={x.id} className="border-b border-trait">
                      <button type="button" onClick={() => setOuvert(ouvert === x.id ? null : x.id)} className="grid w-full grid-cols-[110px_80px_100px_minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_110px_110px_20px] items-center gap-3 py-2.5 text-left text-[13px] hover:bg-relief/30" style={{ background: "transparent" }}>
                        <span className="tabular-nums text-ardoise">{quand(x.le)}</span>
                        <span className="text-craie">{x.par}</span>
                        <span className="text-ardoise">{SOURCES[x.source] || x.source}</span>
                        <span className="min-w-0 truncate text-encre">{x.agence || "—"}{x.ville ? <span className="text-brume"> · {x.ville}</span> : null}</span>
                        <span className="min-w-0 truncate text-craie">{x.issue}{x.issue_proposee && x.issue_proposee !== x.issue ? <span className="text-ambre"> (changée)</span> : null}</span>
                        <span className="tabular-nums text-ardoise">{x.duree_s ? dureeLisible(x.duree_s) : "—"}</span>
                        <span className="text-ardoise">{x.enregistre == null ? "—" : x.enregistre ? "Oui" : "Non"}{x.notes ? " · notes" : ""}</span>
                        <span className={x.etat === "valide" ? "text-craie" : "text-ambre"}>{x.rappel ? "Sans appel" : x.etat === "valide" ? (x.validation_main?.a === "valide" ? "À la main" : x.validation ? (x.validation.depuis_fenetre ? "Fenêtre" : "Page") : "Validé") : "Pas validé"}</span>
                        <span className="text-ardoise">{!x.mesure_ak ? "—" : !x.mesure_ak.propose_par_ak ? "Tapée" : x.mesure_ak.corrige ? <span className="text-ambre">Corrigé</span> : "Juste"}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${ouvert === x.id ? "rotate-180" : ""}`} />
                      </button>
                      {ouvert === x.id && <DetailAppel x={x} modifiable={!dansProspection} />}
                    </div>
                  ))}
                  {!journal.length && <p className="m-0 py-8 text-center text-[13px] text-brume">Aucun appel sur la période.</p>}
                </div>
              </div>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}

/** « Voir l'écran » : la page de l'analyste pendant l'appel, rejouée. */
function BoutonEcran({ id, ligne, titre }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className={ligne}><span className="text-ardoise">Écran</span>
      <span>
        <button type="button" onClick={() => setOuvert(true)} className="inline-flex h-8 items-center rounded-full border border-bord-doux px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Voir l'écran pendant l'appel</button>
        {ouvert && <LecteurEcran id={id} titre={titre} onFermer={() => setOuvert(false)} />}
      </span>
    </div>
  );
}
