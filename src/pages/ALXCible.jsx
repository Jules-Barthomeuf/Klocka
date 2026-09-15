import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { Bouton, Etiquette, Nombre, TEINTES, emplacementDe, euros, Urgence, joliNom } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";

// La fiche d'un commerce : la seule. À gauche, ce qu'on sait, le propriétaire,
// ses gérants, ce que fait le commerce, le verdict « va vendre ou pas » et ses
// raisons, le loyer et le prix ; à droite, la devanture sur Street View. Deux
// gestes en tête : écrire le message, ou écarter en disant pourquoi.

const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// D'où sort une surface estimée. Le mot compte : « mesuré » et « deviné » ne
// se valent pas, et l'écran ne doit pas les confondre.
const LECTURES_SURFACE = {
  batiment: "mesuré sur le bâtiment",
  batiment_et_vitrine: "bâtiment mesuré, part de la vitrine",
  vitrine: "d'après la vitrine, une idée",
};

const VERDICTS = {
  appeler: ["Va vendre", TEINTES.ecrire],
  ecrire: ["Vendra un jour", TEINTES.ecrire],
  surveiller: ["Peu de chances pour l'instant", TEINTES.appeler],
  ecartee: ["Écartée", TEINTES.muet],
};

const annee = (iso) => (iso ? String(iso).slice(0, 4) : null);
const pourcent = (x) => (x == null ? "—" : `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`);

/** Le verdict du modèle appris : la tranche, ce qu'elle a valu, et le geste. */
function verdictModele(c, nom) {
  const t = c.score_ml.tranche;
  const niveau = `${pourcent(t.taux)} des adresses de ce niveau ont vu un local commercial se vendre dans les douze mois${t.lift ? `, ${String(t.lift).replace(".", ",")} fois la moyenne` : ""}`;
  const ou = t.cle === "reste" ? "au-delà du top 20 % de sa ville" : `dans le ${t.libelle.toLowerCase()}`;
  if (c.pile === "appeler") return `Le modèle place ${nom} ${ou} : ${niveau}. C'est un appel.`;
  if (c.pile === "ecrire") {
    const retenue = t.cle === "top_5" ? (c.motif || "").split(", mais ")[1]?.split(".")[0] : null;
    return `${nom} est ${ou} : ${niveau}.${retenue ? ` Pas d'appel pour autant : ${retenue}.` : ""} Un courrier maintenant, une relance dans l'année.`;
  }
  return `${nom} est ${ou} : ${niveau}. ALX surveille le BODACC et DVF.`;
}
const anneeUtile = (iso) => (annee(iso) && Number(annee(iso)) > 1901 ? annee(iso) : null);

const Case = ({ coche }) => (
  <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold" style={{ borderColor: coche ? J["menthe"] : "rgba(255,255,255,0.16)", background: coche ? J["menthe"] : "transparent", color: J["sur-menthe"] }}>
    {coche ? "✓" : ""}
  </span>
);

/** Ce que fait le commerce, en quelques phrases, avec ce qu'on a lu. */
function ceQueFait(c) {
  const o = c.occupant || {};
  const nom = joliNom(c.enseigne) || "Ce commerce";
  const phrases = [];
  phrases.push(`${nom} est ${c.activite ? `un commerce de ${c.activite.toLowerCase()}` : "un commerce de pied d'immeuble"}, au ${c.adresse}${c.ville ? ` à ${c.ville}` : ""}.`);
  if (o.nom) phrases.push(`Il est exploité par ${joliNom(o.nom)}${o.siren ? ` (SIREN ${o.siren})` : ""}${o.depuis ? `, installé ici depuis ${annee(o.depuis)}` : ""} : ${o.chaine ? "une enseigne nationale" : "un commerce indépendant"}.`);
  if (c.proprietaire_occupant) phrases.push("L'exploitant est aussi le propriétaire des murs.");
  const contacts = [c.site ? c.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null, c.telephone].filter(Boolean);
  if (contacts.length) phrases.push(`${contacts.join(" · ")}.`);
  if (c.source) phrases.push(`Vu sur ${c.source}.`);
  return phrases;
}

/** Le cap de la photo vers le commerce, en degrés, pour regarder la bonne façade. */
function capVers(photo, c) {
  if (!photo?.lat || !photo?.lon || c.lat == null || c.lon == null) return 0;
  const dLon = ((c.lon - photo.lon) * Math.PI) / 180;
  const l1 = (photo.lat * Math.PI) / 180, l2 = (c.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/**
 * L'adresse de Street View pour un commerce, face à sa vitrine.
 *
 * Donner seulement la position laissait Google choisir un panorama autour du
 * point, parfois de l'autre côté de la rue, et le tourner vers le nord : il
 * fallait marcher dans la rue pour trouver le commerce. Le panorama et le cap
 * calculés par le serveur (la vue, ou la photo de la devanture) l'ouvrent
 * directement devant. Sans eux, la position en dernier recours.
 */
function urlStreetView(c, cle, fov = 80) {
  const vue = c.vue?.pano ? c.vue : c.photo?.pano ? c.photo : null;
  if (vue) return `https://www.google.com/maps/embed/v1/streetview?key=${cle}&pano=${vue.pano}&heading=${vue.cap ?? capVers(vue, c)}&pitch=0&fov=${fov}`;
  if (c.lat != null && c.lon != null) return `https://www.google.com/maps/embed/v1/streetview?key=${cle}&location=${c.lat},${c.lon}&heading=${capVers(null, c)}&pitch=0&fov=${fov}`;
  return `https://www.google.com/maps/embed/v1/place?key=${cle}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`;
}

/**
 * L'analyse, en clair : pourquoi ALX pense que ça se vend, ou pas. Quelques
 * paragraphes courts, chaque signal avec ce qu'il veut dire, puis le
 * propriétaire, le marché, et ce qui manque.
 */
function analyseTexte(c, explications = {}) {
  const nom = joliNom(c.enseigne) || "ce commerce";
  const p = c.proprietaire || {};
  const s = c.societe || {};
  const v = c.valorisation || {};
  const forts = c.signaux?.forts || [];
  const patients = c.signaux?.patients || [];
  const blocs = [];

  const verdict = c.pile === "appeler" ? `ALX pense que les murs de ${nom} peuvent se vendre à court terme : ${forts.length > 1 ? "plusieurs signaux forts" : "un signal fort"} pousse${forts.length > 1 ? "nt" : ""} le propriétaire à agir maintenant. C'est un appel, pas un courrier.`
    : c.pile === "ecrire" ? `ALX pense que les murs de ${nom} se vendront un jour, pas cette année : ${patients.length > 1 ? "les signaux sont patients" : "le signal est patient"}. Un courrier maintenant, une relance chaque année.`
    : c.pile === "ecartee" ? `${nom} est écarté${c.ecartee_motif ? ` : ${c.ecartee_motif}` : c.ecartee_regle?.pourquoi ? ` par une règle (${c.ecartee_regle.pourquoi})` : ""}.`
    : `ALX ne voit pas de raison de vendre pour l'instant chez ${nom}${p.nom ? "" : " : le propriétaire n'est pas encore établi"}. Il surveille le BODACC et DVF, et reviendra si quelque chose bouge.`;
  const avecModele = !!c.score_ml?.tranche && c.pile !== "ecartee";
  blocs.push({ titre: "Le verdict", lignes: [avecModele ? verdictModele(c, nom) : verdict] });

  if (avecModele) {
    const ml = c.score_ml;
    const pousse = (ml.raisons || []).filter((r) => r.sens > 0);
    const retient = (ml.raisons || []).filter((r) => r.sens < 0);
    const enMots = (r) => `${r.phrase} (${r.nature}, effet ${r.force}).`;
    if (pousse.length) blocs.push({ titre: "Ce qui pousse à vendre", lignes: pousse.map(enMots) });
    if (retient.length) blocs.push({ titre: "Ce qui retient", lignes: retient.map(enMots) });
    const limites = [`Fiabilité ${ml.fiabilite?.mot} : ${ml.fiabilite?.detail}`, "Le modèle prédit la vente d'un local commercial sur la parcelle, pas forcément celui de ce commerce."];
    if (pousse.length && pousse.filter((r) => r.nature === "immeuble").length >= Math.ceil(pousse.length / 2)) {
      limites.push("L'essentiel de ce qui pousse tient à l'immeuble (plusieurs lots, plusieurs propriétaires) plus qu'à l'envie de vendre du propriétaire.");
    }
    limites.push(`Classement parmi les ${ml.parcelles_ville} parcelles à vitrine de la ville, propriétaires lus au fichier DGFiP ${ml.millesime_dgfip}.`);
    blocs.push({ titre: "Ce que le modèle voit mal", lignes: limites });
  }

  const signal = (x, patient) => `${x.libelle}${x.valeur ? ` (${x.valeur})` : ""}${x.source ? `, lu sur ${x.source}` : ""}. ${explications[x.cle] || (patient ? "Un signal qui joue sur la durée." : "Un signal qui compte maintenant.")}`;
  if (forts.length && !avecModele) blocs.push({ titre: forts.length > 1 ? "Les signaux forts" : "Le signal fort", lignes: forts.map((x) => signal(x, false)) });
  if ((forts.length || patients.length) && avecModele) {
    blocs.push({ titre: "Les signaux relevés", lignes: [`${[...forts, ...patients].map((x) => `${x.libelle}${x.valeur ? ` (${x.valeur})` : ""}`).join(" · ")}. Gardés pour mémoire : mesurés sur DVF, ils ne triaient pas, et ne décident plus de la pile.`] });
  }
  if (patients.length && !avecModele) blocs.push({ titre: patients.length > 1 ? "Les signaux patients" : "Le signal patient", lignes: patients.map((x) => signal(x, true)) });

  const proprio = [];
  if (p.nom) {
    proprio.push(`Les murs appartiennent à ${joliNom(p.nom)}${p.forme || s.forme ? ` (${p.forme || s.forme})` : ""}${anneeUtile(s.creation) ? `, société créée en ${anneeUtile(s.creation)}` : ""}${s.siege?.ville ? `, siège à ${joliNom(s.siege.ville)}` : ""}.`);
    if (/SCI/i.test(p.forme || s.forme || "")) proprio.push("Une SCI est une société patrimoniale : les murs y sont un placement, qui se vend seul, sans toucher au fonds de commerce.");
    if (c.proprietaire_occupant) proprio.push("L'exploitant est aussi le propriétaire : il vendrait murs et fonds ensemble, ce qui est plus rare et plus lent.");
    const g = (s.gerants || []).length;
    if (g) proprio.push(`${g} gérant${g > 1 ? "s" : ""} au registre${(s.gerants || []).some((x) => /70/.test(x.tranche_age || "")) ? ", dont au moins un de plus de 70 ans" : ""}.`);
  } else if (c.foncier) {
    proprio.push(`Data-B connaît plusieurs propriétaires à cette adresse, sans qu'ALX ait pu retenir celui du rez-de-chaussée${c.foncier.motif_choix ? ` (${c.foncier.motif_choix})` : ""}.`);
  } else {
    proprio.push("Le propriétaire des murs n'est pas encore établi : sans lui, pas de message.");
  }
  blocs.push({ titre: "Le propriétaire", lignes: proprio });

  const marche = [];
  if (v.loyer_fourchette?.[0] != null) marche.push(`Le loyer de marché de la rue est de ${Math.round(v.loyer_fourchette[0])} à ${Math.round(v.loyer_fourchette[1])} €/m²/an${v.loyer_source ? ` (${v.loyer_source})` : ""}.`);
  if (c.mutation?.prix) marche.push(`DVF : une vente ${c.mutation.du_local ? "de ce local" : "à côté"} en ${annee(c.mutation.date)} pour ${euros(c.mutation.prix)}${c.mutation.surface ? `, ${c.mutation.surface} m²` : ""}.`);
  if (v.fourchette) marche.push(`Avec ${v.surface} m²${v.surface_source ? ` (${v.surface_source})` : ""}, les murs vaudraient ${euros(v.fourchette[0])} à ${euros(v.fourchette[1])}.`);
  else if (v.fourchette_estimee) marche.push(`${v.estimee_detail || `La vitrine fait environ ${v.vitrine_m} m.`} Soit ${v.surface_estimee[0]} à ${v.surface_estimee[1]} m², et des murs entre ${euros(v.fourchette_estimee[0])} et ${euros(v.fourchette_estimee[1])}. ${v.estimee_source === "vitrine" ? "Une idée, pas une estimation." : "Mesuré sur le bâtiment, pas deviné."}`);
  if (v.batiment?.facades?.length > 1) marche.push(`Commerce d'angle : ${v.batiment.facades.map((f) => `${f.longueur_m} m sur ${f.rue}`).join(", ")}. Une seule photo n'en voit qu'une.`);
  if (v.alerte) marche.push(v.alerte);
  if (marche.length) blocs.push({ titre: "Le marché", lignes: marche });

  const drapeaux = (c.drapeaux || []).map((d) => `${d.libelle}${d.valeur ? ` (${d.valeur})` : ""}. ${explications[d.cle] || d.detail || ""}`.trim());
  if (drapeaux.length) blocs.push({ titre: "À savoir", lignes: drapeaux });

  const manque = [];
  if (!p.nom) manque.push("le propriétaire");
  if (!v.surface && !v.surface_estimee) manque.push("la surface du local");
  if (!c.bail_echeance) manque.push("l'échéance du bail");
  if (manque.length) blocs.push({ titre: "Ce qui manque", lignes: [`ALX n'a pas encore ${manque.join(", ")}.`] });
  return blocs;
}

/** Un semblable en coup d'œil, par-dessus la fiche. */
function ApercuCible({ id, onFermer, onEcarter, onGarder, pending }) {
  const { data: c, refetch } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  // Le point de vue face au commerce, calculé une fois puis gardé : sans lui,
  // Street View s'ouvre au hasard dans la rue.
  const sansVue = !!c && !c.vue?.pano && !c.photo?.pano && c.lat != null && c.lon != null;
  useEffect(() => {
    if (!sansVue) return;
    base44.request("POST", `/api/alx/cibles/${id}/vue`, { body: {} }).then(() => refetch()).catch(() => {});
  }, [id, sansVue, refetch]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  if (!id) return null;
  const p = c?.proprietaire || {};
  const v = c?.valorisation || {};
  const raisons = c ? (c.score_ml?.raisons?.length ? c.score_ml.raisons.filter((r) => r.sens > 0).map((r) => r.phrase) : [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : ""))) : [];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(4,5,5,0.74)] p-6" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="alx-entree w-full max-w-[960px] overflow-hidden rounded-[20px] border border-trait bg-[#0B0D0C]">
        {!c ? <div className="p-10 text-ardoise">Lecture…</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="flex flex-col gap-5 p-7">
              <div>
                <Etiquette>Coup d'œil</Etiquette>
                <div className="alx-serif mt-2 text-[34px] italic leading-tight text-encre">{joliNom(c.enseigne) || c.adresse}</div>
                <div className="mt-1 text-[13.5px] text-ardoise">{c.adresse}{c.activite ? ` · ${c.activite}` : ""}</div>
              </div>
              <div>
                <Etiquette>Propriétaire</Etiquette>
                <div className="mt-1.5 text-[18px] text-encre">{p.nom ? joliNom(p.nom) : "À établir"}</div>
              </div>
              <div>
                <Etiquette>Analyse</Etiquette>
                <div className="mt-2"><Urgence c={c} /></div>
                <div className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-craie">{(raisons.length ? raisons : [c.motif]).filter(Boolean).map((r) => <span key={r}>— {r}</span>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Etiquette>Loyer</Etiquette><div className="mt-1"><Nombre taille={15} teinte={J["encre"]}>{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</Nombre></div></div>
                <div><Etiquette>Prix</Etiquette><div className="mt-1"><Nombre taille={15} teinte={J["encre"]}>{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</Nombre></div></div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-2">
                {c.pile !== "ecartee" && <Bouton principal onClick={() => onEcarter(c.id)} disabled={pending}>Écarter aussi</Bouton>}
                <Bouton onClick={() => onGarder(c.id)}>Garder</Bouton>
                <Link to={`/ALXCible?id=${c.id}`} className="ml-1 text-[12.5px] text-menthe hover:text-menthe-clair">Ouvrir la fiche →</Link>
              </div>
            </div>
            <div className="isolate min-h-[360px] overflow-hidden bg-fond lg:rounded-r-[20px]">
              {/* `key` : quand le point de vue arrive, l'iframe se recharge sur le bon panorama. */}
              {CLE_EMBED && <iframe key={c.vue?.pano || c.photo?.pano || "position"} title={`Street View ${c.adresse}`} src={urlStreetView(c, CLE_EMBED, 90)} className="h-full min-h-[360px] w-full border-0 lg:rounded-r-[20px]" allowFullScreen loading="lazy" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ALXCible() {
  const user = useUser();
  const [params] = useSearchParams();
  const id = params.get("id");
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });

  const [mode, setMode] = useState("lecture"); // lecture | message | ecart | fait
  const [motif, setMotif] = useState("");
  const [sur, setSur] = useState({ activite: false, proprietaire: false, enseigne: false });
  const [resultat, setResultat] = useState(null); // { semblables, regle } après un écart
  const [apercu, setApercu] = useState(null);
  const [analyseOuverte, setAnalyseOuverte] = useState(false);
  const { data: etat } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 300000 });
  useEffect(() => { setMode("lecture"); setMotif(""); setSur({ activite: false, proprietaire: false, enseigne: false }); setResultat(null); setAnalyseOuverte(false); }, [id]);
  useEffect(() => { if (window.location.hash === "#message" && c?.brouillon) setMode("message"); }, [c?.brouillon]);

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cible", id] }); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  // « Rédiger le message » : ALX écrit, puis on part dans l'onglet Messages de
  // la ville, où le message s'ouvre et se corrige. La fiche ne bouge pas.
  const navigate = useNavigate();
  const versMessages = () => navigate(`/ALX?ville=${c.ville_id}&onglet=messages&cible=${c.id}`);
  const rediger = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal: /SCI|SARL|SAS|SA\b/.test(c?.proprietaire?.forme || c?.societe?.forme || "") ? "courrier" : "mail" } }),
    onSuccess: () => { rafraichir(); setTimeout(versMessages, 350); },
    onError: (e) => toast.error(e?.message || "Rédaction impossible"),
  });
  const ecarter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/ecarter`, { body: { motif: motif || null, sur } }),
    onSuccess: (r) => { toast.success("Écartée"); setResultat({ semblables: r.semblables || [], regle: r.regle }); setMode("fait"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ecarterAussi = useMutation({
    mutationFn: (ids) => base44.request("POST", `/api/alx/cibles/ecarter-plusieurs`, { body: { ids, motif: motif || null, regle_id: resultat?.regle?.id || null } }),
    onSuccess: (r, ids) => { toast.success(`${r.cibles.length} écartée${r.cibles.length > 1 ? "s" : ""} aussi`); setResultat((x) => ({ ...x, semblables: x.semblables.filter((y) => !ids.includes(y.id)) })); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const reprendre = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/reprendre`, { body: {} }),
    onSuccess: () => { toast.success("Reprise"); setMode("lecture"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const devanture = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/devanture`, { body: {} }),
    onSuccess: rafraichir,
    onError: () => {},
  });
  // La devanture se lit une fois, à l'ouverture : la photo au bon panorama,
  // et la largeur de vitrine qui donne une idée de surface et de prix.
  const devantureLue = !!c?.photo;
  const devantureTentee = useRef(null);
  useEffect(() => {
    if (!c || devantureLue || devantureTentee.current === c.id || c.pile === "ecartee") return;
    devantureTentee.current = c.id;
    devanture.mutate();
  }, [c?.id, devantureLue]);
  // Le bâtiment se mesure de la même façon, et c'est lui qui commande : le
  // polygone voit les deux rues d'un commerce d'angle, la photo n'en voit
  // qu'une. Gratuit, une requête OpenStreetMap.
  const batiment = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/batiment`, { body: {} }),
    onSuccess: rafraichir,
    onError: () => {},
  });
  // Le point de vue face au commerce : avant même la lecture de la devanture,
  // qui prend quelques secondes de plus, Street View doit s'ouvrir au bon
  // endroit. Métadonnées seules, gardées sur la cible.
  const vueTentee = useRef(null);
  useEffect(() => {
    if (!c || c.vue?.pano || c.photo?.pano || c.lat == null || c.lon == null || vueTentee.current === c.id) return;
    vueTentee.current = c.id;
    base44.request("POST", `/api/alx/cibles/${c.id}/vue`, { body: {} }).then(rafraichir).catch(() => {});
  }, [c?.id, c?.vue?.pano, c?.photo?.pano]);
  const batimentLu = !!c?.valorisation?.batiment;
  const batimentTente = useRef(null);
  useEffect(() => {
    if (!c || batimentLu || batimentTente.current === c.id || c.pile === "ecartee" || !(c.lat && c.lon)) return;
    batimentTente.current = c.id;
    batiment.mutate();
  }, [c?.id, batimentLu]);
  const proprietaire = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/proprietaire`, { body: {} }),
    onSuccess: (r) => { toast.success(r.cible?.proprietaire?.nom ? `Propriétaire : ${joliNom(r.cible.proprietaire.nom)}` : r.foncier?.motif_choix || "Fiche lue"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Data-B n'a pas répondu"),
  });

  if (!user || user.role !== "admin") return null;
  if (!id) return <div className="alx min-h-screen p-10 text-ardoise">Aucun commerce désigné.</div>;
  if (isLoading || !c) return <div className="alx min-h-screen p-10 text-ardoise">Lecture…</div>;

  const p = c.proprietaire || {};
  const s = c.societe || {};
  const v = c.valorisation || {};
  const e = emplacementDe(c.emplacement || null);
  const [verdict, teinteVerdict] = VERDICTS[c.pile] || VERDICTS.surveiller;
  // Chaque raison avec son poids : c'est le score qui fait la pile, et on le
  // montre plutôt que de dire « un signal fort ».
  const poids = (x) => (typeof x.poids === "number" ? ` · ${x.poids >= 0 ? "+" : ""}${String(x.poids).replace(".", ",")}` : "");
  const contributions = c.score?.contributions || [];
  const raisons = contributions.length
    ? contributions.map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : "") + poids(x))
    : [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : "") + poids(x));
  for (const d of c.drapeaux || []) if (d.effet !== "information" && d.effet !== "patient") raisons.push(d.libelle);
  if (!raisons.length && c.motif) raisons.push(c.motif);
  const score = typeof c.score?.total === "number" ? String(c.score.total).replace(".", ",") : null;
  const ml = c.score_ml?.tranche ? c.score_ml : null;
  const drapeauxEnMots = (c.drapeaux || []).filter((d) => d.effet !== "information" && d.effet !== "patient").map((d) => d.libelle);
  const gerants = (s.gerants || []).slice(0, 5);
  const depuis = c.mutation?.du_local && c.mutation.date ? `propriétaire des murs depuis ${annee(c.mutation.date)}` : anneeUtile(s.creation) ? `société créée en ${anneeUtile(s.creation)}` : null;
  const proprioMeta = [p.forme || s.forme || (p.nom ? "Personne physique" : null), depuis, s.siege?.ville ? `siège à ${joliNom(s.siege.ville)}` : null].filter(Boolean).join(" · ");
  const brouillon = c.brouillon || null;
  const ecartee = c.pile === "ecartee";
  const retour = c.ville_id ? `/ALX?ville=${c.ville_id}&onglet=commerces` : "/ALX";

  return (
    <div className="alx min-h-screen">
      {apercu && (
        <ApercuCible
          id={apercu}
          onFermer={() => setApercu(null)}
          pending={ecarterAussi.isPending}
          onEcarter={(cid) => { ecarterAussi.mutate([cid]); setApercu(null); }}
          onGarder={(cid) => { setResultat((r) => (r ? { ...r, semblables: r.semblables.filter((y) => y.id !== cid) } : r)); setApercu(null); }}
        />
      )}
      <div className="mx-auto max-w-[1200px] px-[34px] pb-[70px] pt-[26px] max-md:px-4">
        <Link to={retour} className="text-[13.5px] text-ardoise hover:text-encre">← Tous les commerces</Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <h1 className="alx-serif m-0 text-[44px] italic leading-[1.05] tracking-[-.01em] text-encre max-md:text-[34px]">{joliNom(c.enseigne) || c.adresse}</h1>
            <div className="mt-2 text-[15px] text-ardoise">{c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.activite ? ` · ${c.activite}` : ""}{c.emplacement ? ` · emplacement ${e.mot}` : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {ecartee ? (
              <>
                <span className="text-[12.5px] text-ardoise">{c.ecartee_motif ? `Écartée : ${c.ecartee_motif}` : c.ecartee_regle?.pourquoi ? `Écartée par une règle : ${c.ecartee_regle.pourquoi}` : "Écartée"}</span>
                <Bouton onClick={() => reprendre.mutate()} disabled={reprendre.isPending}>Reprendre</Bouton>
              </>
            ) : (
              <>
                <Bouton principal className={rediger.isPending ? "alx-redige" : ""} onClick={() => (brouillon ? versMessages() : rediger.mutate())} disabled={rediger.isPending}>
                  {rediger.isPending ? (
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-3 items-end gap-[4px]">{[0, 0.18, 0.36].map((d) => <span key={d} className="alx-vague h-[5px] w-[5px] rounded-full bg-sur-menthe" style={{ animationDelay: `${d}s` }} />)}</span>
                      ALX rédige
                    </span>
                  ) : brouillon ? "Relire le message" : "Rédiger le message"}
                </Bouton>
                <Bouton onClick={() => setMode("ecart")}>Écarter</Bouton>
              </>
            )}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="relative flex flex-col gap-[26px] rounded-[20px] border border-trait bg-[#0B0D0C] p-7">
            <button
              onClick={() => setAnalyseOuverte((x) => !x)}
              aria-label={analyseOuverte ? "Revenir à la fiche" : "Lire l'analyse"} title={analyseOuverte ? "Revenir à la fiche" : "Lire l'analyse"}
              aria-pressed={analyseOuverte}
              className="absolute right-5 top-5 flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] transition-colors"
              style={{ borderColor: analyseOuverte ? J["menthe"] : "rgba(255,255,255,0.12)", color: analyseOuverte ? J["menthe"] : J["ardoise"], background: analyseOuverte ? "rgba(150,192,184,0.12)" : "transparent" }}
            >
              {analyseOuverte ? "La fiche" : "L'analyse"}
              <span className="text-[11px]">{analyseOuverte ? "◀" : "▶"}</span>
            </button>
            {analyseOuverte ? (
              <div className="alx-entree flex flex-col gap-6 pr-28">
                <div>
                  <Etiquette>L'analyse</Etiquette>
                  <div className="mt-2 flex items-center gap-3"><Urgence c={c} /></div>
                </div>
                {analyseTexte(c, etat?.explications || {}).map((b) => (
                  <div key={b.titre}>
                    <Etiquette className="!text-[11px]">{b.titre}</Etiquette>
                    <div className="mt-2 flex flex-col gap-2 text-[15px] leading-[1.6] text-craie">{b.lignes.map((l, i) => <p key={i} className="m-0">{l}</p>)}</div>
                  </div>
                ))}
              </div>
            ) : (
            <>
            <div className="pr-28">
              <Etiquette>Propriétaire</Etiquette>
              <div className="mt-2 text-[24px] text-encre">{p.nom ? joliNom(p.nom) : c.foncier ? "Plusieurs, à départager" : "À établir"}</div>
              {proprioMeta && <div className="mt-1 text-[13.5px] text-ardoise">{proprioMeta}</div>}
              {!p.nom && (
                <button onClick={() => proprietaire.mutate()} disabled={proprietaire.isPending} className="mt-2 text-[12.5px] text-menthe hover:text-menthe-clair disabled:opacity-50" style={{ background: "transparent" }}>
                  {proprietaire.isPending ? "Data-B lit l'adresse…" : c.foncier ? "Relire chez Data-B" : "Chercher le propriétaire chez Data-B"}
                </button>
              )}
              {c.foncier?.motif_choix && <div className="mt-1.5 text-[12.5px] text-ardoise">{c.foncier.motif_choix}</div>}
            </div>

            {gerants.length > 0 && (
              <div>
                <Etiquette>Gérants</Etiquette>
                <div className="mt-2.5 flex flex-col">
                  {gerants.map((g, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-3.5 border-t border-trait py-[11px]">
                      <span className="text-[15px] text-encre">{joliNom(g.nom)}{g.qualite ? <span className="text-ardoise"> · {g.qualite}</span> : null}</span>
                      <Nombre taille={13.5} teinte={J["craie"]}>{g.tranche_age ? `${g.tranche_age} ans` : "—"}</Nombre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Etiquette>Le commerce</Etiquette>
              <div className="mt-2 text-[15px] leading-[1.6] text-craie">{ceQueFait(c).join(" ")}</div>
            </div>

            <div className="rounded-[14px] border px-[22px] py-5" style={{ borderColor: `${teinteVerdict}47` }}>
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <Etiquette>Va vendre ou pas</Etiquette>
                <div className="flex items-center gap-3">
                  <Urgence c={c} compact />
                  {!ml && score != null && !ecartee && <Etiquette title="La somme des poids des signaux : appeler à partir de 3, écrire à partir de 0,7">score {score}</Etiquette>}
                  {ml && !ecartee && <Etiquette title={`Dans les ${Math.max(1, Math.round((ml.rang_part || 0) * 100))} % de tête, sur ${ml.parcelles_ville} parcelles à vitrine de la ville`}>{ml.tranche.libelle.replace(" de la ville", "")}</Etiquette>}
                  <Etiquette teinte={teinteVerdict}>{verdict}</Etiquette>
                </div>
              </div>
              {ml && !ecartee ? (
                <>
                  <p className="m-0 mt-3.5 text-[15px] leading-[1.55] text-encre">
                    <span className="text-[19px]" style={{ color: teinteVerdict, fontVariantNumeric: "tabular-nums" }}>{pourcent(ml.tranche.taux)}</span> des adresses de ce niveau ont vu un local commercial se vendre dans l'année, contre {pourcent(ml.tranche.prevalence)} en moyenne.
                  </p>
                  <div className="mt-3 flex flex-col gap-[9px]">
                    {(ml.raisons || []).map((r) => (
                      <span key={r.variable} className="flex items-baseline gap-3 text-[15px] leading-[1.5] text-craie">
                        <span style={{ color: r.sens > 0 ? teinteVerdict : J["ardoise"] }}>{r.sens > 0 ? "↑" : "↓"}</span>
                        <span>{r.phrase}<span className="text-[12.5px] text-brume"> · {r.nature}, effet {r.force}</span></span>
                      </span>
                    ))}
                  </div>
                  {drapeauxEnMots.length > 0 && <p className="m-0 mt-3 text-[13.5px] text-craie">À savoir : {drapeauxEnMots.join(" · ")}</p>}
                  <p className="m-0 mt-3.5 border-t border-trait pt-3 text-[12.5px] leading-[1.6] text-ardoise">
                    Fiabilité {ml.fiabilite?.mot} : {ml.fiabilite?.detail} Le modèle prédit la vente d'un local commercial sur la parcelle, pas forcément celui-ci.
                  </p>
                </>
              ) : (
                <div className="mt-3.5 flex flex-col gap-[9px]">
                  {raisons.map((r) => <span key={r} className="flex items-baseline gap-3 text-[15px] leading-[1.5] text-craie"><span style={{ color: teinteVerdict }}>—</span>{r}</span>)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <Etiquette>Loyer estimé</Etiquette>
                <div className="mt-1.5"><Nombre taille={19} teinte={J["encre"]}>{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</Nombre></div>
                {v.loyer_source && <div className="mt-1 text-[12.5px] text-ardoise">{v.loyer_source}</div>}
              </div>
              <div>
                <Etiquette>Prix estimé</Etiquette>
                <div className="mt-1.5"><Nombre taille={19} teinte={J["encre"]}>{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : v.fourchette_estimee ? `~ ${euros(v.fourchette_estimee[0])} – ${euros(v.fourchette_estimee[1])}` : devanture.isPending ? "…" : "—"}</Nombre></div>
                <div className="mt-1 text-[12.5px] text-ardoise">
                  {v.surface ? `${v.surface} m²${v.surface_source ? ` · ${v.surface_source}` : ""}`
                    : v.surface_estimee ? `${v.surface_estimee[0]}–${v.surface_estimee[1]} m² · ${LECTURES_SURFACE[v.estimee_source] || "d'après la vitrine"}`
                    : batiment.isPending ? "ALX mesure le bâtiment…"
                    : devanture.isPending ? "ALX regarde la vitrine…"
                    : c.mutation?.prix ? `Vente autour en ${annee(c.mutation.date)} : ${euros(c.mutation.prix)}${c.mutation.surface ? ` pour ${c.mutation.surface} m²` : ""}` : "surface inconnue"}
                </div>
              </div>
            </div>

            {mode === "message" && brouillon && (
              <div id="message" className="alx-entree flex flex-col gap-3.5 border-t border-trait pt-6">
                <Etiquette teinte={J["menthe-clair"]}>Message rédigé · {brouillon.canal === "courrier" ? "courrier" : "e-mail"}</Etiquette>
                {brouillon.objet && <div className="text-[15px] text-encre">{brouillon.objet}</div>}
                <div className="whitespace-pre-line rounded-[14px] border border-trait px-5 py-[18px] text-[15px] leading-[1.65] text-craie">{brouillon.texte}</div>
                <div className="flex flex-wrap gap-2.5">
                  <Bouton principal onClick={() => { toast.success("En brouillon", { description: "À retrouver dans l'onglet Messages." }); setMode("lecture"); }}>Garder en brouillon</Bouton>
                  <Bouton onClick={() => rediger.mutate()} disabled={rediger.isPending}>{rediger.isPending ? "…" : "Réécrire"}</Bouton>
                  <Bouton discret onClick={() => setMode("lecture")}>Fermer</Bouton>
                </div>
              </div>
            )}

            {mode === "ecart" && (
              <div className="alx-entree flex flex-col gap-3.5 border-t border-trait pt-6">
                <Etiquette>Pourquoi écarter</Etiquette>
                <input value={motif} onChange={(ev) => setMotif(ev.target.value)} placeholder="Le gérant vient de renouveler son bail" className="rounded-[12px] border border-trait bg-fond px-4 py-[13px] text-[15px] text-encre outline-none focus:border-menthe/50" />
                <Etiquette className="mt-1">Ce non généralise</Etiquette>
                <div className="flex flex-col gap-0.5">
                  {[["activite", `Cette activité${c.activite ? ` (${c.activite})` : ""}`], ["proprietaire", `Ce propriétaire${p.nom ? ` (${joliNom(p.nom)})` : ""}`], ["enseigne", `Cette enseigne${c.enseigne ? ` (${joliNom(c.enseigne)})` : ""}`]].map(([k, mot]) => (
                    <button key={k} type="button" onClick={() => setSur((x) => ({ ...x, [k]: !x[k] }))} className="flex items-center gap-3 py-[9px] text-left" style={{ background: "transparent" }}>
                      <Case coche={sur[k]} />
                      <span className="text-[15px] text-encre">{mot}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex gap-2.5">
                  <Bouton principal onClick={() => ecarter.mutate()} disabled={ecarter.isPending}>{ecarter.isPending ? "…" : sur.activite || sur.proprietaire || sur.enseigne ? "Créer la règle" : "Écarter"}</Bouton>
                  <Bouton discret onClick={() => setMode("lecture")}>Annuler</Bouton>
                </div>
              </div>
            )}

            {mode === "fait" && (
              <div className="alx-entree flex flex-col gap-3.5 border-t border-trait pt-6">
                <div className="flex items-center gap-3 rounded-[14px] border border-menthe/30 px-5 py-[18px]">
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-menthe text-[12.5px] font-bold text-sur-menthe">✓</span>
                  <span className="text-[15px] text-craie">
                    {resultat?.regle ? "Règle créée et rejouée sur la ville." : "Écartée, avec son motif."}
                    {resultat?.semblables?.length ? ` ${resultat.semblables.length} commerce${resultat.semblables.length > 1 ? "s" : ""} qui ressemble${resultat.semblables.length > 1 ? "nt" : ""} :` : " Aucun autre commerce semblable."}
                  </span>
                </div>
                {resultat?.semblables?.length > 0 && (
                  <div className="flex flex-col">
                    {resultat.semblables.map((x) => (
                      <div key={x.id} onClick={() => setApercu(x.id)} className="flex cursor-pointer items-center justify-between gap-3 border-t border-trait py-2.5 hover:bg-white/[0.025]">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] text-encre">{joliNom(x.enseigne) || x.adresse}</div>
                          <div className="truncate text-[12.5px] text-ardoise">{x.adresse} · {x.raisons.join(" · ")}</div>
                        </div>
                        <div className="flex shrink-0 gap-3 text-[12.5px]">
                          <button onClick={(ev) => { ev.stopPropagation(); ecarterAussi.mutate([x.id]); }} disabled={ecarterAussi.isPending} className="text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Écarter aussi</button>
                          <button onClick={(ev) => { ev.stopPropagation(); setResultat((r) => ({ ...r, semblables: r.semblables.filter((y) => y.id !== x.id) })); }} className="text-ardoise hover:text-encre" style={{ background: "transparent" }}>Garder</button>
                        </div>
                      </div>
                    ))}
                    {resultat.semblables.length > 1 && (
                      <div className="mt-3 flex gap-2.5">
                        <Bouton principal onClick={() => ecarterAussi.mutate(resultat.semblables.map((x) => x.id))} disabled={ecarterAussi.isPending}>Écarter les {resultat.semblables.length}</Bouton>
                        <Bouton onClick={() => setResultat((r) => ({ ...r, semblables: [] }))}>Tout garder</Bouton>
                      </div>
                    )}
                  </div>
                )}
                <div><Link to={retour} className="text-[13.5px] text-menthe hover:text-menthe-clair">← Retour aux commerces</Link></div>
              </div>
            )}
            </>
            )}
          </div>

          <div className="isolate min-h-[460px] overflow-hidden rounded-[20px] border border-trait bg-fond">
            {CLE_EMBED ? (
              <iframe
                key={c.vue?.pano || c.photo?.pano || "position"}
                title={`Street View ${c.adresse}`}
                src={urlStreetView(c, CLE_EMBED)}
                className="h-full min-h-[460px] w-full rounded-[20px] border-0"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-[12.5px] text-ardoise">Street View demande la clé VITE_GOOGLE_MAPS_API_KEY dans le .env.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
