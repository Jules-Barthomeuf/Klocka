import React, { useEffect, useRef, useState } from "react";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { createPageUrl } from "@/utils";
import { CaseNom, CELLULES, ValeurModifiable, corpsDeLaSaisie, corpsDuChoix, useAnalysePieces, useGeste } from "@/components/preanalyse/AnalysePieces";
import JournalDetail from "@/components/preanalyse/JournalDetail";
import { OngletEquimmox, OngletFigaro, OngletSecteur } from "@/components/preanalyse/JournalSources";
import { OngletBodacc, OngletDvf } from "@/components/preanalyse/JournalPubliques";

// L'onglet Marché en grilles (29 oct. 2026, Jules, après avis) : trois questions de l'analyste plus la vacance,
// Loyer, Prix, Emplacement, Vacance, chacune un tableau comme Bail ou Quittances (Ligne / Ce qu'on y lit / Source /
// État / Notes). Les chiffres viennent de la lecture du marché gardée sur le lot (marche-reel.js) ; la case tranchée
// par l'analyste est gardée sous « marche.<ligne> » (analyse_pieces.cases), comme celles des pièces. Un clic sur la
// source ouvre à droite sa vue détaillée (les baux Equimmox, les ventes DVF, les annonces BODACC…).

// Pas de colonne Notes dans Marché (30 oct. 2026, Jules) : on corrige le chiffre dans la case, la source dit d'où il vient.
const COLONNES = "grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.2fr)]";
// Les outils que « Chercher » propose pour une ligne (30 oct. 2026, Jules) : un clic en lance un seul.
const A_RELIRE = {
  loyer_marche: ["equimmox", "data-b-valeur-locative", "valeur-locative"], loyer_moyen: ["equimmox"], reversion: ["equimmox", "data-b-valeur-locative"],
  prix_fai: ["equimmox", "data-b-valeur-locative"], ventes_reelles: ["dvf"], residentiel: ["figaro"],
  flux: ["data-b-implantation", "implantation"], vitalite: ["bodacc"], cessions: ["data-b-transactions", "bodacc-cessions"],
};

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const carte = (analyse, cle) => analyse?.cartes?.find((c) => c.cle === cle && c.valeur && c.valeur !== "—") || null;

function lignesDu(lot, analyse) {
  const l = lot || {};
  const equimmox = l.analyse_loyer || null;
  const implantation = l.implantation || null;
  const vitalite = l.vitalite_rue || null;
  const cessions = l.transactions_fonds || null;
  const figaro = l.prix_residentiel ? l.prix_residentiel.quartier || l.prix_residentiel.commune : null;
  const dvf = analyse?.parComparaison || null;
  const v = l.vacance || null;
  const deCarte = (cle) => { const c = carte(analyse, cle); return c ? { lu: c.valeur, detail: c.detail } : { lu: null, detail: null }; };
  const vac = (z) => (z && z.taux != null
    ? { lu: `${fmt(z.taux, 1)} %`, detail: `${z.vacants} vide${z.vacants > 1 ? "s" : ""} sur ${z.vacants + z.occupes} locaux tranchés${z.incertains ? `, ${z.incertains} incertain${z.incertains > 1 ? "s" : ""}` : ""}${z.fiable ? "" : " · trop peu de locaux pour un taux sûr"}` }
    : { lu: null, detail: null });
  const flux = implantation ? [implantation.flux_pieton?.note && `piéton ${implantation.flux_pieton.note.note}/${implantation.flux_pieton.note.sur}`, implantation.flux_voiture?.note && `voiture ${implantation.flux_voiture.note.note}/${implantation.flux_voiture.note.sur}`].filter(Boolean).join(" · ") : "";
  return [
    { titre: "Loyer", lignes: [
      { id: "loyer_place", libelle: "Loyer en place", ...deCarte("loyer-place"), source: { nom: "Bail et fiche", vue: "carte:loyer-place" } },
      { id: "loyer_marche", libelle: "Loyer de marché", ...deCarte("loyer-marche"), source: { nom: equimmox ? "Equimmox" : "Data-B", vue: equimmox ? "equimmox" : "secteur" } },
      { id: "loyer_moyen", libelle: "Baux comparables", ...deCarte("loyer-moyen"), source: { nom: "Equimmox", vue: "equimmox" } },
      { id: "reversion", libelle: "Écart au marché", ...deCarte("reversion"), source: { nom: "Calcul", vue: "carte:reversion" } },
    ] },
    { titre: "Prix", lignes: [
      { id: "prix_fai", libelle: "Prix demandé", ...deCarte("prix-fai"), source: { nom: "Calcul", vue: "carte:prix-fai" } },
      { id: "ventes_reelles", libelle: "Ventes réelles autour", lu: dvf ? `${fmt(dvf.prix_m2)} €/m² médian` : null, detail: dvf ? `${fmt(dvf.n)} vente${dvf.n > 1 ? "s" : ""} à ${fmt(dvf.rayon)} m${dvf.periode ? `, ${dvf.periode}` : ""}${dvf.demande_m2 ? ` · demandé ${fmt(dvf.demande_m2)} €/m²` : ""}` : null, source: { nom: "DVF", vue: "dvf" } },
      { id: "residentiel", libelle: "Résidentiel du quartier", lu: figaro?.prix?.median != null ? `${fmt(figaro.prix.median)} €/m² médian` : null, detail: figaro?.prix?.sur_1_an != null ? `${figaro.prix.sur_1_an > 0 ? "+" : ""}${fmt(figaro.prix.sur_1_an, 1)} % sur un an` : null, source: { nom: "Le Figaro", vue: "figaro" } },
    ] },
    { titre: "Emplacement", lignes: [
      { id: "flux", libelle: "Flux de passage", lu: flux || null, detail: implantation?.estime ? "estimé par Klocka" : null, source: { nom: implantation?.estime ? "Klocka" : "Data-B", vue: "secteur" } },
      { id: "vitalite", libelle: "Ouvertures et fermetures", lu: vitalite?.sur_la_rue ? `${fmt(vitalite.sur_la_rue.creations)} ouverture${vitalite.sur_la_rue.creations > 1 ? "s" : ""}, ${fmt(vitalite.sur_la_rue.fermetures)} fermeture${vitalite.sur_la_rue.fermetures > 1 ? "s" : ""}` : null, detail: vitalite?.mois ? `sur la rue, ${vitalite.mois} derniers mois` : null, source: { nom: "BODACC", vue: "bodacc" } },
      { id: "cessions", libelle: "Cessions de fonds", lu: cessions ? `${fmt(cessions.total ?? cessions.transactions?.length)} cession${(cessions.total ?? cessions.transactions?.length) > 1 ? "s" : ""}${cessions.marche?.prix_median ? `, médiane ${fmt(cessions.marche.prix_median)} €` : ""}` : null, detail: cessions?.rayon ? `dans un rayon de ${cessions.rayon}` : null, source: { nom: "BODACC", vue: "bodacc" } },
    ] },
    { titre: "Vacance", vacance: true, lignes: [
      { id: "vacance_autour", libelle: "Vacance autour", ...vac(v?.zone), detail: v?.zone ? `${vac(v.zone).detail}${v.zone.rayon_m ? ` · ${v.zone.rayon_m} m autour` : ""}` : v?.erreur_zone || null, source: { nom: "Outil Vacance", vue: "vacance" } },
      { id: "vacance_rue", libelle: "Vacance sur la rue", ...vac(v?.sur_la_rue), detail: v?.sur_la_rue ? `${vac(v.sur_la_rue).detail}${v.rue ? ` · ${v.rue}` : ""}` : v?.erreur_rue || null, source: { nom: "Outil Vacance", vue: "vacance" } },
    ] },
  ];
}

export default function GrilleMarche({ dossier, lot, analyse, onRefresh, apercu = false, onChercher = null, enCours = false }) {
  const dealId = dossier?.deal_id;
  const { data } = useAnalysePieces(dealId, { enabled: !apercu });
  const geste = useGeste(dealId);
  const [panneau, setPanneau] = useState(null);
  const cases = data?.cases_marche || {};
  const tableaux = lignesDu(lot, analyse);

  return (
    <div className="space-y-8">
      {tableaux.map((t) => (
        <section key={t.titre}>
          {/* Le nom du tableau dans la case vide en haut à gauche (29 oct. 2026, Jules) ; au téléphone, au-dessus. */}
          <div className={`flex flex-col items-center gap-1 px-2 pb-4 text-center lg:flex-row lg:justify-end lg:pb-3 ${t.vacance && !apercu ? "" : "lg:hidden"}`}>
            <p className="m-0 text-[20px] leading-[1.2] tracking-[-0.01em] text-encre lg:hidden">{t.titre}</p>
            {t.vacance && !apercu && <MesurerVacance dealId={dealId} dejaMesuree={!!lot?.vacance} le={lot?.vacance?.le} enFond={!!lot?.vacance_en_cours && Date.now() - Date.parse(lot.vacance_en_cours) < 15 * 60000} onFait={onRefresh} />}
          </div>
          <div className="overflow-hidden lg:rounded-[14px] lg:border lg:border-bord-doux">
            <div className={`grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3 lg:border-t-0 text-[13.5px] text-craie max-lg:hidden lg:[&>*]:py-3.5`}>
              <span className="text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-encre">{t.titre}</span><span>Valeur</span><span>Source</span>
            </div>
            {t.lignes.map((l) => {
              const humain = cases[l.id] || null;
              const tranchee = humain?.statut === "verifie" || humain?.statut === "corrige";
              const valeur = tranchee ? humain.valeur : l.lu;
              const statut = tranchee ? "verifie" : valeur ? "ia" : "introuvable";
              const chemin = `cases/marche/${l.id}`;
              return (
                <div key={l.id} className={`group/ligne grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3.5 transition-colors lg:[&>*]:py-3.5 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5`}>
                  <CaseNom libelle={l.libelle} etat={statut} par={humain?.par} valeur={valeur} occupe={geste.isPending}
                    onChoix={(id) => geste.mutate({ chemin, corps: corpsDuChoix(id, valeur, humain?.valeur_main || null) })} />
                  <ValeurModifiable valeur={valeur} vide={l.id.startsWith("vacance") ? "Pas encore mesurée" : analyse ? "Non trouvé" : "Marché pas encore lu"}
                    onEnregistrer={(v) => geste.mutate({ chemin, corps: corpsDeLaSaisie(v) })}
                    apres={<>
                      {/* Le détail reste quel que soit l'état : vérifier ne change que la couleur, pas la hauteur (30 oct. 2026, Jules). */}
                      {l.detail && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-craie">{l.detail}</p>}
                      {/* « Chercher » : relit les seules sources de la ligne ; toujours là sur une case vide, au survol sinon. */}
                      {onChercher && !apercu && A_RELIRE[l.id] && (
                        <MenuChercher outils={A_RELIRE[l.id]} enCours={enCours} visible={!valeur}
                          onChoisir={(cle) => { if (tranchee) geste.mutate({ chemin, corps: { action: "reinitialiser" } }); onChercher([cle]); }} />
                      )}
                    </>} />
                  <div className="min-w-0">
                    <button type="button" onClick={() => setPanneau(l.source.vue)} className="text-left text-[13px] text-encre underline decoration-bord-vif underline-offset-[3px] hover:decoration-encre" style={{ background: "transparent" }}>{l.source.nom}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {panneau && <PanneauSource vue={panneau} lot={lot} analyse={analyse} onChoisir={setPanneau} onFermer={() => setPanneau(null)} />}
    </div>
  );
}

/** « Mesurer la vacance » : l'outil Vacance sur l'adresse du lot. La commune qui se recense se redemande seule. */
function MesurerVacance({ dealId, dejaMesuree, le, enFond = false, onFait }) {
  // Mesurée en même temps que la lecture du marché, côté serveur : on relit le dossier jusqu'au résultat.
  useEffect(() => {
    if (!enFond) return undefined;
    const t = setInterval(() => onFait?.(), 15000);
    return () => clearInterval(t);
  }, [enFond, onFait]);
  const queryClient = useQueryClient();
  const essais = useRef(0);
  const [attente, setAttente] = useState(false);
  const mesurer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/vacance`),
    onSuccess: (r) => {
      if (r.etat === "chargement" && essais.current < 30) {
        essais.current += 1;
        setAttente(true);
        setTimeout(() => mesurer.mutate(), 15000);
        return;
      }
      setAttente(false);
      essais.current = 0;
      if (r.etat === "chargement") { toast.error("La commune se recense encore : réessayez dans quelques minutes."); return; }
      queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] });
      onFait?.();
    },
    onError: (e) => { setAttente(false); essais.current = 0; toast.error(e?.message || "La vacance ne se mesure pas"); },
  });
  const occupe = mesurer.isPending || attente || enFond;
  return (
    <div className="flex items-center gap-2">
      {le && !occupe && <span className="text-[12px] text-brume">mesurée le {new Date(le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
      <button type="button" onClick={() => { essais.current = 0; mesurer.mutate(); }} disabled={occupe}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-menthe px-3.5 text-[12.5px] text-encre transition-colors hover:bg-menthe/[0.08] disabled:opacity-70" style={{ background: "transparent" }}>
        {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {attente ? "La commune se recense…" : mesurer.isPending || enFond ? "Mesure en cours…" : dejaMesuree ? "Mesurer à nouveau" : "Mesurer la vacance"}
      </button>
    </div>
  );
}

/** La vue détaillée d'une source, à droite, comme la page d'une pièce ; Échap ou un clic ailleurs la ferme. */
function PanneauSource({ vue, lot, analyse, onChoisir, onFermer }) {
  const zone = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    const ailleurs = (e) => { if (zone.current && !zone.current.contains(e.target) && !e.target.closest?.("[role=dialog], [data-sonner-toaster]")) onFermer(); };
    window.addEventListener("keydown", k);
    document.addEventListener("pointerdown", ailleurs);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("pointerdown", ailleurs); };
  }, [onFermer]);
  const v = lot?.vacance;
  const contenu = vue.startsWith("carte:")
    ? (analyse?.details?.[vue.slice(6)]
      ? <JournalDetail cartes={analyse.cartes} details={analyse.details} cle={vue.slice(6)} onChoisir={(cle) => onChoisir(`carte:${cle}`)} onRetour={onFermer} titre="Fermer" />
      : <Vide />)
    : vue === "equimmox" ? <OngletEquimmox lot={lot} />
    : vue === "secteur" ? <OngletSecteur lot={lot} implantation={analyse?.emplacement} />
    : vue === "figaro" ? <OngletFigaro lot={lot} />
    : vue === "dvf" ? (analyse?.dvf ? <OngletDvf ventes={analyse.dvf} /> : <Vide />)
    : vue === "bodacc" ? (analyse?.vitalite ? <OngletBodacc vitalite={analyse.vitalite} /> : <Vide />)
    : vue === "vacance" ? (
      v ? (
        <div className="space-y-3 text-[13.5px] leading-[1.6] text-encre">
          <p className="m-0 text-[20px] leading-[1.2]">Vacance locative</p>
          <p className="m-0 text-craie">{v.adresse}</p>
          {[["Autour", v.zone, v.zone?.rayon_m ? `${v.zone.rayon_m} m` : null], ["Sur la rue", v.sur_la_rue, v.rue]].map(([t, z, ou]) => (
            <div key={t} className="rounded-[14px] border border-bord-doux px-4 py-3">
              <p className="m-0 text-craie">{t}{ou ? ` · ${ou}` : ""}</p>
              {z ? <p className="m-0 mt-1">{fmt(z.taux, 1) ?? "—"} % · {z.vacants} vides, {z.occupes} occupés, {z.incertains} incertains sur {z.locaux} locaux{z.fiable ? "" : " (trop peu pour un taux sûr)"}</p> : <p className="m-0 mt-1 text-craie">Pas de mesure.</p>}
            </div>
          ))}
          <p className="m-0 text-[12.5px] text-craie">Mesurée le {new Date(v.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} par l'outil Vacance : registre des entreprises (BODACC, SIRENE), OpenStreetMap, et Google Maps pour les locaux que le registre dit vides.</p>
          <a href={createPageUrl("Outils")} className="inline-block text-[13px] text-menthe hover:underline">Ouvrir l'outil Vacance</a>
        </div>
      ) : <Vide texte="La vacance n'est pas encore mesurée : « Mesurer la vacance » au-dessus du tableau." />
    )
    : <Vide />;
  return createPortal(
    <div ref={zone} className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-[60] flex w-full flex-col overflow-y-auto overscroll-contain border-l border-bord bg-fond p-6 shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[760px] max-md:p-4 max-md:pt-[max(16px,env(safe-area-inset-top))]">
      <button type="button" onClick={onFermer} className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine/90 text-ardoise shadow-[0_6px_18px_rgb(0_0_0/0.18)] hover:text-encre" aria-label="Fermer" title="Fermer (Échap)"><X className="h-4 w-4" /></button>
      {contenu}
    </div>,
    document.body,
  );
}

const Vide = ({ texte = "Cette source n'a rien donné pour ce lot : relisez le marché." }) => <p className="m-0 py-10 text-center text-[13.5px] text-craie">{texte}</p>;

// Les outils qu'on peut interroger pour une ligne, avec ce qu'ils lisent et ce qu'ils coûtent en temps.
const OUTILS = {
  equimmox: ["Equimmox · baux signés autour", "environ 1 min"],
  "data-b-valeur-locative": ["Data-B · valeur locative de la rue", "quelques secondes"],
  "valeur-locative": ["Equimmox · valeur du secteur", "environ 4 min"],
  dvf: ["DVF · ventes enregistrées", "gratuit"],
  figaro: ["Le Figaro · prix du résidentiel", "quelques secondes"],
  "data-b-implantation": ["Data-B · étude d'implantation", "un crédit"],
  implantation: ["Klocka · étude d'implantation", "gratuit"],
  bodacc: ["BODACC · ouvertures et fermetures", "gratuit"],
  "data-b-transactions": ["Data-B · cessions de fonds", "quelques secondes"],
  "bodacc-cessions": ["BODACC · cessions de fonds", "gratuit"],
};

/**
 * « Chercher » ouvre la liste des outils qui savent répondre à la ligne (30 oct. 2026, Jules : « aller chercher une
 * valeur dans un outil ») : un clic lance cet outil seul, sa lecture arrive dans la case avec lui comme source.
 */
function MenuChercher({ outils, enCours, visible, onChoisir }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useFermerAuClicAilleurs(ouvert, () => setOuvert(false));
  return (
    <div ref={zone} className="relative mt-1">
      <button type="button" disabled={enCours} onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }} aria-expanded={ouvert}
        className={`inline-flex items-center gap-1 text-[12.5px] text-menthe transition-opacity hover:underline disabled:opacity-40 ${visible || ouvert ? "" : "opacity-0 focus-visible:opacity-100 group-hover/ligne:opacity-100 max-md:opacity-100"}`} style={{ background: "transparent" }}>
        <Search className="h-3 w-3" /> {enCours ? "Recherche en cours" : "Chercher"}
      </button>
      {ouvert && !enCours && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] overflow-hidden rounded-[14px] border border-bord-doux bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.3)]">
          {outils.map((cle) => (
            <button key={cle} type="button" onClick={(e) => { e.stopPropagation(); setOuvert(false); onChoisir(cle); }}
              className="flex w-full items-baseline justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-[13px] text-encre transition-colors hover:bg-rail-actif" style={{ background: "transparent" }}>
              <span className="min-w-0">{OUTILS[cle]?.[0] || cle}</span>
              <span className="flex-none text-[11.5px] text-brume">{OUTILS[cle]?.[1] || ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
