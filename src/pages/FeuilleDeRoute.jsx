import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ArrowLeft, Loader2, Check, MapPin, Store, Phone, Maximize2, Play, Clock, Globe, Landmark, KeyRound } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import { RENDEZ_VOUS_URL } from "@/lib/rendezVous";

// « Ma feuille de route » : la page ouverte à tous, sans compte.
//
// L'écran de résultat tient en deux colonnes. À GAUCHE, le parcours : la
// capacité d'emprunt de départ, les commerces à acheter qu'on fait défiler, la
// fiche de celui qu'on regarde, et dessous le simulateur complet. À DROITE, un
// guide qui se parcourt étape par étape et qui efface, à gauche, tout ce dont
// il ne parle pas.
//
// Deux choses s'y disent franchement, parce qu'une page ouverte engage plus
// qu'une page interne : les commerces montrés ne sont pas à vendre, ce sont des
// devantures du quartier qui donnent le niveau de prix ; et quand l'objectif
// demande plus de temps que l'horizon voulu, la page le dit.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
// Le rendez-vous, c'est le créneau de Paul : quarante-cinq minutes pour définir
// la stratégie. Le même lien que dans le parcours client, jamais un second.
const LIEN_RDV = RENDEZ_VOUS_URL;
const CARTE = "rounded-[18px] border border-trait bg-surface";
const HORIZONS = [10, 15, 20, 25, 30, 35];
const SLUG = "feuille-de-route";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const parMois = (n) => `${euros(n)} / mois`;
const signe = (n) => `${n >= 0 ? "+" : ""}${euros(n)}`;
const k = (n) => `${Math.round(n / 1000)} k€`;
// « un local de opticien » et « le crédit du coiffure » se lisent mal. Un local
// « de » son métier, avec l'élision, tient dans les deux genres : un local
// d'opticien, un local de coiffure.
const deMetier = (m) => {
  const s = String(m || "").toLowerCase();
  return /^[aeiouyâàéèêëîïôöûü]/.test(s) ? `d'${s}` : `de ${s}`;
};

// Le guide ne cerne pas ce dont il parle : il efface le reste. Tant qu'on n'a
// pas commencé, rien n'est flouté — on voit la page entière, et la carte de
// droite propose d'entrer dans le guide.
const TRANSITION = "transition-[filter,opacity,transform] duration-700 ease-out";
const flouSi = (zoneActive, zone) => {
  if (!zoneActive) return TRANSITION;
  return zoneActive === zone
    ? `${TRANSITION} opacity-100 blur-0`
    : `${TRANSITION} pointer-events-none select-none opacity-30 blur-[5px]`;
};

// ── La fréquentation ────────────────────────────────────────────────────────
//
// Une page sans compte ne dit rien d'elle-même. On ouvre une visite à
// l'arrivée, et on dit ensuite jusqu'où elle est allée et combien de temps elle
// est restée sur le résultat. Rien de tout cela ne doit pouvoir casser la page :
// chaque appel échoue en silence.

function useVue(slug) {
  const [vueId, setVueId] = useState(null);
  useEffect(() => {
    let vivant = true;
    const source = new URLSearchParams(window.location.search).get("utm_source");
    // C'est le navigateur qui sait d'où il vient. L'en-tête « Referer » ne
    // suffit pas : derrière un proxy, une navigation interne arrive au serveur
    // comme si elle venait de l'extérieur. On ne déclare donc un référent que
    // s'il est vraiment d'un autre site.
    let referent = null;
    try {
      if (document.referrer && new URL(document.referrer).origin !== window.location.origin) referent = document.referrer;
    } catch { referent = null; }
    fetch(`/api/lm/${slug}/vue`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, referent }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivant) setVueId(d?.vue_id || null); })
      .catch(() => { /* la mesure n'est pas la page : son échec ne se voit pas */ });
    return () => { vivant = false; };
  }, [slug]);
  return vueId;
}

const direLaVue = (slug, vueId, corps, auDepart = false) => {
  if (!vueId) return;
  const url = `/api/lm/${slug}/vue/${vueId}`;
  const texte = JSON.stringify(corps);
  // Au moment de fermer l'onglet, seul `sendBeacon` part encore à coup sûr.
  if (auDepart && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([texte], { type: "application/json" }));
    return;
  }
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: texte, keepalive: true }).catch(() => {});
};

/** Le temps passé sur le dernier écran, mesuré tant qu'il est affiché. */
function useTempsSurEcran(slug, vueId, actif) {
  useEffect(() => {
    if (!vueId || !actif) return undefined;
    const debut = Date.now();
    const envoyer = (auDepart) => direLaVue(slug, vueId, { ecran: "resultat", secondes: Math.round((Date.now() - debut) / 1000) }, auDepart);
    // Un battement régulier : une page fermée brutalement garde quand même son
    // temps, à quinze secondes près.
    const battement = setInterval(() => envoyer(false), 15000);
    const partir = () => envoyer(true);
    window.addEventListener("pagehide", partir);
    document.addEventListener("visibilitychange", partir);
    return () => {
      clearInterval(battement);
      window.removeEventListener("pagehide", partir);
      document.removeEventListener("visibilitychange", partir);
      envoyer(false);
    };
  }, [slug, vueId, actif]);
}

function Champ({ label, aide = null, children }) {
  return (
    <div className="mb-4">
      <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">{label}</label>
      {children}
      {aide && <p className="m-0 mt-1 text-[11px] text-brume">{aide}</p>}
    </div>
  );
}

function Nombre({ valeur, onChange, unite, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input type="text" inputMode="numeric" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume" />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

// ── Le guide, à droite ──────────────────────────────────────────────────────

function etapesDuGuide(r) {
  const c = r.capacite_initiale;
  const a0 = r.acquisitions[0];
  const a1 = r.acquisitions[1];
  const finPret = r.evenements.find((e) => e.type === "fin_credit");
  const finCredits = r.evenements.find((e) => e.type === "fin_credits_actuels");

  const etapes = [
    {
      zone: "capacite",
      titre: "Ce qu'une banque vous prête aujourd'hui",
      texte: `Une banque plafonne vos remboursements à ${Math.round(r.hypotheses.taux_endettement * 100)} % de vos revenus, soit ${parMois(c.plafond_mensuel)}.`
        + (c.charges_actuelles > 0
          ? ` Vos crédits en cours en occupent déjà ${parMois(c.charges_actuelles)} : il vous reste ${parMois(c.mensualite_max)}, soit ${euros(c.capital)} empruntables sur ${r.hypotheses.duree_credit} ans.`
          : ` Vous n'avez aucun crédit en cours, donc la totalité est disponible : ${euros(c.capital)} empruntables sur ${r.hypotheses.duree_credit} ans.`)
        + ` Avec vos ${euros(c.fonds_propres)} de fonds propres, votre budget d'achat de départ est de ${euros(c.budget)}.`,
    },
    {
      zone: "projet",
      titre: "Voici votre premier projet",
      texte: a0
        ? `Un local ${deMetier(a0.metier)} d'environ ${a0.surface} m², à ${euros(a0.prix)}. Vous apportez ${euros(a0.apport)}, la banque prête ${euros(a0.emprunt)} sur ${a0.duree_credit} ans à ${a0.taux_credit} %. Le locataire verse ${parMois(a0.loyer_mensuel)}, la banque prélève ${parMois(a0.mensualite_credit)} : il vous reste ${signe(a0.cash_flow_mensuel)} par mois.`
        : "Votre objectif est atteignable avec un seul bien.",
    },
    {
      zone: "projet",
      titre: "Qui paie le loyer",
      texte: a0?.exemple
        // Le quartier ne fournit pas toujours une devanture du métier visé. La
        // montrer quand même a du sens, l'annoncer comme telle n'en a pas : on
        // ne dit « un local de coiffure » que si c'en est vraiment un.
        ? `À droite, ${a0.exemple.metier === a0.metier ? `la devanture d'un local ${deMetier(a0.metier)}` : `une devanture du quartier, ${a0.exemple.nom}`} à ${a0.exemple.distance_m} m de chez vous. ${a0.locataire} : ${a0.risque.toLowerCase()}. ${a0.bail} — c'est lui qui paie le crédit, les charges courantes et la taxe foncière quand le bail le prévoit. Ce commerce-là n'est pas à vendre, il montre le type d'exploitant qu'on cherche.`
        : `${a0 ? `${a0.locataire} sur un ${a0.bail.toLowerCase()}` : "Un local commercial se loue par un bail 3-6-9"} : c'est le commerçant qui paie le crédit, les charges courantes et la taxe foncière quand le bail le prévoit. C'est ce qui distingue un commerce d'un appartement.`,
    },
  ];

  if (a1) {
    const attente = a1.annee - a0.annee;
    etapes.push({
      zone: "acquisitions",
      avant: 1,
      titre: attente === 0 ? "Deux acquisitions dès le départ" : `Le deuxième achat, en année ${a1.annee}`,
      texte: attente === 0
        ? `Vos fonds propres couvrent deux apports d'emblée : après le premier local, il reste de quoi financer un local ${deMetier(a1.metier)} à ${euros(a1.prix)}, soit ${euros(a1.apport)} d'apport. Les deux loyers tombent dès la première année.`
        : `Entre l'année ${a0.annee} et l'année ${a1.annee}, deux choses travaillent pour vous : votre épargne, environ ${euros(r.epargne_annuelle)} par an, et le cash-flow du premier local. Ensemble elles reconstituent les ${euros(a1.apport)} d'apport du second — un local ${deMetier(a1.metier)} à ${euros(a1.prix)}. La banque, elle, réintègre ${Math.round(r.hypotheses.part_loyers_retenus * 100)} % de vos loyers dans vos revenus pour recalculer ce qu'elle vous prête.`,
    });
  }

  if (finPret) {
    etapes.push({
      zone: "objectif",
      titre: `Année ${finPret.annee} : le premier prêt est soldé`,
      texte: `Le crédit du local ${deMetier(finPret.metier)} acheté en année ${r.acquisitions.find((a) => a.rang === finPret.rang)?.annee ?? 0} arrive à son terme. Les ${parMois(finPret.mensualite_liberee)} de mensualité s'arrêtent, et ce loyer devient du revenu net, en entier. C'est le seul gain de votre parcours que vous n'avez pas à provoquer.`,
    });
  } else if (finCredits) {
    etapes.push({
      zone: "capacite",
      titre: `Année ${finCredits.annee} : vos crédits actuels se terminent`,
      texte: `Les ${parMois(finCredits.mensualite_liberee)} que vous remboursez aujourd'hui s'arrêtent. Toute cette mensualité redevient de la capacité d'emprunt, d'un coup, au milieu du parcours.`,
    });
  }

  etapes.push({
    zone: "simulateur",
    titre: "Le calcul complet, poste par poste",
    texte: "Tout en bas, le simulateur de Klocka, celui que nous utilisons pour nos clients, pré-rempli avec le local que vous regardez à gauche : crédit, charges, impôt, revente, année par année. Changez de commerce en haut et il se recalcule. Tous les curseurs sont manipulables, essayez.",
  });

  etapes.push({
    zone: "acquisitions",
    titre: `${r.nombre_acquisitions} acquisition${r.nombre_acquisitions > 1 ? "s" : ""} en tout`,
    texte: `Faites-les défiler à gauche. On commence avec ce que la banque suit aujourd'hui, et chaque local acheté change le dossier du suivant. Au terme, ${euros(r.patrimoine_final)} de patrimoine, dont ${euros(r.capital_rembourse)} remboursés par vos locataires, pour ${euros(r.apport_total)} sortis de votre poche.`,
  });

  etapes.push({
    zone: "objectif",
    titre: r.dans_horizon ? "Votre objectif est tenu" : "Votre objectif demande un peu plus de temps",
    texte: r.dans_horizon
      ? `Vous visiez ${parMois(r.objectif_mensuel)} en ${r.horizon_ans} ans : le plan y arrive en ${r.annee_objectif} ans. Parlons-en de vive voix, c'est gratuit et sans engagement.`
      : `Vous visiez ${parMois(r.objectif_mensuel)} en ${r.horizon_ans} ans ; ce plan atteint ${parMois(r.atteint_mensuel)}. Nous préférons le dire plutôt que d'arrondir : avec plus d'apport de départ, un horizon plus long, ou en soldant d'abord vos crédits en cours, le compte y est. C'est exactement ce dont on parle en rendez-vous.`,
  });
  return etapes;
}

function Guide({ r, etape, setEtape, setAcqEnAvant, demarre, onDemarrer, onAppel }) {
  const etapes = useMemo(() => etapesDuGuide(r), [r]);
  const e = etapes[etape];
  useEffect(() => { if (demarre) setAcqEnAvant(e?.avant ?? null); }, [etape, demarre]);

  // Avant de commencer : la page est entière et nette, et la carte invite.
  if (!demarre) {
    return (
      <div className={`${CARTE} flex h-full flex-col justify-center p-6 text-center`}>
        <h3 className="m-0 text-[20px] font-light leading-[1.3] text-encre">Votre feuille de route est prête</h3>
        <p className="m-0 mt-3 text-[13.5px] leading-[1.7] text-craie">
          Prenez trente secondes : nous vous montrons ce qu&apos;il y a à gauche, morceau par morceau — ce qu&apos;une banque
          vous prête aujourd&apos;hui, votre premier local, et comment le suivant se finance.
        </p>
        <button onClick={onDemarrer}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          <Play className="h-4 w-4" />Commencer
        </button>
        <p className="m-0 mt-3 text-[11px] text-brume">{etapes.length} étapes · vous pouvez sortir quand vous voulez</p>
      </div>
    );
  }

  return (
    <div className={`${CARTE} flex h-full flex-col p-5`}>
      <div className="flex items-center justify-between">
        <span className="alx-mont text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Le guide · {etape + 1} / {etapes.length}</span>
        <div className="flex gap-1">
          <button onClick={() => setEtape(Math.max(0, etape - 1))} disabled={etape === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-bord text-ardoise transition-colors hover:text-encre disabled:opacity-30">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setEtape(Math.min(etapes.length - 1, etape + 1))} disabled={etape === etapes.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-menthe/40 bg-menthe/10 text-menthe-texte transition-colors hover:bg-menthe/20 disabled:opacity-30">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <h3 className="m-0 mt-4 text-[19px] font-medium leading-[1.3] text-encre">{e.titre}</h3>
      <p className="m-0 mt-3 flex-1 text-[13.5px] leading-[1.75] text-craie">{e.texte}</p>

      <div className="mt-5 flex gap-1">
        {etapes.map((_, i) => (
          <button key={i} onClick={() => setEtape(i)} aria-label={`Étape ${i + 1}`}
            className={`h-1 flex-1 rounded-full transition-colors ${i === etape ? "bg-menthe" : i < etape ? "bg-menthe/40" : "bg-trait"}`} />
        ))}
      </div>

      {etape === etapes.length - 1 ? (
        <a href={LIEN_RDV} target="_blank" rel="noreferrer" onClick={onAppel}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          <Phone className="h-4 w-4" />Réserver mon appel gratuit
        </a>
      ) : (
        <button onClick={onDemarrer} className="mt-4 text-[11.5px] text-brume hover:text-ardoise">Voir toute la page</button>
      )}
    </div>
  );
}

// ── Le résultat ─────────────────────────────────────────────────────────────

function Resultat({ r, onRecommencer, onAppel }) {
  const [demarre, setDemarre] = useState(false);
  const [vu, setVu] = useState(false);
  const [etape, setEtape] = useState(0);
  const [acq, setAcq] = useState(0);
  const [acqEnAvant, setAcqEnAvant] = useState(null);
  const etapes = useMemo(() => etapesDuGuide(r), [r]);
  // À l'arrivée, seul le titre est net : six blocs chiffrés d'un coup ne se
  // lisent pas, et la carte de droite dit par où commencer. Une fois le guide
  // ouvert au moins une fois, en sortir rend toute la page nette — sans quoi
  // « Voir toute la page » ramènerait au brouillard du départ.
  const zone = demarre ? etapes[etape]?.zone : (vu ? null : "titre");
  const a = r.acquisitions[acq];
  const c = r.capacite_initiale;
  const flou = (z) => flouSi(zone, z);

  // Le guide met en avant une acquisition : la fiche de gauche suit.
  useEffect(() => { if (acqEnAvant != null) setAcq(acqEnAvant); }, [acqEnAvant]);

  // Le simulateur complet, pré-rempli avec le local qu'on regarde. Il se
  // recalcule de lui-même quand l'acquisition change : son état suit ses
  // paramètres. Sans dealId, aucun enregistrement n'est proposé — cette page
  // n'a pas de compte derrière elle.
  const parametresSimulateur = useMemo(() => (a ? {
    surface: a.surface,
    loyerInitialHTHC: a.loyer_annuel,
    prixBienFAI: a.prix,
    prixBienNegocie: a.prix,
    apport: a.apport,
    dureeCredit: a.duree_credit,
    tauxInteret: a.taux_credit,
    anneeRevente: 20,
  } : null), [a]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-10">
      <div className={`mb-8 text-center ${flou("titre")}`}>
        <h1 className="m-0 text-[32px] font-light leading-[1.15] tracking-[-0.01em] text-encre">Votre parcours d&apos;investissement</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Le profil d'endettement : d'où part tout le reste */}
          <div className={`${CARTE} mb-4 p-5 ${flou("capacite")}`}>
            <p className="alx-mont m-0 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">
              <Landmark className="h-3.5 w-3.5" />Ce qu&apos;une banque vous prête aujourd&apos;hui
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {[
                [`Plafond à ${Math.round(r.hypotheses.taux_endettement * 100)} %`, parMois(c.plafond_mensuel)],
                ["Crédits en cours", c.charges_actuelles > 0 ? parMois(c.charges_actuelles) : "aucun"],
                ["Mensualité disponible", parMois(c.mensualite_max)],
                ["Budget d'achat", euros(c.budget)],
              ].map(([t, v]) => (
                <div key={t} className="rounded-[10px] border border-trait bg-relief px-3 py-2">
                  <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                  <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{v}</p>
                </div>
              ))}
            </div>
            <p className="m-0 mt-3 text-[11.5px] leading-[1.6] text-brume">
              {euros(c.capital)} empruntables sur {r.hypotheses.duree_credit} ans à {r.hypotheses.taux_credit} %, plus {euros(c.fonds_propres)} de fonds propres.
              {c.fin_credits_ans ? ` Vos crédits actuels se terminent dans ${c.fin_credits_ans} ans : cette mensualité redeviendra de la capacité.` : ""}
            </p>
          </div>

          {/* Les commerces à acheter, qu'on fait défiler */}
          <div className={`mb-4 ${flou("acquisitions")}`}>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {r.acquisitions.map((x, i) => (
                <button key={x.rang} onClick={() => setAcq(i)}
                  className={`flex-shrink-0 rounded-full border px-3.5 py-2 text-[12px] transition-colors ${i === acq ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                  <span className="font-medium">{x.metier}</span>
                  <span className="ml-2 text-brume">an {x.annee} · {k(x.prix)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* La fiche du projet regardé */}
          {a && (
            <div className={`${CARTE} mb-4 p-5 ${flou("projet")}`}>
              <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">
                Acquisition {a.rang} sur {r.nombre_acquisitions} · {a.typologie}
              </p>
              <h2 className="m-0 mt-1 text-[22px] font-light text-encre">{a.metier} · {euros(a.prix)}</h2>
              <p className="m-0 mt-1 text-[12.5px] text-ardoise">
                environ {a.surface} m² · achat en année {a.annee} · rendement {a.rendement_cible} % (bande {a.rendement_bande[0]} à {a.rendement_bande[1]} %)
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  {/* Le montage, dans l'ordre où on le lit : ce qu'on met, ce
                      qu'on emprunte, ce qui rentre, ce qui sort, ce qui reste. */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["Apport", euros(a.apport)],
                      [`Emprunt sur ${a.duree_credit} ans`, euros(a.emprunt)],
                      ["Loyer net perçu", parMois(a.loyer_mensuel)],
                      ["Mensualité du crédit", parMois(a.mensualite_credit)],
                    ].map(([t, v]) => (
                      <div key={t} className="rounded-[10px] border border-trait bg-relief px-3 py-2">
                        <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                        <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[10px] border border-menthe/40 bg-menthe/[0.08] px-3 py-2">
                      <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">Cash-flow de ce bien</p>
                      <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-menthe-texte">{signe(a.cash_flow_mensuel)} / mois</p>
                    </div>
                    <div className="rounded-[10px] border border-trait bg-relief px-3 py-2">
                      <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">Cumul à l&apos;année {a.annee}</p>
                      <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{parMois(a.cumul_mensuel)}</p>
                    </div>
                  </div>

                  {/* Le locataire : ce que la fiche du commerce dit vraiment,
                      sans rien inventer sur son bail ni sur ses comptes. */}
                  <p className="alx-mont mt-4 mb-2 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Le locataire type</p>
                  <p className="m-0 mb-2 text-[12px] leading-[1.6] text-ardoise">
                    {a.locataire} · {a.bail} · {a.risque.toLowerCase()}
                  </p>
                  {a.exemple ? (
                    <div className="rounded-[12px] border border-trait bg-relief p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-trait"><Store className="h-4 w-4 text-menthe" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-encre">{a.exemple.nom}</span>
                          <span className="block truncate text-[11.5px] text-ardoise">
                            {a.exemple.metier}{a.exemple.enseigne && a.exemple.enseigne !== a.exemple.nom ? ` · enseigne ${a.exemple.enseigne}` : ""}
                            {a.exemple.distance_m != null ? ` · à ${a.exemple.distance_m} m de chez vous` : ""}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11.5px] text-ardoise">
                        {a.exemple.adresse && <p className="m-0 flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.adresse}</p>}
                        {a.exemple.horaires && <p className="m-0 flex items-start gap-1.5"><Clock className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.horaires}</p>}
                        {a.exemple.telephone && <p className="m-0 flex items-start gap-1.5"><Phone className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.telephone}</p>}
                        {a.exemple.site && <p className="m-0 flex items-start gap-1.5"><Globe className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" /><span className="truncate">{a.exemple.site.replace(/^https?:\/\//, "")}</span></p>}
                      </div>
                      <p className="m-0 mt-2 border-t border-trait pt-2 text-[11px] leading-[1.6] text-brume">
                        C&apos;est le commerçant qui paie le loyer, les charges courantes, et la taxe foncière quand le bail le prévoit.
                        Ce commerce existe et <span className="text-ardoise">n&apos;est pas à vendre</span> : il montre le type d&apos;exploitant recherché.
                        {/* Une photo de rue a un âge, et une enseigne peut avoir
                            changé depuis : le dire évite de faire passer une
                            image ancienne pour l'état d'aujourd'hui. */}
                        {a.exemple.prise_le ? ` Vue de rue prise en ${a.exemple.prise_le}.` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="m-0 text-[12px] leading-[1.6] text-ardoise">
                      C&apos;est le commerçant qui paie le loyer, les charges courantes, et la taxe foncière quand le bail le prévoit.
                    </p>
                  )}
                </div>

                {/* La devanture, sur Google Maps */}
                <div className="min-h-[260px] overflow-hidden rounded-[12px] border border-trait">
                  {/* Le panorama exact, cadré sur la devanture par le cap
                      calculé au serveur. Sans panorama, un plan centré sur le
                      commerce vaut mieux qu'une vue de rue qui regarde
                      ailleurs et qu'il faut faire pivoter à la main. */}
                  {CLE_MAPS && a.exemple?.pano ? (
                    <iframe title={`Vue de la rue · ${a.exemple.nom}`} className="block h-full min-h-[260px] w-full border-0"
                      referrerPolicy="no-referrer-when-downgrade" allowFullScreen
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&pano=${encodeURIComponent(a.exemple.pano)}&heading=${a.exemple.cap ?? 0}&pitch=0&fov=80`} />
                  ) : CLE_MAPS && a.exemple?.lat ? (
                    // Sans panorama identifié, la vue de rue ordinaire au point
                    // du commerce. On n'impose pas de cap : « heading=0 »
                    // regardait plein nord, ce qui mettait la devanture dans le
                    // dos de la caméra.
                    <iframe title={`Vue de la rue · ${a.exemple.nom}`} className="block h-full min-h-[260px] w-full border-0"
                      referrerPolicy="no-referrer-when-downgrade" allowFullScreen
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${a.exemple.lat},${a.exemple.lon}&fov=80`} />
                  ) : CLE_MAPS && r.quartier ? (
                    <iframe title="Votre quartier" className="block h-full min-h-[260px] w-full border-0" referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${CLE_MAPS}&q=${encodeURIComponent(r.quartier || "")}&zoom=14`} />
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center px-4 text-center text-[12px] text-brume">Plan indisponible</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Les temps forts du parcours, dont ceux qu'on ne provoque pas */}
          {r.evenements.some((e) => e.type !== "acquisition") && (
            <div className={`${CARTE} mb-4 p-5 ${flou("objectif")}`}>
              <p className="alx-mont m-0 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">
                <KeyRound className="h-3.5 w-3.5" />Ce qui se libère en chemin
              </p>
              <ul className="m-0 mt-3 list-none space-y-2 p-0">
                {r.evenements.filter((e) => e.type !== "acquisition").map((e) => (
                  <li key={`${e.type}-${e.annee}-${e.rang || 0}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ardoise">
                    <span className="font-medium text-encre">Année {e.annee}</span>
                    <span>
                      {e.type === "fin_credit"
                        ? `le crédit du local ${deMetier(e.metier)} est soldé : ${parMois(e.mensualite_liberee)} de mensualité deviennent du revenu net.`
                        : `vos crédits actuels se terminent : ${parMois(e.mensualite_liberee)} redeviennent de la capacité d'emprunt.`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={`grid gap-2 sm:grid-cols-4 ${flou("objectif")}`}>
            {[
              ["Revenu au terme", parMois(r.atteint_mensuel)],
              ["Patrimoine", euros(r.patrimoine_final)],
              ["Remboursé par vos locataires", euros(r.capital_rembourse)],
              ["Objectif atteint", r.annee_objectif != null ? `en ${r.annee_objectif} ans` : "pas dans cet horizon"],
            ].map(([t, v]) => (
              <div key={t} className={`${CARTE} px-4 py-3`}>
                <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                <p className="m-0 mt-0.5 text-[16px] font-semibold tabular-nums text-encre">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Guide r={r} etape={etape} setEtape={setEtape} setAcqEnAvant={setAcqEnAvant} onAppel={onAppel}
            demarre={demarre} onDemarrer={() => { setVu(true); setDemarre((d) => !d); setEtape(0); }} />
        </div>
      </div>

      {/* Le simulateur complet, tout en bas : celui de Klocka, pré-rempli avec
          le local qu'on regarde, et qui se recalcule quand on en change. */}
      {parametresSimulateur && (
        <div className={`mt-6 ${flou("simulateur")}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="m-0 text-[18px] font-medium text-encre">Le calcul complet · {a.metier} à {euros(a.prix)}</h2>
              <p className="m-0 mt-0.5 text-[12px] text-ardoise">
                notre simulateur, pré-rempli avec ce local · changez de commerce en haut et tout se recalcule
              </p>
            </div>
            <a href={r.lien_simulateur} target="_blank" rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord px-3.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
              <Maximize2 className="h-3.5 w-3.5" />Ouvrir dans une page
            </a>
          </div>
          <SimulateurDossier parametres={parametresSimulateur} />
        </div>
      )}

      <details className={`mt-8 ${flou("annexes")}`}>
        <summary className="cursor-pointer text-[12.5px] text-ardoise hover:text-encre">Sur quoi ce plan est-il calculé ?</summary>
        <div className="mt-3 space-y-2 text-[12px] leading-[1.7] text-brume">
          <p className="m-0">
            Taux d&apos;endettement maximum retenu par les banques : {Math.round(r.hypotheses.taux_endettement * 100)} % des revenus, mensualités de vos crédits en cours comprises.
            Part des loyers perçus qu&apos;une banque réintègre dans vos revenus pour l&apos;opération suivante : {Math.round(r.hypotheses.part_loyers_retenus * 100)} %.
            Crédit sur {r.hypotheses.duree_credit} ans à {r.hypotheses.taux_credit} %, en annuités constantes.
            Apport minimum : {Math.round(r.hypotheses.part_apport * 100)} % du prix, ce qui couvre les frais d&apos;acquisition, qui ne se financent pas.
            Épargne supposée : {Math.round(r.hypotheses.part_epargne * 100)} % de vos revenus nets, soit {euros(r.epargne_annuelle)} par an.
            Le prix d&apos;un local est sa surface type multipliée par le prix du quartier ; le rendement est le milieu de la bande de sa classe d&apos;actif.
          </p>
          <p className="m-0">
            Le capital que vous remboursez au fil du crédit n&apos;est pas compté comme apport disponible pour l&apos;acquisition suivante : il ne se mobilise qu&apos;en refinançant.
            Seuls votre épargne et le cash-flow de vos locaux reconstituent l&apos;apport.
          </p>
          {r.marche && <p className="m-0">Prix du quartier : médiane de {r.marche.ventes} ventes de locaux commerciaux ({r.marche.annees?.join(", ")}) publiées par l&apos;administration fiscale, entre {euros(r.marche.bas)} et {euros(r.marche.haut)} le m². <a className="text-menthe-texte" href={r.marche.lien} target="_blank" rel="noreferrer">Voir les ventes</a>.</p>}
          <p className="m-0">Ce plan est une simulation, pas un conseil en investissement, et ne vaut pas engagement. Les rendements passés ne préjugent pas des rendements futurs.</p>
        </div>
      </details>

      <button onClick={onRecommencer} className={`mt-6 text-[12.5px] text-ardoise hover:text-encre ${flou("annexes")}`}>Refaire avec d&apos;autres chiffres</button>

    </div>
  );
}

// ── La page ─────────────────────────────────────────────────────────────────

export default function FeuilleDeRoute() {
  const [f, setF] = useState({
    nom: "", email: "", telephone: "", objectif_mensuel: "", revenus_annuels: "", fonds_propres: "",
    charges_credit_mensuelles: "", fin_credits_ans: "", quartier: "", horizon_ans: 20, consentement: false,
  });
  const [suggestions, setSuggestions] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const poser = (k2, v) => setF((x) => ({ ...x, [k2]: v }));

  const vueId = useVue(SLUG);
  useTempsSurEcran(SLUG, vueId, !!roadmap);
  const marquerAppel = useCallback(() => direLaVue(SLUG, vueId, { appel_clique: true }), [vueId]);

  useEffect(() => {
    const q = f.quartier.trim();
    if (q.length < 3 || roadmap) { setSuggestions([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        // Toute la Base Adresse, numéro de voie compris : une ville seule
        // donnait des prix de quartier moyennés sur toute la commune et des
        // commerces pris au hasard autour du centre.
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=6&q=${encodeURIComponent(q)}`);
        const d = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(d.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* la Base Adresse ne répond pas : on saisit à la main */ }
    }, 250);
    return () => clearTimeout(t);
  }, [f.quartier, roadmap]);

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/lm/${SLUG}/roadmap`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, vue_id: vueId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Nous n'avons pas pu calculer votre feuille de route.");
      return d;
    },
    onSuccess: (d) => { setRoadmap(d.roadmap); window.scrollTo({ top: 0, behavior: "smooth" }); },
  });

  const pret = f.nom.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email) && f.quartier.trim().length >= 3 && Number(f.objectif_mensuel) > 0 && f.consentement;

  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10">
        {roadmap ? (
          <Resultat r={roadmap} onRecommencer={() => setRoadmap(null)} onAppel={marquerAppel} />
        ) : (
          <div className="mx-auto max-w-[680px] px-4 pb-24 pt-14">
            <div className="mb-8 text-center">
              <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
              <h1 className="m-0 mb-3 text-[34px] font-light leading-[1.15] tracking-[-0.01em] text-encre">
                Construisez votre retraite dès maintenant
              </h1>
              <p className="mx-auto m-0 max-w-[520px] text-[15px] leading-[1.7] text-ardoise">
                En deux minutes, vous repartez avec les commerces à acheter, leur prix, leur année, et le revenu de l&apos;ensemble —
                chiffrés sur votre capacité d&apos;emprunt réelle et sur les ventes de votre quartier.
              </p>
            </div>

            <div className={`${CARTE} p-6 max-md:p-4`}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Votre prénom">
                  <input value={f.nom} onChange={(e) => poser("nom", e.target.value)} placeholder="Camille"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
                <Champ label="Votre e-mail">
                  <input type="email" value={f.email} onChange={(e) => poser("email", e.target.value)} placeholder="camille@exemple.fr"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
              </div>

              <Champ label="Votre objectif de revenu" aide="Ce que vous aimeriez toucher chaque mois, une fois les crédits et les charges payés.">
                <Nombre valeur={f.objectif_mensuel} onChange={(v) => poser("objectif_mensuel", v.replace(/[^\d]/g, ""))} unite="€ / mois" placeholder="2 000" />
              </Champ>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Vos revenus nets annuels">
                  <Nombre valeur={f.revenus_annuels} onChange={(v) => poser("revenus_annuels", v.replace(/[^\d]/g, ""))} unite="€ / an" placeholder="55 000" />
                </Champ>
                <Champ label="Vos fonds propres">
                  <Nombre valeur={f.fonds_propres} onChange={(v) => poser("fonds_propres", v.replace(/[^\d]/g, ""))} unite="€" placeholder="60 000" />
                </Champ>
              </div>

              {/* Sans cette ligne, le plan supposerait toute la capacité d'emprunt
                  libre à quelqu'un qui est déjà au plafond : c'est la question qui
                  change le plus le résultat. */}
              <Champ label="Vos crédits en cours" aide="Ce que vous remboursez déjà chaque mois, immobilier compris. Mettez 0 si vous n'avez aucun crédit.">
                <Nombre valeur={f.charges_credit_mensuelles} onChange={(v) => poser("charges_credit_mensuelles", v.replace(/[^\d]/g, ""))} unite="€ / mois" placeholder="0" />
              </Champ>

              {Number(f.charges_credit_mensuelles) > 0 && (
                <Champ label="Dans combien d'années se terminent-ils ?" aide="Facultatif. Un crédit qui s'arrête vous rend d'un coup toute sa mensualité en capacité d'emprunt.">
                  <Nombre valeur={f.fin_credits_ans} onChange={(v) => poser("fin_credits_ans", v.replace(/[^\d]/g, "").slice(0, 2))} unite="ans" placeholder="8" />
                </Champ>
              )}

              <Champ label="Votre adresse" aide="Le numéro et la rue, pas seulement la ville : c'est autour de ce point que nous prenons les prix réels et les commerces en exemple.">
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-brume" />
                    <input value={f.quartier} onChange={(e) => poser("quartier", e.target.value)} placeholder="12 rue de la Paix, Saint-Nazaire"
                      className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
                  </div>
                  {suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                      {suggestions.map((s) => (
                        <li key={s}><button type="button" onClick={() => { poser("quartier", s); setSuggestions([]); }}
                          className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              </Champ>

              <Champ label="Votre horizon" aide="Sur combien d'années vous vous projetez.">
                <div className="flex flex-wrap gap-1.5">
                  {HORIZONS.map((h) => (
                    <button key={h} type="button" onClick={() => poser("horizon_ans", h)}
                      className={`flex-1 rounded-[10px] border py-2.5 text-[13px] transition-colors ${f.horizon_ans === h ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                      {h} ans
                    </button>
                  ))}
                </div>
              </Champ>

              <Champ label="Votre téléphone" aide="Facultatif. Seulement si vous préférez qu'on vous appelle.">
                <input value={f.telephone} onChange={(e) => poser("telephone", e.target.value)} placeholder="06 12 34 56 78"
                  className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
              </Champ>

              <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[12px] leading-[1.6] text-ardoise">
                <input type="checkbox" checked={f.consentement} onChange={(e) => poser("consentement", e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#96c0b8]" />
                <span>
                  J&apos;accepte que Klocka conserve ces informations pour me recontacter au sujet de ma feuille de route. Elles ne sont ni
                  revendues ni transmises. Vous pouvez demander leur suppression à tout moment à sourcing@klocka.immo.
                </span>
              </label>

              {envoyer.isError && <p className="m-0 mt-4 text-[13px] text-alerte">{envoyer.error.message}</p>}

              <button onClick={() => envoyer.mutate()} disabled={!pret || envoyer.isPending}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[13px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
                {envoyer.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Nous calculons votre feuille de route…</> : <>Voir ma feuille de route<ArrowRight className="h-4 w-4" /></>}
              </button>
              <p className="m-0 mt-3 text-center text-[11px] text-brume">Gratuit, sans engagement, et sans création de compte.</p>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11.5px] text-brume">
              {["Calculé sur votre capacité d'emprunt réelle", "Des commerces de votre quartier en exemple", "Toutes les hypothèses affichées"].map((t) => (
                <span key={t} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-menthe" />{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
