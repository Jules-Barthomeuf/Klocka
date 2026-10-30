import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { createPageUrl } from "@/utils";
import { CaseNom, CELLULES, corpsDeLaSaisie, corpsDuChoix, useAnalysePieces, useGeste } from "@/components/preanalyse/AnalysePieces";
import TexteEnPlace from "@/components/ui/texte-en-place";
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
const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const carte = (analyse, cle) => analyse?.cartes?.find((c) => c.cle === cle && c.valeur && c.valeur !== "—") || null;
const niveau = (x) => (x ? [["rue", x.rue], ["quartier", x.quartier], ["ville", x.ville]].find(([, v]) => v && (v.basse != null || v.haute != null)) || null : null);
const milieu = (v) => (v.basse != null && v.haute != null ? (v.basse + v.haute) / 2 : v.basse ?? v.haute ?? null);
// Un chiffre tapé (« 180 €/m²/an », « 150 à 210 ») : le premier nombre, ou le milieu d'une fourchette.
const nombreTape = (t) => {
  const ns = String(t || "").replace(/[\u00a0\u202f]/g, " ").replace(/(\d) (?=\d{3}\b)/g, "$1").match(/\d+(?:[.,]\d+)?/g);
  if (!ns?.length) return null;
  const v = ns.slice(0, 2).map((x) => Number(x.replace(",", ".")));
  return /\sà\s|\d\s*[-–]\s*\d/.test(String(t)) && v.length === 2 ? (v[0] + v[1]) / 2 : v[0];
};
const champ = (c) => (c && typeof c === "object" && "valeur" in c ? (c.absent === false || c.absent == null ? c.valeur : null) : c ?? null);
const fourchette = (v, unite) => (v.basse != null && v.haute != null ? `${fmt(v.basse)} à ${fmt(v.haute)} ${unite}` : `${fmt(v.basse ?? v.haute)} ${unite}`);

/**
 * Chaque question du Marché, avec ses sources (30 oct. 2026, Jules : « loyer de marché, une ligne Equimmox, une ligne
 * Data-B… juste la valeur, le détail dans un panneau ») : une source = { cle (pour la demander), nom, valeur, detail,
 * vue (son panneau) }. Une source nouvelle (un outil Klocka) s'ajoute ici, à la question qu'elle sait renseigner.
 */
function lignesDu(lot, analyse) {
  const l = lot || {};
  const eq = l.analyse_loyer || null;
  const secteur = niveau(l.valeur_locative);
  const datab = niveau(l.valeur_locative_data_b);
  const implantation = l.implantation || null;
  const vitalite = l.vitalite_rue || null;
  const cessions = l.transactions_fonds || null;
  const figaro = l.prix_residentiel ? l.prix_residentiel.quartier || l.prix_residentiel.commune : null;
  const dvf = analyse?.parComparaison || null;
  const v = l.vacance || null;
  const deCarte = (cle) => { const c = carte(analyse, cle); return { valeur: c?.valeur || null, detail: c?.detail || null }; };
  const vac = (z, ou) => (z && z.taux != null
    ? { valeur: `${fmt(z.taux, 1)} %`, detail: `${z.vacants} vide${z.vacants > 1 ? "s" : ""} sur ${z.vacants + z.occupes} locaux tranchés${z.incertains ? `, ${z.incertains} incertain${z.incertains > 1 ? "s" : ""}` : ""}${ou ? ` · ${ou}` : ""}${z.fiable ? "" : " · trop peu de locaux pour un taux sûr"}` }
    : { valeur: null, detail: null });
  const flux = implantation ? [implantation.flux_pieton?.note && `piéton ${implantation.flux_pieton.note.note}/${implantation.flux_pieton.note.sur}`, implantation.flux_voiture?.note && `voiture ${implantation.flux_voiture.note.note}/${implantation.flux_voiture.note.sur}`].filter(Boolean).join(" · ") : "";
  return [
    { titre: "Loyer", lignes: [
      { id: "loyer_place", libelle: "Loyer en place", sources: [{ nom: "Bail et fiche", vue: "carte:loyer-place", ...deCarte("loyer-place") }] },
      { id: "loyer_marche", libelle: "Loyer de marché", sources: [
        { cle: "equimmox", nom: "Equimmox · baux", vue: "equimmox", n: eq?.moyenne ?? null, valeur: eq?.moyenne != null ? `${fmt(eq.moyenne)} €/m²/an` : null,
          detail: eq ? `Moyenne des baux${eq.rayon ? ` · rayon ${eq.rayon}` : ""}${eq.surface_min ? ` · ${eq.surface_min} à ${eq.surface_max} m²` : ""}${eq.bas != null ? ` · de ${fmt(eq.bas)} à ${fmt(eq.haut)} €/m²/an` : ""}` : null },
        { cle: "valeur-locative", nom: "Equimmox · secteur", vue: "secteur", n: secteur ? milieu(secteur[1]) : null, valeur: secteur ? fourchette(secteur[1], "€/m²/an") : null, detail: secteur ? `Valeur locative à l'échelle ${secteur[0] === "ville" ? "de la ville" : `${secteur[0] === "rue" ? "de la" : "du"} ${secteur[0]}`}` : null },
        { cle: "data-b-valeur-locative", nom: "Data-B", vue: "secteur", n: datab ? milieu(datab[1]) : null, valeur: datab ? fourchette(datab[1], "€/m²/an") : null, detail: datab ? `Estimation Data-B à l'échelle ${datab[0] === "ville" ? "de la ville" : `${datab[0] === "rue" ? "de la" : "du"} ${datab[0]}`}${datab[1].nom ? ` (${datab[1].nom})` : ""}` : null },
      ] },
      { id: "reversion", libelle: "Écart au marché", sources: [{ nom: "Calcul", vue: "carte:reversion", ...deCarte("reversion") }] },
    ] },
    { titre: "Prix", lignes: [
      { id: "prix_fai", libelle: "Prix demandé", sources: [{ nom: "Calcul", vue: "carte:prix-fai", ...deCarte("prix-fai") }] },
      { id: "ventes_reelles", libelle: "Ventes réelles autour", sources: [{ cle: "dvf", nom: "DVF", vue: "dvf", valeur: dvf ? `${fmt(dvf.prix_m2)} €/m²` : null, detail: dvf ? `Médiane de ${fmt(dvf.n)} vente${dvf.n > 1 ? "s" : ""} à ${fmt(dvf.rayon)} m${dvf.periode ? `, ${dvf.periode}` : ""}${dvf.demande_m2 ? ` · demandé ${fmt(dvf.demande_m2)} €/m²` : ""}` : null }] },
      { id: "residentiel", libelle: "Résidentiel du quartier", sources: [{ cle: "figaro", nom: "Le Figaro", vue: "figaro", valeur: figaro?.prix?.median != null ? `${fmt(figaro.prix.median)} €/m²` : null, detail: figaro?.prix?.sur_1_an != null ? `Prix médian des appartements · ${figaro.prix.sur_1_an > 0 ? "+" : ""}${fmt(figaro.prix.sur_1_an, 1)} % sur un an` : null }] },
    ] },
    { titre: "Emplacement", lignes: [
      { id: "flux", libelle: "Flux de passage", sources: [
        { cle: "data-b-implantation", nom: "Data-B", vue: "secteur", valeur: implantation && !implantation.estime ? flux || null : null, detail: "Étude d'implantation Data-B" },
        { cle: "implantation", nom: "Klocka", vue: "secteur", valeur: implantation?.estime ? flux || null : null, detail: "Étude d'implantation estimée par Klocka" },
      ] },
      { id: "vitalite", libelle: "Ouvertures et fermetures", sources: [{ cle: "bodacc", nom: "BODACC", vue: "bodacc", valeur: vitalite?.sur_la_rue ? `${fmt(vitalite.sur_la_rue.creations)} / ${fmt(vitalite.sur_la_rue.fermetures)}` : null, detail: vitalite?.mois ? `Ouvertures / fermetures sur la rue, ${vitalite.mois} derniers mois` : null }] },
      { id: "cessions", libelle: "Cessions de fonds", sources: [{ cle: "bodacc-cessions", nom: "BODACC", vue: "bodacc", valeur: cessions ? `${fmt(cessions.total ?? cessions.transactions?.length)}${cessions.marche?.prix_median ? ` · ${fmt(cessions.marche.prix_median)} €` : ""}` : null, detail: cessions ? `Cessions${cessions.rayon ? ` dans un rayon de ${cessions.rayon}` : ""}${cessions.marche?.prix_median ? ", prix médian" : ""}` : null }] },
    ] },
    { titre: "Vacance", vacance: true, lignes: [
      { id: "vacance_autour", libelle: "Vacance autour", sources: [{ nom: "Outil Vacance", vue: "vacance", ...vac(v?.zone, v?.zone?.rayon_m ? `${v.zone.rayon_m} m autour` : null) }] },
      { id: "vacance_rue", libelle: "Vacance sur la rue", sources: [{ nom: "Outil Vacance", vue: "vacance", ...vac(v?.sur_la_rue, v?.rue) }] },
    ] },
  ];
}

/**
 * L'écart entre le loyer en place et le loyer de marché, en %. Le loyer de marché au m² : la valeur de l'analyste s'il
 * en a écrit une, sinon la première source cochée qui en donne un (Equimmox baux, Equimmox secteur, Data-B), fois la
 * surface. Le loyer en place : la valeur de l'analyste, sinon le dossier, sinon les pièces (quittances, bail). Sans
 * l'un des trois, la case dit ce qui manque.
 */
export function ecartAuMarche(tableaux, cases = {}, lot = null, pieces = null) {
  const lignes = tableaux.flatMap((t) => t.lignes);
  const marche = lignes.find((x) => x.id === "loyer_marche");
  const hM = cases.loyer_marche || null;
  const exclues = new Set(hM?.exclues || []);
  const tapeM = nombreTape(hM?.valeur_main || (hM?.statut === "corrige" ? hM.valeur : null));
  const source = marche?.sources.find((x) => x.n != null && !exclues.has(x.nom));
  const parM2 = tapeM || source?.n || null;
  const hP = cases.loyer_place || null;
  const enPlace = nombreTape(hP?.valeur_main || (hP?.statut === "corrige" ? hP.valeur : null))
    || Number(champ(lot?.lot?.loyer_annuel_ht_hc)) || Number(pieces?.loyerInitialHTHC) || null;
  const surface = Number(champ(lot?.lot?.surface_m2)) || Number(pieces?.surface) || null;
  const manque = [!enPlace && "le loyer en place", !parM2 && "le loyer de marché", !surface && "la surface"].filter(Boolean);
  if (manque.length) return { valeur: null, detail: null, vide: `Il manque ${manque.join(", ")}` };
  const auMarche = Math.round(parM2 * surface);
  const r = (enPlace - auMarche) / auMarche;
  const pct = `${r > 0 ? "+" : ""}${fmt(r * 100, 0)} %`;
  return {
    valeur: `${Math.abs(r) <= 0.1 ? "Au marché" : r > 0 ? "Au-dessus du marché" : "Sous le marché"} · ${pct}`,
    detail: `${fmt(enPlace)} €/an en place contre ${fmt(auMarche)} €/an au marché (${fmt(parM2)} €/m²/an × ${fmt(surface)} m², ${tapeM ? "votre valeur" : source.nom})`,
  };
}

/** Le prix FAI du lot (honoraires en sus ajoutés) et son prix au m², sur la surface du lot ou celle lue dans les pièces. */
export function prixDemande(lot, pieces = null) {
  const l = lot?.lot || {};
  const affiche = Number(champ(l.prix_fai)) || null;
  if (!affiche) return null;
  const enSus = champ(l.honoraires_inclus) === false ? Number(champ(l.montant_honoraires)) || 0 : 0;
  const prix = affiche + enSus;
  const surface = Number(champ(l.surface_m2)) || Number(pieces?.surface) || null;
  return {
    valeur: surface ? `${fmt(prix)} € · ${fmt(prix / surface)} €/m²` : `${fmt(prix)} €`,
    detail: surface ? `${fmt(prix)} € FAI${enSus ? " (honoraires en sus ajoutés)" : ""} sur ${fmt(surface)} m²` : "Surface inconnue : pas de prix au m²",
  };
}

export default function GrilleMarche({ dossier, lot, analyse, onRefresh, apercu = false, onChercher = null, enCours = false }) {
  const dealId = dossier?.deal_id;
  const { data } = useAnalysePieces(dealId, { enabled: !apercu });
  const geste = useGeste(dealId);
  const [panneau, setPanneau] = useState(null);
  const cases = data?.cases_marche || {};
  const tableaux = lignesDu(lot, analyse);
  // L'écart au marché, calculé sur ce que le tableau montre (30 oct. 2026, Jules : « il faut que ça fonctionne ») : il
  // ne dépend plus de l'ancienne lecture du marché, souvent absente.
  const ecart = ecartAuMarche(tableaux, cases, lot, data?.simulateur?.valeurs);
  if (ecart) {
    const ligne = tableaux[0].lignes.find((x) => x.id === "reversion");
    ligne.sources = [{ ...ligne.sources[0], valeur: ecart.valeur, detail: ecart.detail, vide: ecart.vide }];
    // Le détail du calcul ouvre l'ancienne carte seulement si la lecture du marché l'a posée.
    if (!ecart.valeur || !carte(analyse, "reversion")) ligne.sources[0].vue = null;
  }
  // Le prix demandé, avec son prix au m² (30 oct. 2026, Jules) ; le jugement de l'ancienne lecture passe en détail.
  const prix = prixDemande(lot, data?.simulateur?.valeurs);
  if (prix) {
    const ligne = tableaux[1].lignes.find((x) => x.id === "prix_fai");
    const c = carte(analyse, "prix-fai");
    ligne.sources = [{ ...ligne.sources[0], valeur: prix.valeur, detail: [prix.detail, c && c.valeur !== prix.valeur ? `${c.valeur} · ${c.detail}` : null].filter(Boolean).join(" · "), vue: c ? "carte:prix-fai" : null }];
  }

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
              const exclues = new Set(humain?.exclues || []);
              const actives = l.sources.filter((x) => x.valeur && !exclues.has(x.nom));
              const maValeur = humain?.valeur_main || (humain?.statut === "corrige" ? humain.valeur : null);
              const tranchee = humain?.statut === "verifie" || humain?.statut === "corrige";
              const valeur = maValeur || actives[0]?.valeur || null;
              const statut = tranchee ? "verifie" : valeur ? "ia" : "introuvable";
              const chemin = `cases/marche/${l.id}`;
              return (
                <div key={l.id} className={`group/ligne grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3.5 transition-colors lg:[&>*]:py-3.5 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5`}>
                  <CaseNom libelle={l.libelle} etat={statut} par={humain?.par} valeur={valeur} occupe={geste.isPending}
                    onChoix={(id) => geste.mutate({ chemin, corps: corpsDuChoix(id, valeur, humain?.valeur_main || null) })} />
                  {/* Une ligne par source, la valeur seule à gauche, la source à droite (30 oct. 2026, Jules) ; décochée,
                      elle reste là, grisée, et ne compte plus. Le détail s'ouvre en cliquant sur son nom. */}
                  <div className="min-w-0 space-y-1.5 lg:col-span-2 lg:col-start-2 lg:row-start-1 lg:!px-0">
                    {l.sources.map((src) => {
                      const off = exclues.has(src.nom);
                      return (
                        <div key={src.nom} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-baseline ${off ? "opacity-40" : ""}`}>
                          <div className="min-w-0 lg:px-3.5">
                            {src.valeur ? <span className={`text-[14.5px] text-encre ${off ? "line-through" : ""}`}>{src.valeur}</span>
                              : src.cle && onChercher && !apercu ? (
                                <button type="button" disabled={enCours} onClick={() => onChercher([src.cle])} className="text-[13px] text-menthe hover:underline disabled:opacity-50" style={{ background: "transparent" }}>{enCours ? "Recherche en cours…" : "Demander"}</button>
                              ) : <span className="text-[14.5px] text-brume">{src.vide || (l.id.startsWith("vacance") ? "Pas encore mesurée" : "—")}</span>}
                          </div>
                          <div className="flex min-w-0 items-center gap-2 lg:px-3.5">
                            {l.sources.length > 1 && !apercu && (
                              <button type="button" role="checkbox" aria-checked={!off} aria-label={`${off ? "Recocher" : "Décocher"} ${src.nom}`}
                                onClick={() => geste.mutate({ chemin, corps: { action: "exclure", source: src.nom } })}
                                className={`grid h-3.5 w-3.5 flex-none place-items-center rounded-[4px] border ${off ? "border-bord-vif" : "border-menthe bg-menthe text-sur-menthe"}`}>
                                {!off && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                              </button>
                            )}
                            <button type="button" onClick={() => setPanneau(src.vue)} title={src.detail || undefined}
                              className="min-w-0 truncate text-left text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>{src.nom}</button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Ma valeur : la source de l'analyste, toujours la dernière ; l'écrire la retient (la ligne passe en vert). */}
                    {!apercu && (
                      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-baseline">
                        <div className="min-w-0 lg:px-3.5">
                          <TexteEnPlace valeur={maValeur || ""} placeholder="Écrire une valeur"
                            onEnregistrer={(t2) => { if (t2) geste.mutate({ chemin, corps: corpsDeLaSaisie(t2) }); }}
                            className="text-[14.5px] text-encre placeholder:text-transparent focus:placeholder:text-brume group-hover/ligne:placeholder:text-brume max-md:text-[16px] max-md:placeholder:text-brume" />
                        </div>
                        <div className="min-w-0 lg:px-3.5">
                          <span className={`text-[13px] ${maValeur ? "text-craie" : "text-brume opacity-0 group-hover/ligne:opacity-100 max-md:opacity-100"}`}>Ma valeur</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Le trait avant la colonne Source, d'un seul tenant sur toute la hauteur de la ligne (30 oct. 2026, Jules :
                      « une ligne continue par tableau ») : posé dans la colonne de la grille, il tombe sous celui de l'en-tête. */}
                  <span aria-hidden className="pointer-events-none hidden lg:col-start-3 lg:row-start-1 lg:block" />
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

