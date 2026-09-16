import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { EnTeteAlx, Carte, GrilleStats, Stat, Bouton, Etiquette, TEINTES } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";

// Ce qui a marché. C'est ici qu'on ajuste les seuils du fichier de règles :
// un signal qui ne convertit jamais n'en est pas un, une rue qui ne répond
// pas ne vaut pas un second passage.
//
// Trois juges, du plus rapide au plus lent. Le taux de réponse par pile, en
// quinze jours : si les témoins tirés au sort répondent autant que la pile
// « à appeler », le classement ne sert à rien. Les prédictions figées,
// confrontées à DVF au bout d'un an : ce qu'ALX a dit, ce qui s'est vendu. La
// mesure DVF, sur dix ans de ventes : ce que la fenêtre depuis la dernière
// mutation et un voisin qui mute valent vraiment, à date gelée.

// Sous trente événements, un taux ne se lit pas : un cas de plus ou de moins
// le déplace de moitié. On affiche un tiret plutôt qu'un chiffre auquel
// personne ne devrait croire, et la note en bas de chaque bloc le dit.
const SOUS_LE_SEUIL = "—";
const pct = (x, fiable = true) => (x == null ? "—" : !fiable ? SOUS_LE_SEUIL : `${String(x).replace(".", ",")} %`);
const lift = (x, fiable = true) => (x == null ? "—" : !fiable ? SOUS_LE_SEUIL : `×${String(x).replace(".", ",")}`);
const virgule = (x) => (x == null ? "—" : String(x).replace(".", ","));
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

const PILES_MOTS = { appeler: "À appeler", ecrire: "À écrire", surveiller: "À surveiller", ecartee: "Écartée", temoin: "Témoins (hasard)" };

/** Une ligne de table : un libellé, des cellules à droite. */
function Ligne({ libelle, cellules, sourdine = false }) {
  return (
    <div className={`grid items-center gap-3 py-[10px] border-t border-trait first:border-t-0 text-[12.5px] ${sourdine ? "text-brume" : ""}`} style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${cellules.length}, 72px)` }}>
      <span className={`truncate ${sourdine ? "" : "text-craie"}`}>{libelle}</span>
      {cellules.map((c, i) => <span key={i} className={`text-right tabular-nums ${i === cellules.length - 1 ? "text-encre" : "text-ardoise"}`}>{c}</span>)}
    </div>
  );
}
function Entetes({ colonnes }) {
  return (
    <div className="grid items-center gap-3 pb-2" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${colonnes.length}, 72px)` }}>
      <span />
      {colonnes.map((c) => <Etiquette key={c} className="text-right !text-[10px]">{c}</Etiquette>)}
    </div>
  );
}

function BarreSignal({ cle, total, reponses, max }) {
  const pct = max ? Math.round((total / max) * 100) : 0;
  const tauxReponse = total ? Math.round((reponses / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_54px] gap-3 items-center">
      <div className="text-[12.5px] text-craie truncate">{cle}</div>
      <div className="h-2 rounded bg-white/[0.06]">
        <div className="h-2 rounded bg-menthe" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <div className="text-[12.5px] text-right tabular-nums">{tauxReponse} %</div>
    </div>
  );
}

function TableauRue({ lignes, vide }) {
  if (!lignes?.length) return <p className="m-0 text-[12.5px] text-brume">{vide}</p>;
  return (
    <div className="flex flex-col">
      {lignes.map((l) => (
        <div key={l.cle} className="grid grid-cols-[minmax(0,1fr)_70px_70px] gap-3 py-[11px] border-t border-trait first:border-t-0 text-[12.5px]">
          <span className="text-craie truncate">{l.cle}</span>
          <span className="text-ardoise text-right">{l.total} envoi{l.total > 1 ? "s" : ""}</span>
          <span className="text-right text-encre">{l.reponses}</span>
        </div>
      ))}
    </div>
  );
}

function TableauRefus({ lignes }) {
  if (!lignes?.length) return <p className="m-0 text-[12.5px] text-brume">Aucun refus encore. Ça viendra, et c'est de l'information.</p>;
  return (
    <div className="flex flex-col">
      {lignes.map((l) => (
        <div key={l.cle} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 py-[11px] border-t border-trait first:border-t-0 text-[12.5px]">
          <span className="text-craie truncate">{l.cle}</span>
          <span className="text-ardoise text-right">{l.total} fois</span>
        </div>
      ))}
    </div>
  );
}

/** Le taux de réponse par pile au moment de l'envoi : le juge le plus rapide. */
function ReponsesParPile({ lignes, temoins, sansInstantane, villes, onTirer, enCours }) {
  const ordre = ["appeler", "ecrire", "temoin", "surveiller", "ecartee"];
  const rangees = ordre.map((k) => lignes.find((l) => l.cle === k)).filter(Boolean);
  const appeler = rangees.find((l) => l.cle === "appeler");
  const temoin = rangees.find((l) => l.cle === "temoin");
  const verdict = appeler?.fiable && temoin?.fiable
    ? appeler.taux_reponse > (temoin.taux_reponse || 0) * 1.5
      ? `La pile « à appeler » répond ${virgule(appeler.taux_reponse)} % contre ${virgule(temoin.taux_reponse)} % au hasard : le classement fait son travail.`
      : `La pile « à appeler » répond ${virgule(appeler.taux_reponse)} %, les témoins ${virgule(temoin.taux_reponse)} % : le classement ne vaut pas mieux que le hasard, revoyez les poids.`
    : `Il faut trente envois dans la pile « à appeler » et autant de témoins pour que le rapport veuille dire quelque chose. ${temoins.ecrits} témoin${temoins.ecrits > 1 ? "s" : ""} écrit${temoins.ecrits > 1 ? "s" : ""} sur ${temoins.tires} tiré${temoins.tires > 1 ? "s" : ""}.`;
  return (
    <Carte className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Réponses par pile, au moment de l'envoi</div>
        {villes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {villes.map((v) => <Bouton key={v.id} discret disabled={enCours} onClick={() => onTirer(v.id)} title="Tire au sort cinq commerces « à surveiller » avec un propriétaire connu, à écrire comme les autres">Tirer 5 témoins · {v.nom}</Bouton>)}
          </div>
        )}
      </div>
      {rangees.length ? (
        <div>
          <Entetes colonnes={["envois", "réponses", "oui", "taux"]} />
          {rangees.map((l) => <Ligne key={l.cle} libelle={PILES_MOTS[l.cle] || l.cle} cellules={[l.total, l.reponses, l.oui, pct(l.taux_reponse, l.fiable)]} sourdine={l.cle === "temoin"} />)}
        </div>
      ) : (
        <p className="m-0 text-[12.5px] text-brume">Aucune approche encore.</p>
      )}
      <p className="m-0 text-[12.5px] text-brume leading-[1.6] border-t border-trait pt-3.5">
        {verdict}{sansInstantane ? ` ${sansInstantane} envoi${sansInstantane > 1 ? "s" : ""} d'avant le journal ${sansInstantane > 1 ? "sont comptés" : "est compté"} avec la pile d'aujourd'hui.` : ""}
      </p>
    </Carte>
  );
}

/** Ce qu'ALX a prédit, et ce que DVF en a dit. */
function Predictions({ p, onVerifier, enCours }) {
  if (!p) return null;
  const ordre = ["appeler", "ecrire", "surveiller", "ecartee"];
  const parPile = ordre.map((k) => (p.par_pile || []).find((l) => l.cle === k)).filter(Boolean);
  return (
    <Carte className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Prédictions figées, et ce qui est arrivé</div>
        <Bouton discret disabled={enCours || !p.verifiables} onClick={onVerifier} title="Relit DVF pour chaque cible prédite il y a plus d'un an, et marque ce qui s'est vendu">{enCours ? "…" : "Confronter à DVF"}</Bouton>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Figées" valeur={p.figees} detail={p.plus_ancienne ? `depuis le ${quand(p.plus_ancienne)}` : "à chaque lecture d'une cible"} />
        <Stat label="Vérifiables" valeur={p.verifiables} detail="plus de douze mois" />
        <Stat label="Réalisées" valeur={p.realisees} teinte={J["menthe"]} detail={p.verifiees ? `${pct(p.taux_realisation)} des ${p.verifiees} vérifiées` : "aucune vérifiée encore"} />
      </div>
      {parPile.length > 0 && (
        <div>
          <Entetes colonnes={["figées", "vérifiées", "vendues", "taux"]} />
          {parPile.map((l) => <Ligne key={l.cle} libelle={PILES_MOTS[l.cle] || l.cle} cellules={[l.figees, l.verifiees, l.realisees, pct(l.taux_realisation, l.realisees >= 30)]} />)}
        </div>
      )}
      <p className="m-0 text-[12.5px] text-brume leading-[1.6] border-t border-trait pt-3.5">
        Le taux à battre est celui du marché : 3 à 5 % des locaux changent de mains par an. Une pile « à appeler » qui se réalise à 12 % vaut trois fois le hasard, et c'est déjà excellent.
      </p>
    </Carte>
  );
}

/**
 * Le seuil d'appel : un curseur de charge de travail, pas une vérité.
 *
 * Combien de cibles passent en « à appeler » dépend d'un nombre choisi, et ce
 * nombre devrait se choisir sur ce que l'équipe peut absorber — trente appels
 * par mois, cent — pas sur une statistique calée sur quarante-trois cas. Le
 * curseur montre en direct ce que chaque seuil donnerait. Il ne l'applique
 * pas : la valeur se pose dans server/alx/data/signaux.json, et on reclasse.
 */
function Seuil({ scores, seuils }) {
  const [valeur, setValeur] = useState(seuils?.appeler ?? 3);
  const tries = useMemo(() => [...(scores || [])].sort((a, b) => b - a), [scores]);
  const combien = (s) => tries.filter((x) => x >= s).length;
  const actuel = seuils?.appeler ?? 3;
  return (
    <Carte className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[.16em] text-ardoise">Le seuil d'appel, en cibles</div>
        <span className="text-[12.5px] text-brume">{tries.length} cibles classées, hors écartées et dossiers</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-4">
        <Stat label="Seuil essayé" valeur={virgule(valeur)} detail={valeur === actuel ? "celui du fichier de règles" : `posé aujourd'hui : ${virgule(actuel)}`} />
        <Stat label="À appeler" valeur={combien(valeur)} teinte={J["menthe"]} detail={`contre ${combien(actuel)} avec le seuil actuel`} />
      </div>
      <input
        type="range" min="0.4" max="5" step="0.1" value={valeur}
        onChange={(e) => setValeur(Number(e.target.value))}
        aria-label="Seuil du score pour la pile à appeler"
        className="w-full accent-menthe"
      />
      <div>
        <Entetes colonnes={["cibles"]} />
        {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((s) => <Ligne key={s} libelle={`Seuil ${virgule(s)}`} cellules={[combien(s)]} sourdine={s !== valeur} />)}
      </div>
      <p className="m-0 border-t border-trait pt-3.5 text-[12.5px] leading-[1.6] text-brume">
        Combien d'appels votre équipe passe-t-elle par mois ? C'est la seule question qui décide de ce seuil. Pour l'appliquer, changez seuils_score.appeler dans server/alx/data/signaux.json, puis reclassez les cibles.
      </p>
    </Carte>
  );
}

/** Les poids des signaux, et la mesure qui les justifie. */
function Poids({ poids, nonObservables }) {
  if (!poids) return null;
  return (
    <Carte className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Les poids, et ce qui les justifie</div>
        <span className="text-[12.5px] text-brume">règles v{poids.version} · appeler ≥ {virgule(poids.seuils.appeler)} · écrire ≥ {virgule(poids.seuils.ecrire)}</span>
      </div>
      <div>
        <Entetes colonnes={["poids", "vendeurs", "témoins", "lift"]} />
        {poids.signaux.map((s) => (
          <div key={s.cle} className={`border-t border-trait first:border-t-0 py-[10px] ${s.observable ? "" : "text-brume"}`}>
            <div className="grid items-center gap-3 text-[12.5px]" style={{ gridTemplateColumns: "minmax(0,1fr) repeat(4, 72px)" }}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={`truncate ${s.observable ? "text-craie" : ""}`}>{s.libelle}</span>
                {!s.observable && <Etiquette teinte={TEINTES.muet} className="shrink-0 !text-[10px]">dossier seulement</Etiquette>}
              </span>
              <span className="text-right tabular-nums text-encre">{s.poids_par_type ? `${virgule(Math.min(...Object.values(s.poids_par_type)))} – ${virgule(Math.max(...Object.values(s.poids_par_type)))}` : virgule(s.poids)}</span>
              <span className="text-right tabular-nums text-ardoise">{s.etude ? pct(s.etude.vendeurs_pct) : "—"}</span>
              <span className="text-right tabular-nums text-ardoise">{s.etude ? pct(s.etude.temoins_pct) : "—"}</span>
              <span className="text-right tabular-nums text-encre">{s.etude ? lift(s.etude.lift) : "—"}</span>
            </div>
            {s.pourquoi && <p className={`m-0 mt-1 text-[12px] leading-[1.5] ${/^NON TESTÉ/.test(s.pourquoi) ? "text-ambre" : "text-brume"}`}>{s.pourquoi}</p>}
          </div>
        ))}
      </div>
      <p className="m-0 text-[12.5px] text-brume leading-[1.6] border-t border-trait pt-3.5">
        {poids.etude ? `Étude des vendeurs du ${quand(poids.etude.le)} : ${poids.etude.vendeurs} vendeurs réels, ${poids.etude.temoins} témoins. ` : ""}
        Les poids se changent dans server/alx/data/signaux.json, avec leur raison.{nonObservables?.length ? ` ${nonObservables.length} signaux ne se lisent que sur un dossier entré et ne comptent jamais en prospection.` : ""}
      </p>
    </Carte>
  );
}

/** La mesure DVF : dix ans de ventes, lues à date gelée. */
function MesureDvf({ m, enCours, onLancer, lancable }) {
  return (
    <Carte className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">La mesure DVF, à date gelée</div>
        <Bouton discret disabled={enCours || !lancable} onClick={onLancer} title="Télécharge DVF depuis 2014 pour chaque ville relevée et mesure les signaux que DVF seul permet de tester">{enCours ? "Mesure en cours…" : m ? "Refaire la mesure" : "Lancer la mesure"}</Bouton>
      </div>
      {m ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Taux de base" valeur={pct(m.base.taux, m.base.fiable)} detail={`${m.base.ventes} ventes sur ${m.horizon_mois} mois · ≈ ${pct(m.base.taux_annuel_approx, m.base.fiable)} par an`} />
            {(() => {
              const f = m.par_fenetre.find((x) => x.cle === "18-48") || {};
              return <Stat label="Fenêtre 18-48 mois" valeur={lift(f.lift, f.fiable)} teinte={f.fiable ? J["menthe"] : null} detail={f.fiable ? "toutes populations confondues" : `${f.ventes || 0} ventes : pas encore mesurable`} />;
            })()}
            <Stat label="Un lot voisin vendu" valeur={lift(m.voisin.avec.lift, m.voisin.avec.fiable)} teinte={m.voisin.avec.fiable ? J["menthe"] : null} detail={`${m.voisin.avec.ventes} ventes sur ${m.voisin.avec.n} cas`} />
          </div>
          <div>
            <Entetes colonnes={["locaux", "vendus", "taux", "lift"]} />
            <Ligne libelle="Taux de base" cellules={[m.base.n, m.base.ventes, pct(m.base.taux, m.base.fiable), "×1"]} />
            {m.par_fenetre.map((f) => <Ligne key={f.cle} libelle={`Dernière mutation il y a ${f.cle} mois`} cellules={[f.n, f.ventes, pct(f.taux, f.fiable), lift(f.lift, f.fiable)]} sourdine={f.n > 0 && !f.fiable} />)}
            <Ligne libelle="Un autre lot de l'immeuble vendu avant" cellules={[m.voisin.avec.n, m.voisin.avec.ventes, pct(m.voisin.avec.taux, m.voisin.avec.fiable), lift(m.voisin.avec.lift, m.voisin.avec.fiable)]} />
            <Ligne libelle="Acheté en bloc" cellules={[m.bloc.avec.n, m.bloc.avec.ventes, pct(m.bloc.avec.taux, m.bloc.avec.fiable), lift(m.bloc.avec.lift, m.bloc.avec.fiable)]} />
            {/* Ce que le fichier des personnes morales ajoute : le
                propriétaire à la date, son portefeuille, ce qu'il a vendu. */}
            {m.proprietaires && [
              <Ligne key="rot" libelle="Le propriétaire a vendu ailleurs avant" cellules={[m.proprietaires.rotation.avec.n, m.proprietaires.rotation.avec.ventes, pct(m.proprietaires.rotation.avec.taux, m.proprietaires.rotation.avec.fiable), lift(m.proprietaires.rotation.avec.lift, m.proprietaires.rotation.avec.fiable)]} />,
              ...m.proprietaires.portefeuille.map((p) => (
                <Ligne key={p.cle} libelle={`Portefeuille de ${p.cle}`} cellules={[p.n, p.ventes, pct(p.taux, p.fiable), lift(p.lift, p.fiable)]} />
              )),
            ]}
          </div>
          <p className="m-0 text-[12.5px] text-brume leading-[1.6] border-t border-trait pt-3.5">
            Mesure du {quand(m.le)} sur {m.communes.map((c) => `${c.nom} (${c.locaux} locaux, ${c.ventes} ventes)`).join(", ")}. Chaque local est lu tel qu'il était à chaque 1er janvier, avec les seules ventes antérieures ; ce qui s'est vendu dans les {m.horizon_mois} mois suivants est le résultat.
            {m.proprietaires
              ? ` Le propriétaire vient du fichier des personnes morales de la DGFiP, à la même date : ${m.proprietaires.personne_morale.connue.n} locaux sur ${m.proprietaires.personne_morale.connue.n + m.proprietaires.personne_morale.inconnue.n} en ont un (le fichier ne couvre pas les particuliers).`
              : " Le propriétaire à la date n'est pas lu : extrayez le fichier des personnes morales (node server/alx/personnes-morales.js 2022 2023) pour mesurer la rotation de portefeuille."}
            {" "}Un lift se reporte dans signaux.json à la main : la mesure ne touche pas aux poids.
          </p>
        </>
      ) : (
        <p className="m-0 text-[12.5px] text-brume leading-[1.6]">
          Pas encore mesuré. La mesure lit toutes les ventes depuis 2014 des villes relevées (quelques minutes la première fois) et dit, à date gelée, ce que valent la fenêtre depuis la dernière mutation et un voisin qui mute. C'est la seule mesure sans le biais des dossiers arrivés par des agents.
        </p>
      )}
    </Carte>
  );
}

export default function ALXBilan() {
  const user = useUser();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["alx-bilan"], queryFn: () => base44.request("GET", "/api/alx/bilan") });
  const { data: villesLues } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes") });
  const { data: mesure } = useQuery({
    queryKey: ["alx-mesure"],
    queryFn: () => base44.request("GET", "/api/alx/mesure"),
    refetchInterval: (q) => (q.state.data?.en_cours ? 4000 : false),
  });
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["alx-bilan"] }); queryClient.invalidateQueries({ queryKey: ["alx-villes"] }); queryClient.invalidateQueries({ queryKey: ["alx-mesure"] }); };
  const tirer = useMutation({
    mutationFn: (villeId) => base44.request("POST", `/api/alx/villes/${villeId}/temoins`, { body: { n: 5 } }),
    onSuccess: (r) => { toast.success(`${r.temoins.length} témoin${r.temoins.length > 1 ? "s" : ""} tiré${r.temoins.length > 1 ? "s" : ""} au sort, à écrire depuis l'onglet Commerces`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const verifier = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/predictions/verifier", { body: {} }),
    onSuccess: (r) => { toast.success(`${r.verifiees} prédiction${r.verifiees > 1 ? "s" : ""} confrontée${r.verifiees > 1 ? "s" : ""} à DVF, ${r.realisees} réalisée${r.realisees > 1 ? "s" : ""}`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const lancerMesure = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/mesure", { body: {} }),
    onSuccess: (r) => { toast.success(`Mesure lancée sur ${r.villes.join(", ")}`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  if (!user || user.role !== "admin") return null;

  const c = data?.cibles || {};
  const a = data?.approches || {};
  const parCanal = data?.par_canal || [];
  const mails = parCanal.find((x) => x.cle === "mail")?.total || 0;
  const courriers = parCanal.find((x) => x.cle === "courrier")?.total || 0;
  const parSignal = data?.par_signal || [];
  const maxSignal = Math.max(1, ...parSignal.map((s) => s.total));
  // Les villes où il y a de quoi tirer : actives, visibles, avec des commerces lus.
  const villes = (villesLues || []).filter((v) => v.etat === "active" && !v.cachee && Object.values(v.cibles || {}).some((n) => n > 0));

  return (
    <div className="min-h-screen text-encre">
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        <EnTeteAlx titre="Bilan" />

        <div className="flex flex-col gap-5">
          <GrilleStats>
            <Stat label="Approches envoyées" valeur={a.total || 0} detail={a.total ? `${courriers} courriers · ${mails} mails` : "aucune encore"} />
            <Stat
              label="Réponses"
              valeur={a.reponses || 0}
              teinte={J["menthe"]}
              detail={a.total ? `${Math.round(((a.reponses || 0) / a.total) * 100)} % · délai médian ${a.delai_median_jours ?? "—"} jours` : "—"}
            />
            <Stat label="Rendez-vous obtenus" valeur={a.oui || 0} detail={`dont ${c.en_dossier || 0} avec bail communiqué`} />
            <Stat label="Dossiers créés" valeur={c.en_dossier || 0} detail="entrés en analyse, étape 1" />
          </GrilleStats>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReponsesParPile lignes={data?.par_pile_envoi || []} temoins={data?.temoins || { tires: 0, ecrits: 0 }} sansInstantane={data?.envois_sans_instantane || 0} villes={villes} onTirer={(id) => tirer.mutate(id)} enCours={tirer.isPending} />
            <Predictions p={data?.predictions} onVerifier={() => verifier.mutate()} enCours={verifier.isPending} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Seuil scores={data?.scores} seuils={data?.poids?.seuils} />
            <MesureDvf m={mesure?.rapport || data?.mesure_dvf || null} enCours={!!mesure?.en_cours || lancerMesure.isPending} onLancer={() => lancerMesure.mutate()} lancable={villes.some((v) => v.code_insee)} />
          </div>

          <Poids poids={data?.poids} nonObservables={data?.non_observables} />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Réponses par type de signal</div>
              {parSignal.length ? (
                <div className="flex flex-col gap-3.5">
                  {parSignal.map((s) => <BarreSignal key={s.cle} cle={s.cle} total={s.total} reponses={s.reponses} max={maxSignal} />)}
                </div>
              ) : (
                <p className="m-0 text-[12.5px] text-brume">Aucune approche encore.</p>
              )}
            </Carte>

            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Réponses par rue</div>
              <TableauRue lignes={data?.par_rue} vide="Aucune approche encore." />
            </Carte>

            <Carte className="flex flex-col gap-[18px]">
              <div className="text-[11px] tracking-[.16em] uppercase text-ardoise">Motifs de refus</div>
              <TableauRefus lignes={data?.motifs_refus} />
              <p className="m-0 text-[12.5px] text-brume leading-[1.6] border-t border-trait pt-3.5">
                C'est ici qu'on cale les seuils des trois piles.
              </p>
            </Carte>
          </div>
        </div>
      </div>
    </div>
  );
}
