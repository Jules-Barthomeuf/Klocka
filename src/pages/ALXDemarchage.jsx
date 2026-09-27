import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Car, Check, ChevronRight, Loader2, Mail, MapPin, Newspaper, Phone,
  Scissors, Search, Send, Shirt, ShoppingBasket, Sofa, Sparkles, Store, Truck,
  UtensilsCrossed, X,
} from "lucide-react";
import { toast } from "@/components/ui/avis";
import { Bouton, euros, joliNom, Nombre, TEINTES, Urgence } from "@/components/alx/alx-commun";
import CarteMurs from "@/components/alx/CarteMurs";
import { ceQueFait, urlStreetView } from "@/components/alx/fiche-commerce";

// ALX, côté résultat, dans le registre visuel de l'atelier (Figtree + capitales
// Montserrat, halo posé par le Layout, surfaces de verre). On ne lance rien
// ici : on demande à l'assistant, dans Google Chat, « prospecte Cannes », et
// il fait tout (rues commerçantes, commerces, propriétaires, gérants dans
// Apollo, messages). Cette page montre ce qu'il a trouvé, société par
// société, avec le message à envoyer. Rien ne part sans un clic.

const etiq = "m-0 text-[11px] tracking-[.16em] uppercase text-ardoise";
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const annee = (iso) => (iso ? String(iso).slice(0, 4) : "");
const nf = new Intl.NumberFormat("fr-FR");

const ETATS = {
  a_preparer: ["À préparer", "border-bord text-ardoise"],
  non_demarchable: ["Non démarchable", "border-bord text-brume"],
  pret: ["Message prêt", "border-menthe/50 text-menthe"],
  envoye: ["Envoyé", "border-menthe/50 text-menthe"],
  simule: ["Simulé", "border-bord text-brume"],
  relance_prete: ["Relance à valider", "border-[#E8B278]/50 text-[#E8B278]"],
  relance_envoyee: ["Relancé", "border-menthe/50 text-menthe"],
  repondu: ["A répondu", "border-menthe bg-menthe/15 text-encre"],
  appele: ["Appelé", "border-menthe/50 text-menthe"],
  en_discussion: ["En discussion", "border-menthe bg-menthe/15 text-encre"],
  refus: ["Pas vendeur", "border-alerte/40 text-alerte"],
};
const DEJA_DEMARCHE = new Set(["pret", "envoye", "simule", "relance_prete", "relance_envoyee", "repondu", "appele", "en_discussion", "refus"]);

// Une icône par catégorie d'activité (server/deal/data/activites.json).
const ICONES_CATEGORIE = {
  alimentaire: ShoppingBasket, restauration: UtensilsCrossed, restauration_rapide_kebab: UtensilsCrossed,
  pret_a_porter: Shirt, beaute: Scissors, sante_commerce: Sparkles, services: Building2,
  equipement_maison: Sofa, sport_loisirs: Sparkles, automobile: Car, tabac_presse: Newspaper,
  bureaux: Building2, logistique: Truck,
};
const iconeDe = (categorie) => ICONES_CATEGORIE[categorie] || Store;

function Etat({ etat }) {
  const [mot, classe] = ETATS[etat] || [etat || "", "border-bord text-ardoise"];
  return mot ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${classe}`}>{mot}</span> : null;
}

function Depuis({ d }) {
  if (!d?.date) return <span className="text-brume">—</span>;
  return <span title={d.source}>{d.source?.startsWith("création") ? `au plus tard ${annee(d.date)}` : annee(d.date)}</span>;
}

// ---------------------------------------------------------------------------
// Les points animés : « Connexion à l'API Apollo… »
// ---------------------------------------------------------------------------

function Points() {
  return (
    <span className="inline-flex gap-[3px]">
      {[0, 0.18, 0.36].map((d) => <span key={d} className="alx-vague h-[5px] w-[5px] rounded-full bg-menthe" style={{ animationDelay: `${d}s` }} />)}
    </span>
  );
}

// La fenêtre centrale pendant l'enrichissement : deux étapes, l'une après l'autre.
function PopupEnrichissement({ travail, onFini }) {
  const etapes = [
    ["apollo", "Connexion à l'API Apollo", travail?.recherches ? `${travail.recherches} gérant${travail.recherches > 1 ? "s" : ""} cherché${travail.recherches > 1 ? "s" : ""}` : null],
    ["messages", "Écriture des messages", travail?.messages ? `${travail.messages} message${travail.messages > 1 ? "s" : ""} rédigé${travail.messages > 1 ? "s" : ""}` : null],
  ];
  const rang = { apollo: 0, messages: 1, fini: 2, erreur: 2 }[travail?.etat] ?? 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-fond/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="alx-entree w-full max-w-[420px] rounded-[20px] border border-trait bg-surface p-7 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <p className={etiq}>Enrichissement et démarchage</p>
        <ul className="m-0 mt-5 flex list-none flex-col gap-4 p-0">
          {etapes.map(([cle, mot, detail], i) => {
            const fait = rang > i || travail?.etat === "fini";
            const encours = rang === i && travail?.etat !== "fini" && travail?.etat !== "erreur";
            return (
              <li key={cle} className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border ${fait ? "border-menthe bg-menthe text-sur-menthe" : encours ? "border-menthe text-menthe" : "border-bord text-brume"}`}>
                  {fait ? <Check className="h-3.5 w-3.5" /> : encours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div>
                  <p className={`m-0 text-[14px] ${fait || encours ? "text-encre" : "text-brume"}`}>{mot}{encours ? <span className="ml-1.5"><Points /></span> : null}</p>
                  {detail && <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {travail?.etat === "erreur" && <p className="m-0 mt-5 rounded-[12px] border border-alerte/40 px-3.5 py-2.5 text-[13px] text-alerte">{travail.erreur}</p>}
        {(travail?.etat === "fini" || travail?.etat === "erreur") && (
          <div className="mt-6 flex justify-end">
            <Bouton principal onClick={onFini}>Voir le résultat</Bouton>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Un commerce en carte, et sa fiche (adresse, carte)
// ---------------------------------------------------------------------------

function CarteCommerce({ m, onOuvrir }) {
  const Icone = iconeDe(m.categorie_activite);
  return (
    <button type="button" onClick={onOuvrir} className="group flex flex-col items-start gap-2.5 rounded-[16px] border border-trait bg-surface p-4 text-left transition-colors hover:border-menthe/50">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-trait text-ardoise group-hover:border-menthe/50 group-hover:text-menthe"><Icone className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0">
        <p className="m-0 truncate text-[13.5px] font-medium text-encre">{joliNom(m.enseigne) || "Local commercial"}</p>
        <p className="m-0 mt-0.5 truncate text-[12px] text-ardoise">{m.activite || "Activité à qualifier"}</p>
      </div>
    </button>
  );
}

const VERDICTS = {
  appeler: ["Va vendre", TEINTES.ecrire],
  ecrire: ["Vendra un jour", TEINTES.ecrire],
  surveiller: ["Peu de chances pour l'instant", TEINTES.appeler],
  ecartee: ["Écartée", TEINTES.muet],
};
const pourcent = (x) => (x == null ? "—" : `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`);
const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// La fiche d'un commerce, dans le panneau de sa société : la façade dans
// Street View, puis ce que dit la fiche complète (le commerce, va vendre ou
// pas, loyer, prix, la dernière vente). Pas d'autre fenêtre à ouvrir.
function DetailCommerce({ m, onRetour, retour }) {
  const { data: c, refetch } = useQuery({ queryKey: ["alx-cible", m.cible_id], queryFn: () => base44.request("GET", `/api/alx/cibles/${m.cible_id}`) });
  // Le point de vue face à la vitrine, calculé une fois puis gardé : sans
  // lui, Street View s'ouvre au hasard dans la rue.
  const sansVue = !!c && !c.vue?.pano && !c.photo?.pano && c.lat != null && c.lon != null;
  useEffect(() => {
    if (!sansVue) return;
    base44.request("POST", `/api/alx/cibles/${m.cible_id}/vue`, { body: {} }).then(() => refetch()).catch(() => {});
  }, [m.cible_id, sansVue, refetch]);
  const x = c || { ...m, id: m.cible_id };
  const v = x.valorisation || {};
  const ml = x.score_ml?.tranche ? x.score_ml : null;
  const [verdict, teinte] = VERDICTS[x.pile] || VERDICTS.surveiller;
  const raisons = ml?.raisons?.length ? ml.raisons.filter((r) => r.sens > 0).map((r) => r.phrase)
    : [...(x.signaux?.forts || []), ...(x.signaux?.patients || [])].map((r) => r.libelle + (r.valeur ? ` (${r.valeur})` : ""));
  const loyer = v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—";
  const prix = v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : v.fourchette_estimee ? `~ ${euros(v.fourchette_estimee[0])} – ${euros(v.fourchette_estimee[1])}` : "—";
  const surface = v.surface ? `${v.surface} m²` : v.surface_estimee ? `${v.surface_estimee[0]}–${v.surface_estimee[1]} m², estimée` : null;
  return (
    <div className="alx-entree">
      <button type="button" onClick={onRetour} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>← {retour}</button>
      <p className={`${etiq} mt-4`}>{x.activite || "Activité à qualifier"}</p>
      <h3 className="m-0 mt-1 text-[21px] font-semibold tracking-[-.01em] text-encre">{joliNom(x.enseigne) || "Local commercial"}</h3>
      <p className="m-0 mt-1 flex items-center gap-1.5 text-[13px] text-ardoise"><MapPin className="h-3.5 w-3.5" />{x.adresse}</p>

      <div className="mt-4 isolate h-60 overflow-hidden rounded-[16px] border border-trait">
        {CLE_EMBED ? <iframe key={c?.vue?.pano || c?.photo?.pano || "position"} title={`Façade ${x.adresse}`} src={urlStreetView(x, CLE_EMBED, 90)} className="h-full w-full border-0" allowFullScreen loading="lazy" />
          : <div className="grid h-full place-items-center px-6 text-center text-[12.5px] text-ardoise">Street View demande la clé VITE_GOOGLE_MAPS_API_KEY.</div>}
      </div>

      {!c ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : (
        <div className="mt-5 flex flex-col gap-5">
          <div>
            <p className={etiq}>Le commerce</p>
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-craie">{ceQueFait(c).join(" ")}</p>
          </div>
          <div className="rounded-[14px] border px-4 py-3.5" style={{ borderColor: `${teinte}47` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={etiq}>Va vendre ou pas</p>
              <span className="text-[12.5px]" style={{ color: teinte }}>{verdict}</span>
            </div>
            <div className="mt-2"><Urgence c={c} compact /></div>
            {ml && <p className="m-0 mt-2.5 text-[13px] leading-[1.55] text-encre"><span style={{ color: teinte }}>{pourcent(ml.tranche.taux)}</span> des adresses de ce niveau ont vu un local se vendre dans l'année, contre {pourcent(ml.tranche.prevalence)} en moyenne.</p>}
            {(raisons.length ? raisons : [c.motif]).filter(Boolean).length > 0 && (
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] text-craie">
                {(raisons.length ? raisons : [c.motif]).filter(Boolean).slice(0, 5).map((r) => <li key={r}><span style={{ color: teinte }}>—</span> {r}</li>)}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><p className={etiq}>Loyer estimé</p><p className="m-0 mt-1"><Nombre taille={15}>{loyer}</Nombre></p>{v.loyer_source && <p className="m-0 mt-0.5 text-[11.5px] text-brume">{v.loyer_source}</p>}</div>
            <div><p className={etiq}>Prix estimé</p><p className="m-0 mt-1"><Nombre taille={15}>{prix}</Nombre></p>{surface && <p className="m-0 mt-0.5 text-[11.5px] text-brume">{surface}</p>}</div>
          </div>
          <p className="m-0 text-[12.5px] text-ardoise">
            {m.depuis?.date ? `Détenu depuis ${m.depuis.source?.startsWith("création") ? "au plus tard " : ""}${annee(m.depuis.date)}` : "Date de détention inconnue"}
            {c.mutation?.date ? ` · dernière vente autour en ${annee(c.mutation.date)}${c.mutation.prix ? ` : ${euros(c.mutation.prix)}` : ""}` : ""}
            {c.emplacement ? ` · emplacement n°${c.emplacement === 1.5 ? "1 bis" : c.emplacement}` : ""}
          </p>
          <Link to={`/ALXCible?id=${m.cible_id}`} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:text-menthe-clair">Ouvrir la fiche complète <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}
    </div>
  );
}

// Les murs d'une société : sur la carte de la ville, ou en vue réduite.
function MursDeLaSociete({ s, villeId, onOuvrir }) {
  const [vue, setVue] = useState("carte");
  // Ses murs dans les autres villes parcourues, pour la carte de France.
  const enFrance = useQuery({ queryKey: ["alx-murs-france", s.cle], queryFn: () => base44.request("GET", `/api/alx/demarchage/societe/${encodeURIComponent(s.cle)}/murs`), enabled: !!s.siren, staleTime: 300000 });
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className={etiq}>Ses murs dans la ville · {s.murs.length}</p>
        <div className="inline-flex gap-1">
          {[["carte", "Carte"], ["liste", "Vue réduite"]].map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setVue(k)} className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${vue === k ? "border-menthe text-encre" : "border-bord text-brume hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </div>
      {vue === "carte"
        ? <CarteMurs murs={s.murs} ailleurs={enFrance.data?.murs || []} villeId={villeId} onOuvrir={onOuvrir} className="mt-3" />
        : <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{s.murs.map((m) => <CarteCommerce key={m.cible_id} m={m} onOuvrir={() => onOuvrir(m)} />)}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le panneau d'une société : gérants, contact, message
// ---------------------------------------------------------------------------

function PanneauSociete({ villeId, s, onFermer }) {
  const queryClient = useQueryClient();
  const [commerce, setCommerce] = useState(null);
  const panneau = useRef(null);
  useEffect(() => { setCommerce(null); }, [s.cle]);
  const ouvrirCommerce = (m) => { setCommerce(m); panneau.current?.scrollTo({ top: 0 }); };
  const [objet, setObjet] = useState(s.message?.objet || "");
  const [corps, setCorps] = useState(s.message?.corps || "");
  const [a, setA] = useState(s.message?.a || s.contacts.find((c) => c.email)?.email || "");
  useEffect(() => { setObjet(s.message?.objet || ""); setCorps(s.message?.corps || ""); setA(s.message?.a || s.contacts.find((c) => c.email)?.email || ""); }, [s.message, s.contacts]);
  const maj = () => queryClient.invalidateQueries({ queryKey: ["alx-demarchage", villeId] });
  const url = (fin) => `/api/alx/demarchage/${villeId}/societes/${encodeURIComponent(s.cle)}/${fin}`;
  const rediger = useMutation({ mutationFn: () => base44.request("POST", url("rediger")), onSuccess: maj, onError: (e) => toast.error(e?.message || "Rédaction ratée") });
  const enregistrer = useMutation({ mutationFn: () => base44.request("POST", url("message"), { body: { objet, corps, a } }), onSuccess: () => { toast.success("Message enregistré"); maj(); } });
  const envoyer = useMutation({
    mutationFn: async () => { await base44.request("POST", url("message"), { body: { objet, corps, a } }); return base44.request("POST", url("envoyer")); },
    onSuccess: (r) => { toast.success(r.simule ? "Simulé : aucune boîte connectée" : `Envoyé à ${r.a}. La relance se prépare pour dans 7 jours, elle attendra ton feu vert.`); maj(); },
    onError: (e) => toast.error(e?.message || "Envoi raté"),
  });
  const relance = useMutation({ mutationFn: () => base44.request("POST", url("relance")), onSuccess: () => { toast.success("Relance envoyée"); maj(); }, onError: (e) => toast.error(e?.message || "Relance ratée") });
  const appel = useMutation({ mutationFn: (issue) => base44.request("POST", url("appel"), { body: { issue } }), onSuccess: () => { toast.success("Appel noté, relance calée"); maj(); } });
  const modifie = s.message && (objet !== s.message.objet || corps !== s.message.corps || a !== (s.message.a || s.contacts.find((c) => c.email)?.email || ""));
  const envoye = ["envoye", "relance_prete", "relance_envoyee", "repondu"].includes(s.etat);

  return (
    <>
      <div ref={panneau} className="fixed inset-y-0 right-0 z-40 w-full max-w-[600px] overflow-y-auto border-l border-trait bg-surface p-6 shadow-[0_0_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
        {commerce ? <DetailCommerce m={commerce} retour={joliNom(s.nom)} onRetour={() => setCommerce(null)} /> : (<>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={etiq}>{s.forme || "Société"} {s.siren ? `· ${s.siren}` : ""}</p>
            <h2 className="m-0 mt-1.5 text-[22px] font-semibold tracking-[-.01em] text-encre">{joliNom(s.nom)}</h2>
            <div className="mt-2"><Etat etat={s.etat} /></div>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
        </div>

        <MursDeLaSociete s={s} villeId={villeId} onOuvrir={ouvrirCommerce} />

        <p className={`${etiq} mt-6`}>Gérants</p>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] text-encre">
          {s.gerants.length ? s.gerants.map((g) => <li key={`${g.prenom}${g.nom}`}>{g.prenom} {g.nom}<span className="text-ardoise">{g.tranche_age ? ` · ${g.tranche_age} ans` : ""}{g.qualite ? ` · ${g.qualite}` : ""}</span></li>) : <li className="text-ardoise">Aucun gérant personne physique publié.</li>}
        </ul>
        {s.contacts.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-ardoise">
            {s.contacts.map((c) => (
              <li key={c.gerant} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-encre">{c.gerant}</span>
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-menthe"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
                {c.telephone && <a href={`tel:${c.telephone}`} className="inline-flex items-center gap-1 text-menthe"><Phone className="h-3.5 w-3.5" />{c.telephone}</a>}
                {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-menthe">LinkedIn</a>}
                <span className="text-brume">{c.poste ? `${c.poste}${c.entreprise ? ` chez ${c.entreprise}` : ""} · ` : ""}Apollo</span>
              </li>
            ))}
          </ul>
        )}

        {s.demarchable ? (
          <section className="mt-7 border-t border-trait pt-6">
            <p className={etiq}>Le message</p>
            {s.message ? (
              <div className="mt-3 flex flex-col gap-2.5">
                <input id="alx-a" value={a} onChange={(e) => setA(e.target.value)} placeholder="Adresse du gérant" className="w-full rounded-[10px] border border-bord bg-fond px-3.5 py-2.5 text-[13.5px] text-encre outline-none focus:border-menthe/60" />
                <input id="alx-objet" value={objet} onChange={(e) => setObjet(e.target.value)} className="w-full rounded-[10px] border border-bord bg-fond px-3.5 py-2.5 text-[13.5px] text-encre outline-none focus:border-menthe/60" />
                <textarea id="alx-corps" value={corps} onChange={(e) => setCorps(e.target.value)} rows={Math.min(18, corps.split("\n").length + 2)} className="w-full rounded-[10px] border border-bord bg-fond px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-encre outline-none focus:border-menthe/60" />
                <div className="flex flex-wrap justify-end gap-2">
                  {modifie && <Bouton onClick={() => enregistrer.mutate()}>Enregistrer</Bouton>}
                  {!envoye && <Bouton principal disabled={!a || envoyer.isPending} onClick={() => { if (window.confirm(`Envoyer ce message à ${a} depuis ta boîte ?`)) envoyer.mutate(); }}>{envoyer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer</Bouton>}
                </div>
                {envoye && <p className="m-0 text-[12.5px] text-ardoise">Envoyé le {dateCourte(s.envoye_le)}{s.relance?.le ? `, relance prévue le ${dateCourte(s.relance.le)}` : ""}.{s.reponse ? ` Réponse le ${dateCourte(s.reponse.le)} : « ${s.reponse.objet} ».` : ""}</p>}
              </div>
            ) : (
              <Bouton className="mt-3" onClick={() => rediger.mutate()} disabled={rediger.isPending}>{rediger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Rédiger le message</Bouton>
            )}
            {s.relance?.etat === "prete" && (
              <div className="mt-4 rounded-[14px] border border-[#E8B278]/40 p-4">
                <p className="m-0 text-[12.5px] text-encre">La relance est prête :</p>
                <p className="m-0 mt-1.5 whitespace-pre-line text-[12.5px] text-ardoise">{s.relance.corps}</p>
                <Bouton principal className="mt-3" onClick={() => relance.mutate()} disabled={relance.isPending}><Send className="h-3.5 w-3.5" />Envoyer la relance</Bouton>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ardoise">Un appel au gérant :</span>
              {[["sans_reponse", "Pas de réponse"], ["interesse", "Intéressé"], ["pas_interesse", "Pas vendeur"]].map(([k, mot]) => <button key={k} type="button" onClick={() => appel.mutate(k)} className="rounded-full border border-bord px-3 py-1 text-[12px] text-ardoise hover:border-menthe/50 hover:text-encre">{mot}</button>)}
            </div>
          </section>
        ) : <p className="mt-7 border-t border-trait pt-6 text-[12.5px] text-brume">Propriétaire public ou non démarchable : pas de message.</p>}
        </>)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// L'avertissement avant un lot : des sociétés déjà démarchées dans la sélection
// ---------------------------------------------------------------------------

function AlerteDoublons({ deja, nouvelles, onChoisir, onAnnuler }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-fond/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="alx-entree w-full max-w-[480px] rounded-[20px] border border-[#E8B278]/40 bg-surface p-7 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <p className={etiq}>Déjà démarchées</p>
        <h3 className="m-0 mt-2 text-[18px] font-semibold text-encre">{deja.length} société{deja.length > 1 ? "s" : ""} dans ta sélection {deja.length > 1 ? "ont" : "a"} déjà été contactée{deja.length > 1 ? "s" : ""}</h3>
        <ul className="m-0 mt-4 flex list-none flex-col gap-1.5 p-0 text-[13px] text-encre">
          {deja.slice(0, 6).map((s) => <li key={s.cle}>{joliNom(s.nom)} <span className="text-ardoise">— {(ETATS[s.etat] || [s.etat])[0]}{s.envoye_le ? `, le ${dateCourte(s.envoye_le)}` : ""}</span></li>)}
          {deja.length > 6 && <li className="text-ardoise">et {deja.length - 6} autre{deja.length - 6 > 1 ? "s" : ""}…</li>}
        </ul>
        <p className="m-0 mt-4 text-[13px] text-ardoise">Pour ne pas leur envoyer deux messages, tu peux ne prospecter que les sociétés jamais contactées.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Bouton onClick={onAnnuler}>Annuler</Bouton>
          {nouvelles.length > 0 && <Bouton onClick={() => onChoisir(nouvelles.map((s) => s.cle))}>Seulement les nouvelles ({nouvelles.length})</Bouton>}
          <Bouton principal onClick={() => onChoisir([...deja, ...nouvelles].map((s) => s.cle))}>Toutes quand même</Bouton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Case à cocher maison : la native prend la teinte du système (violet sous
// macOS) et un fond plein ; celle-ci reste transparente, menthe une fois cochée.
function Case({ id, coche, onChange, label }) {
  return (
    <label htmlFor={id} className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center">
      <input id={id} type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[5px] border border-bord-vif bg-transparent transition-colors checked:border-menthe focus-visible:outline focus-visible:outline-2 focus-visible:outline-menthe/60" />
      {coche && <Check className="pointer-events-none relative h-3 w-3 text-menthe" strokeWidth={3} />}
    </label>
  );
}

const TH = "border-b border-trait px-3 py-3 text-left text-[12.5px] font-semibold text-encre";
const TD = "border-b border-trait px-3 py-3 align-middle text-[13px]";

export default function ALXDemarchage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const villeParam = new URLSearchParams(location.search).get("ville");
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("demarchables");
  const [ouverte, setOuverte] = useState(null);
  const [choisies, setChoisies] = useState(new Set());
  const [alerte, setAlerte] = useState(null);
  const [travailId, setTravailId] = useState(null);
  const travailFini = useRef(false);

  const villes = useQuery({ queryKey: ["alx-demarchage-villes"], queryFn: () => base44.request("GET", "/api/alx/demarchage"), refetchInterval: 30000 });
  // Aucune ville n'est ouverte d'office : on la choisit, et seule celle-là se charge.
  const villeId = villeParam || null;
  const d = useQuery({
    queryKey: ["alx-demarchage", villeId],
    queryFn: () => base44.request("GET", `/api/alx/demarchage/${villeId}`),
    enabled: !!villeId,
    refetchInterval: (x) => (x.state.data?.parcours?.etat === "en_cours" ? 10000 : 60000),
    placeholderData: (avant) => avant,
  });
  const data = d.data;

  const travail = useQuery({
    queryKey: ["alx-enrichir", travailId],
    queryFn: () => base44.request("GET", `/api/alx/demarchage/enrichir/${travailId}`),
    enabled: !!travailId,
    refetchInterval: (x) => (["fini", "erreur"].includes(x.state.data?.etat) ? false : 900),
  });
  useEffect(() => {
    if (travail.data?.etat === "fini" && !travailFini.current) {
      travailFini.current = true;
      toast.success(`${travail.data.trouves} société${travail.data.trouves > 1 ? "s" : ""} joignable${travail.data.trouves > 1 ? "s" : ""} par mail, ${travail.data.messages} message${travail.data.messages > 1 ? "s" : ""} rédigé${travail.data.messages > 1 ? "s" : ""}`);
    }
  }, [travail.data]);

  const enrichir = useMutation({
    mutationFn: (cles) => base44.request("POST", `/api/alx/demarchage/${villeId}/enrichir`, { body: { cles } }),
    onSuccess: (r) => { travailFini.current = false; setTravailId(r.id); setAlerte(null); setChoisies(new Set()); },
    onError: (e) => toast.error(e?.message || "Impossible de lancer l'enrichissement"),
  });

  const t = q.trim().toLowerCase();
  const societes = useMemo(() => (data?.societes || [])
    .filter((s) => filtre === "toutes" || (filtre === "demarchables" ? s.demarchable : filtre === "joignables" ? s.contacts.some((c) => c.email) : DEJA_DEMARCHE.has(s.etat)))
    .filter((s) => !t || `${s.nom} ${s.gerants.map((g) => `${g.prenom} ${g.nom}`).join(" ")} ${s.murs.map((m) => `${m.adresse} ${m.enseigne || ""}`).join(" ")}`.toLowerCase().includes(t)), [data, filtre, t]);
  const ouverteS = ouverte ? (data?.societes || []).find((s) => s.cle === ouverte) : null;
  const p = data?.parcours;
  const tous = data?.societes || [];
  const compteurs = data ? [
    ["Commerces", data.compte.commerces],
    ["Détenus par une société", data.compte.detenus],
    ["Sociétés à démarcher", tous.filter((s) => s.demarchable).length],
    ["Joignables par mail", tous.filter((s) => s.contacts.some((c) => c.email)).length],
    ["Messages envoyés", tous.filter((s) => s.envoye_le).length],
    ["Réponses", tous.filter((s) => s.etat === "repondu").length],
  ] : [];

  const basculer = (cle) => setChoisies((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const toutesCochees = societes.length > 0 && societes.every((s) => choisies.has(s.cle));

  const lancerLot = () => {
    const sel = societes.filter((s) => choisies.has(s.cle));
    const dejaFait = sel.filter((s) => DEJA_DEMARCHE.has(s.etat));
    const nouvelles = sel.filter((s) => !DEJA_DEMARCHE.has(s.etat));
    if (dejaFait.length) setAlerte({ deja: dejaFait, nouvelles });
    else enrichir.mutate(sel.map((s) => s.cle));
  };

  return (
    <div className="alx sur-halo min-h-screen">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-8">
        <header className="relative mb-8 text-center">
          <h1 className="m-0 text-[38px] font-normal leading-[1.1] tracking-[-.02em] text-encre max-md:text-[28px]">Prospecter facilement en <span className="alx-serif italic text-menthe">off market</span></h1>
          <Link to="/ALXAtelier" className="mt-3 inline-block text-[12.5px] text-brume hover:text-encre">L'atelier (rues, cartes, bilan) →</Link>
        </header>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {(villes.data?.villes || []).map((v) => (
            <button key={v.id} type="button" onClick={() => navigate(`/ALX?ville=${v.id}`)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-colors ${villeId === v.id ? "border-menthe bg-menthe/10 text-encre" : "border-bord text-ardoise hover:border-bord-vif hover:text-encre"}`}>
              {v.nom} <Nombre taille={13} teinte={villeId === v.id ? undefined : "rgb(var(--k-brume-rgb))"}>{v.commerces}</Nombre>
              {v.parcours?.etat === "en_cours" && <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />}
            </button>
          ))}
          {!villes.isLoading && !(villes.data?.villes || []).length && <p className="m-0 text-[13.5px] text-ardoise">Aucune ville encore : demande à l'assistant « prospecte Cannes ».</p>}
        </div>
        {!villeId && (villes.data?.villes || []).length > 0 && <p className="m-0 py-10 text-center text-[13.5px] text-ardoise">Choisis une ville pour voir ses sociétés.</p>}

        {p?.etat === "en_cours" && (
          <section className="alx-entree mb-5 rounded-[18px] border border-trait bg-surface p-6">
            <p className={etiq}>L'assistant y travaille <Points /></p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${p.rues_total ? Math.round((p.rues_faites / p.rues_total) * 100) : 5}%` }} /></div>
            <p className="m-0 mt-3 text-[13.5px] text-encre">{p.phase === "rues" ? "Il lit les rues commerçantes." : `${p.rues_faites} rues sur ${p.rues_total}${p.rue_en_cours ? `, il est ${p.rue_en_cours}` : ""}.`}</p>
          </section>
        )}

        {data && (
          <>
            <div className="mb-6 flex flex-wrap justify-center gap-y-4">
              {compteurs.map(([l, n], k) => (
                <div key={l} className={`px-6 text-center ${k ? "md:border-l md:border-trait" : ""}`}>
                  <p className="m-0"><Nombre taille={26}>{nf.format(n)}</Nombre></p>
                  <p className={`${etiq} mt-1`}>{l}</p>
                </div>
              ))}
            </div>
            {!data.apollo && <p className="m-0 mb-5 rounded-[14px] border border-[#E8B278]/40 px-4 py-3 text-[13px] text-ardoise">Apollo n'est pas branché (clé APOLLO_API_KEY) : les gérants sont connus, pas leurs mails.</p>}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex flex-wrap gap-1">
                {[["demarchables", "À démarcher"], ["joignables", "Joignables par mail"], ["envoyes", "Contactées"], ["toutes", "Toutes"]].map(([k, mot]) => (
                  <button key={k} type="button" onClick={() => setFiltre(k)} className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${filtre === k ? "border-menthe text-encre" : "border-bord text-brume hover:text-encre"}`}>{mot}</button>
                ))}
              </div>
              <div className="flex min-w-[220px] flex-1 items-center gap-2 border-b border-encre/[0.18] pb-1.5 focus-within:border-bord-vif">
                <Search className="h-4 w-4 text-brume" />
                <input id="recherche-alx" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une société, un gérant, une adresse" className="w-full border-none bg-transparent py-1 text-[13.5px] text-encre outline-none placeholder:text-brume" />
              </div>
              {d.isFetching && <Loader2 className="h-4 w-4 animate-spin text-ardoise" />}
            </div>

            <div className="overflow-auto rounded-[16px] border border-trait" style={{ maxHeight: "calc(100vh - 380px)" }}>
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20 backdrop-blur-xl">
                  <tr>
                    <th className={`${TH} w-10`}>
                      <Case id="tout-cocher" coche={toutesCochees} onChange={(v) => setChoisies(v ? new Set(societes.map((s) => s.cle)) : new Set())} label="Tout cocher" />
                    </th>
                    {["Société", "Murs", "Gérants", "Contact", "Depuis", "Démarchage"].map((h) => <th key={h} className={TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {societes.map((s) => {
                    const trouve = s.contacts.some((c) => c.email);
                    const plusVieux = s.murs.map((m) => m.depuis).filter((x) => x?.date).sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
                    return (
                      <tr key={s.cle} className={`transition-colors hover:bg-white/[0.02] ${ouverte === s.cle ? "bg-menthe/[0.05]" : ""}`}>
                        <td className={TD} onClick={(e) => e.stopPropagation()}>
                          <Case id={`cocher-${s.cle}`} coche={choisies.has(s.cle)} onChange={() => basculer(s.cle)} label={`Choisir ${s.nom}`} />
                        </td>
                        <td className={`${TD} min-w-[220px] cursor-pointer font-medium text-encre`} onClick={() => setOuverte(s.cle)}>{joliNom(s.nom)}</td>
                        <td className={TD}><button type="button" onClick={() => setOuverte(s.cle)} className="inline-flex items-center gap-1 text-menthe" style={{ background: "transparent" }}><Nombre taille={13}>{s.murs.length}</Nombre> mur{s.murs.length > 1 ? "s" : ""}</button></td>
                        <td className={TD}>{s.gerants.length ? <button type="button" onClick={() => setOuverte(s.cle)} className="text-ardoise hover:text-encre" style={{ background: "transparent" }}>Voir ({s.gerants.length})</button> : <span className="text-brume">—</span>}</td>
                        <td className={TD}>{trouve ? <span className="inline-flex items-center gap-1.5 text-menthe"><Mail className="h-3.5 w-3.5" />Trouvé</span> : <span className="text-brume">—</span>}</td>
                        <td className={`${TD} whitespace-nowrap text-ardoise`}><Depuis d={plusVieux} /></td>
                        <td className={TD}><Etat etat={s.etat} /></td>
                      </tr>
                    );
                  })}
                  {!societes.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-[13px] text-brume">Aucune société pour ce filtre.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-2.5 text-[11.5px] text-brume">{societes.length} société{societes.length > 1 ? "s" : ""} · clic sur une ligne : ses gérants, son contact et son message · les murs des particuliers ne sont pas publiés, ils ne se démarchent pas.</p>
          </>
        )}
        {d.isLoading && villeId && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>}
      </div>

      {/* Un niveau de plus que .alx : la règle globale `.alx > *` pose
          `position: relative` sur ses enfants directs pour leurs propres
          décorations internes (Halo, etc.), et casserait le `fixed` plein
          écran de ces panneaux si on les posait juste ici. */}
      <div>
        {choisies.size > 0 && (
          <div className="alx-entree fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <div className="flex items-center gap-4 rounded-full border border-trait bg-surface px-5 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
              <span className="text-[13px] text-encre">{choisies.size} société{choisies.size > 1 ? "s" : ""} choisie{choisies.size > 1 ? "s" : ""}</span>
              <Bouton discret onClick={() => setChoisies(new Set())}>Vider</Bouton>
              <Bouton principal onClick={lancerLot} disabled={!data?.apollo}>Enrichir et démarcher</Bouton>
            </div>
          </div>
        )}

        {ouverteS && <PanneauSociete villeId={villeId} s={ouverteS} onFermer={() => setOuverte(null)} />}
        {alerte && <AlerteDoublons deja={alerte.deja} nouvelles={alerte.nouvelles} onAnnuler={() => setAlerte(null)} onChoisir={(cles) => enrichir.mutate(cles)} />}
        {travailId && (
          <PopupEnrichissement
            travail={travail.data}
            onFini={() => { setTravailId(null); queryClient.invalidateQueries({ queryKey: ["alx-demarchage", villeId] }); }}
          />
        )}
      </div>
    </div>
  );
}
