import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast, avis } from "@/components/ui/avis";
import { PILES, EMPLACEMENTS, TEINTES, emplacementDe, Bouton, Etiquette, Etoiles, Nombre, Champ, Urgence, urgenceDe, joliNom } from "@/components/alx/alx-commun";
import CarteRues from "@/components/alx/CarteRues";

// ALX, tel que la maquette le dessine. On arrive toujours par la même porte :
// donnez une ville. La ville ouverte devient trois onglets : les rues sur une
// carte, à cocher ; les commerces dans l'ordre où les démarcher ; les messages
// à relire. Une fiche s'ouvre par-dessus la liste et pose la question : oui
// on écrit, non on dit pourquoi.

const fmt = (n) => (n || 0).toLocaleString("fr-FR");
const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");
const euroM2 = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €/m²`);
const pluriel = (n, un, des) => `${fmt(n)} ${n > 1 ? des : un}`;

const STATUTS = {
  en_cours: ["En cours", TEINTES.ecrire],
  rues_proposees: ["Rues proposées", TEINTES.ecrire],
  fini: ["Terminé", TEINTES.muet],
  arrete: ["Arrêté", TEINTES.muet],
  interrompu: ["Interrompu", TEINTES.appeler],
  erreur: ["En erreur", TEINTES.urgence5],
};
const statutDe = (etat) => STATUTS[etat] || ["À lancer", TEINTES.muet];

/** Une case à cocher, dans le registre de la maquette : un carré, une coche. */
function Case({ coche, onChange, taille = 16 }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!coche}
      onClick={(e) => { e.stopPropagation(); onChange?.(!coche); }}
      className="flex shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold transition-colors"
      style={{ width: taille, height: taille, borderColor: coche ? "#96c0b8" : "rgba(255,255,255,0.16)", background: coche ? "#96c0b8" : "transparent", color: "#08130D" }}
    >
      {coche ? "✓" : ""}
    </button>
  );
}

// --- L'accueil ------------------------------------------------------------------------------

const VILLAGES = ["Trifouillis-les-Oies", "Pouilly-le-Sec", "Moulinet", "Sainte-Croix-à-Lauze", "Bézaudun-les-Alpes"];

/** Le champ vide tape des noms de villages, lettre à lettre, comme dans la maquette. */
function usePlaceholderTape(actif) {
  const [etat, setEtat] = useState({ mot: 0, n: 0, retour: false, pause: 0 });
  useEffect(() => {
    if (!actif) return undefined;
    const t = setInterval(() => {
      setEtat((s) => {
        const w = VILLAGES[s.mot % VILLAGES.length];
        if (!s.retour) {
          if (s.n < w.length) return { ...s, n: s.n + 1 };
          if (s.pause < 12) return { ...s, pause: s.pause + 1 };
          return { ...s, retour: true, pause: 0 };
        }
        if (s.n > 0) return { ...s, n: s.n - 1 };
        return { mot: s.mot + 1, n: 0, retour: false, pause: 0 };
      });
    }, 110);
    return () => clearInterval(t);
  }, [actif]);
  return `${VILLAGES[etat.mot % VILLAGES.length].slice(0, etat.n)}|`;
}

function CarteVille({ v, onOuvrir }) {
  const p = v.parcours || {};
  const c = v.cibles || {};
  const enCours = p.etat === "en_cours";
  const [mot, teinte] = statutDe(p.etat);
  const total = (c.appeler || 0) + (c.ecrire || 0) + (c.surveiller || 0);
  const part = (n) => (total ? `${((n || 0) / total) * 100}%` : "0%");
  const nRues = (v.rues || []).length;
  const pied = enCours
    ? p.phase === "rues" ? "lecture des rues" : p.rue_en_cours ? `ALX lit ${p.rue_en_cours}` : p.phase === "redaction" ? "rédaction des messages" : "démarrage"
    : p.etat === "fini" ? "parcours terminé" : p.etat === "rues_proposees" ? "rues à cocher" : p.etat ? mot.toLowerCase() : "pas encore lancée";
  return (
    <button
      onClick={() => onOuvrir(v.id)}
      className="relative flex flex-col overflow-hidden rounded-[18px] border border-white/[0.055] text-left transition-colors hover:border-[rgba(150,192,184,0.3)]"
      style={{ background: "#0D0F0E" }}
    >
      <div className="flex h-[3px]">
        <div style={{ width: part(c.appeler), background: TEINTES.appeler }} />
        <div style={{ width: part(c.ecrire), background: TEINTES.ecrire }} />
        <div style={{ width: part(c.surveiller), background: TEINTES.barreSurveiller }} />
      </div>
      <div className="flex items-baseline justify-between gap-3 px-6 pb-2 pt-6">
        <span className="alx-serif text-[29px] tracking-[-.01em] text-[#F3F7F5]">{v.nom}</span>
        <Etiquette teinte={teinte} className="!text-[9.5px]">{mot}</Etiquette>
      </div>
      <div className="px-6 pb-5 text-[12.5px] text-[#8B938F]">
        {pluriel(nRues, "rue classée", "rues classées")}{v.recensement?.commerces_total ? ` · ${fmt(v.recensement.commerces_total)} vitrines` : ""}
      </div>
      <div className="flex w-full flex-col px-6 pb-2">
        {[["À appeler", c.appeler, TEINTES.appeler], ["À écrire", c.ecrire, TEINTES.ecrire], ["À surveiller", c.surveiller, TEINTES.muet]].map(([m, n, t]) => (
          <div key={m} className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] py-[11px]">
            <span className="text-[14px] text-[#C3CBC7]">{m}</span>
            <Nombre taille={16} teinte={t}>{fmt(n)}</Nombre>
          </div>
        ))}
      </div>
      <div className="mt-auto flex w-full items-center gap-2 px-6 pb-4 pt-3.5 text-[12.5px] text-[#8B938F]">
        {enCours && <span className="alx-pouls h-[5px] w-[5px] shrink-0 rounded-full bg-menthe" />}
        <span className="min-w-0 truncate">{pied}</span>
        {p.brouillons > 0 && !enCours && <span className="ml-auto text-menthe">{p.brouillons} à relire</span>}
      </div>
    </button>
  );
}

function Accueil({ villes, onOuvrir }) {
  const [nom, setNom] = useState("");
  const placeholder = usePlaceholderTape(!nom);
  const creer = useMutation({
    mutationFn: async () => {
      const r = await base44.request("POST", "/api/alx/villes", { body: { nom } });
      try {
        await base44.request("POST", `/api/alx/villes/${r.ville.id}/lancer`, { body: {} });
      } catch (e) {
        if (!/déjà en cours/.test(e?.message || "")) throw e;
      }
      return r;
    },
    onSuccess: (r) => { setNom(""); onOuvrir(r.ville.id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  return (
    <div className="flex flex-col gap-11">
      <section className="relative overflow-hidden rounded-[20px] border border-white/[0.07] px-12 pb-[46px] pt-[52px] max-md:px-6 max-md:py-8" style={{ background: "linear-gradient(155deg,#141816 0%,#0C0F0E 48%,#0A0B0B 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute -left-[120px] -top-[220px] h-[520px] w-[700px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.055),transparent)" }} />
        <div className="relative flex flex-col items-center text-center">
          <h1 className="m-0 font-light leading-[1.06] tracking-[-.03em]" style={{ fontSize: "clamp(34px,3.6vw,52px)" }}>
            <span className="block text-[#F3F7F5]">Donnez une ville.</span>
            <span className="block text-menthe">ALX <span className="alx-serif italic tracking-[-.01em]">s'occupe du reste.</span></span>
          </h1>
          <p className="mx-auto mb-0 mt-[22px] max-w-[56ch] text-[16px] leading-[1.6] text-[#8E9793]">
            Il dessine les rues du centre, les classe par leur loyer, lit chaque vitrine des rues que vous cochez, retrouve le propriétaire, et vous rend trois piles avec les messages déjà écrits. Rien ne part sans votre relecture.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (nom.trim() && !creer.isPending) creer.mutate(); }}
            className="mt-8 flex w-full max-w-[600px] items-center gap-2.5 rounded-full border border-white/[0.09] bg-[#0A0C0B] py-[7px] pl-[22px] pr-[7px] focus-within:border-menthe/50"
          >
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[17px] text-[#E8EFEB] outline-none"
            />
            <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>{creer.isPending ? "…" : "Lancer ALX"}</Bouton>
          </form>
          <p className="mb-0 mt-3.5 text-[13px] text-[#8B938F]">Les rues arrivent en une minute, sur une carte. Vous cochez, ALX prospecte.</p>
        </div>
      </section>

      {villes.length === 0 ? (
        <p className="m-0 text-center text-[13.5px] text-[#8B938F]">Aucune ville encore. La première que vous lancez apparaîtra ici.</p>
      ) : (
        <div className="mx-auto grid w-full max-w-[1160px] justify-center gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 360px))" }}>
          {villes.map((v) => <CarteVille key={v.id} v={v} onOuvrir={onOuvrir} />)}
        </div>
      )}
    </div>
  );
}

// --- La ville ouverte -----------------------------------------------------------------------

/** Ce qu'ALX fait en ce moment, en une phrase, et le temps qu'il lui reste. */
function enCeMoment(p, rues) {
  if (!p || p.etat !== "en_cours") return null;
  if (p.phase === "rues") return { texte: `ALX relève les rues du centre${rues.length ? ` · ${rues.length} rues` : ""}`, reste: "moins d'une minute" };
  if (p.phase === "redaction") return { texte: `ALX rédige les messages · ${p.brouillons || 0} écrit${(p.brouillons || 0) > 1 ? "s" : ""}`, reste: null };
  const faites = p.rues_faites || 0;
  const total = p.rues_total || 0;
  const ecoule = p.demarre_le ? (Date.now() - Date.parse(p.demarre_le)) / 60000 : 0;
  const reste = faites >= 1 && total > faites ? Math.max(1, Math.round((ecoule / faites) * (total - faites))) : null;
  return {
    texte: p.rue_en_cours ? `ALX lit ${p.rue_en_cours} · ${faites} rue${faites > 1 ? "s" : ""} sur ${total}` : `ALX lit les commerces · ${faites} sur ${total} rues`,
    reste: reste ? `${reste} minute${reste > 1 ? "s" : ""}` : null,
  };
}

/**
 * Le direct de la prospection : à gauche la carte des rues retenues, qui se
 * colorent au fur et à mesure des pas d'ALX ; à droite le temps estimé, en
 * gros, dans un anneau qui se remplit.
 */
function Direct({ ville, p }) {
  const rues = ville?.rues || [];
  const retenues = p.rues_a_faire || rues.filter((r) => r.retenue).map((r) => r.nom);
  const faites = p.rues_faites_noms || [];
  const b = p.balade;
  // L'avancement se compte en commerces : ceux qu'on prévoit (les vitrines
  // OSM de chaque rue, puis le vrai compte dès que la balade l'a donné) et
  // ceux qu'ALX a lus. Un pourcentage qui ne recule pas, plutôt que des minutes qui dansent.
  const comptes = p.comptes || {};
  const prevus = retenues.reduce((a, nom) => a + (comptes[nom]?.prevus ?? rues.find((r) => r.nom === nom)?.commerces ?? 0), 0);
  const lus = retenues.reduce((a, nom) => a + (comptes[nom]?.lus ?? 0), 0);
  const avancement = prevus ? Math.min(1, lus / prevus) : 0;
  const pct = Math.round(avancement * 100);
  const approx = retenues.some((nom) => !comptes[nom]?.surs);
  // Pendant la balade, la part des pas ; pendant la lecture, le rang du commerce en cours dans sa rue.
  const fraction = b?.total ? { balade: b.pas / b.total } : b?.commerces ? b.commerce / b.commerces : null;
  // Le cercle doit rester plus grand que le texte qu'il entoure : « DES
  // COMMERCES » en capitales espacées est ce qui prend le plus de place.
  // 76 de rayon laisse une bonne marge, même sur un petit écran.
  const R = 76, C = 2 * Math.PI * R;
  return (
    <div className="mt-5 grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <CarteRues rues={rues} coches={new Set()} onChoisir={() => {}} centre={ville?.centre} direct={{ retenues, faites, enCours: p.rue_en_cours || null, fraction, position: b?.lat != null ? { lat: b.lat, lon: b.lon } : null }} className="h-[360px]" />
      <div className="flex flex-col items-center justify-center gap-4 rounded-[16px] border border-white/[0.07] px-5 py-6 text-center">
        <div className="relative grid place-items-center">
          <svg width="176" height="176" viewBox="0 0 176 176" className="-rotate-90">
            <circle cx="88" cy="88" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
            <circle cx="88" cy="88" r={R} fill="none" stroke="#96c0b8" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - avancement)} style={{ transition: "stroke-dashoffset .8s ease" }} />
          </svg>
          <div className="absolute flex flex-col items-center">
            <Nombre taille={30} teinte="#F3F7F5">{pct} %</Nombre>
            <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[.1em] text-[#8B938F]">des commerces</span>
          </div>
        </div>
        <div>
          <Etiquette>Avancement</Etiquette>
          <div className="mt-1.5 text-[13.5px] text-[#C3CBC7]">{lus} commerce{lus > 1 ? "s" : ""} sur {approx ? "~" : ""}{prevus} · {faites.length} rue{faites.length > 1 ? "s" : ""} sur {retenues.length}</div>
          <div className="mt-1 text-[12.5px] text-[#8B938F]">{p.rue_en_cours ? `${p.rue_en_cours}${b?.total ? ` · balade, pas ${b.pas}/${b.total}` : b?.commerces ? ` · ${b.commerce}/${b.commerces}` : ""}` : "…"}</div>
          <div className="mt-1 text-[12.5px] text-[#8B938F]">{p.proprietaires_trouves || 0} propriétaire{(p.proprietaires_trouves || 0) > 1 ? "s" : ""} trouvé{(p.proprietaires_trouves || 0) > 1 ? "s" : ""}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Ce qui défile pendant qu'ALX lit : le commerce en cours, puis les six
 * dernières lignes du journal, la plus récente en haut. Chaque ligne entre
 * par le haut ; on voit passer chaque commerce regardé.
 */
function FilDuParcours({ p }) {
  const lignes = (p.journal || []).slice(-6).reverse();
  return (
    <div className="mt-3 flex flex-col gap-1 pl-[26px]">
      {p.commerce_en_cours && <div className="text-[13.5px] text-[#C3CBC7]">→ {p.commerce_en_cours}</div>}
      {lignes.map((l, i) => (
        <div key={`${l.le}-${i}`} className="alx-entree flex gap-3 text-[12.5px] text-[#8B938F]" style={{ opacity: 1 - i * 0.13 }}>
          <span className="alx-mont shrink-0 tabular-nums text-[11px]">{heure(l.le)}</span>
          <span className="min-w-0 truncate">{l.texte}</span>
        </div>
      ))}
    </div>
  );
}

const ONGLETS = [["rues", "Rues"], ["commerces", "Commerces"], ["messages", "Messages"]];

/** Les trois onglets, avec le trait menthe qui glisse sous l'onglet ouvert. */
function Onglets({ onglet, onChange, compte }) {
  const barre = useRef(null);
  const [pos, setPos] = useState({ left: 14, width: 60 });
  const i = ONGLETS.findIndex(([k]) => k === onglet);
  const nombres = `${compte.rues}-${compte.commerces}-${compte.messages}`;
  useLayoutEffect(() => {
    const b = barre.current?.children[i];
    if (b) setPos({ left: b.offsetLeft + 16, width: b.offsetWidth - 32 });
  }, [i, nombres]);
  return (
    <div ref={barre} className="relative flex gap-1">
      {ONGLETS.map(([k, mot]) => (
        <button key={k} onClick={() => onChange(k)} className="px-[18px] py-3 text-[15px] transition-colors" style={{ background: "transparent", color: onglet === k ? "#F3F7F5" : "#8B938F" }}>
          {mot}{compte[k] != null ? <Nombre taille={12} teinte={onglet === k ? TEINTES.ecrire : TEINTES.muet} className="ml-2">{compte[k]}</Nombre> : null}
        </button>
      ))}
      <span className="absolute -bottom-px h-[2px] rounded-[2px] bg-menthe" style={{ left: pos.left, width: pos.width, transition: "left .32s cubic-bezier(.2,.8,.2,1), width .32s cubic-bezier(.2,.8,.2,1)" }} />
    </div>
  );
}

// --- Les rues -------------------------------------------------------------------------------

function PanneauRue({ rue, ecartee = false, coche, onCoche, onClasser, classerPending, enStreetView, onStreetView, onFlux, fluxPending, motifs = [], apprentissage = null, onClasserAussi }) {
  const [enAttente, setEnAttente] = useState(null); // la classe choisie, en attendant la raison
  const [motifCle, setMotifCle] = useState(null);
  const [motifTexte, setMotifTexte] = useState("");
  const rueNom = rue?.nom;
  const derniereRue = useRef(rueNom);
  if (derniereRue.current !== rueNom) { derniereRue.current = rueNom; if (enAttente) setEnAttente(null); }
  const valider = (sans = false) => { onClasser(rue.nom, enAttente, sans ? null : motifCle || "autre", sans ? null : motifTexte || null); setEnAttente(null); setMotifCle(null); setMotifTexte(""); };
  if (!rue) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-6 text-center">
        <div className="text-[15px] text-[#C3CBC7]">Cliquez une rue sur la carte.</div>
        <div className="text-[13px] text-[#8B938F]">Bleu, emplacement 1 ; ambre, 1 bis ; rouge, 2. Une rue cochée se dessine plus épaisse.</div>
      </div>
    );
  }
  const e = emplacementDe(ecartee ? null : rue.classe);
  const enseignes = rue.enseignes || rue.chaines || [];
  const flux = rue.flux || rue.flux_estime || null;
  const fluxMesure = !!rue.flux;
  return (
    <div className="flex h-full flex-col px-[26px] py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Etiquette teinte={e.teinte}>{ecartee ? "Écartée par ALX" : `Emplacement ${e.mot}`}</Etiquette>
          <div className="mt-2.5 text-[24px] font-light tracking-[-.02em] text-[#F3F7F5]">{rue.nom}</div>
        </div>
        {rue.centre && (
          <button
            type="button"
            onClick={onStreetView}
            title={enStreetView ? "Revenir à la carte" : "Voir la rue dans Street View"}
            aria-pressed={enStreetView}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border transition-colors"
            style={{ borderColor: enStreetView ? "#96c0b8" : "rgba(255,255,255,0.12)", color: enStreetView ? "#96c0b8" : "#8B938F", background: enStreetView ? "rgba(150,192,184,0.12)" : "transparent" }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z" />
              <circle cx="12" cy="11" r="2.2" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-1.5 text-[14px] text-[#8B938F]">{rue.motif}</div>
      <div className="mt-[22px] grid grid-cols-2 gap-x-5 gap-y-[18px]">
        {[
          ["Loyer", rue.loyer ? `${Math.round(rue.loyer[0])}–${Math.round(rue.loyer[1])} €/m²/an` : "—"],
          ["Prix au m²", euroM2(rue.prix_m2)],
          ["Vitrines", rue.commerces ?? "—"],
          ["Longueur", rue.longueur_m ? `${rue.longueur_m} m` : "—"],
        ].map(([mot, val]) => (
          <div key={mot}>
            <Etiquette className="!text-[9.5px]">{mot}</Etiquette>
            <div className="mt-1.5"><Nombre taille={16} teinte="#F3F7F5">{val}</Nombre></div>
          </div>
        ))}
        <div className="col-span-2">
          <Etiquette className="!text-[9.5px]">Flux{fluxMesure ? " · Data-B" : flux ? " · estimé" : ""}</Etiquette>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Etoiles note={flux?.note ?? null} taille={17} title={flux ? `piéton ${flux.pieton ?? "—"}/5 · voiture ${flux.voiture ?? "—"}/5` : "flux inconnu"} />
            {flux && <span className="text-[12px] text-[#8B938F]">piéton {flux.pieton ?? "—"} · voiture {flux.voiture ?? "—"}</span>}
            {!fluxMesure && (
              <button onClick={onFlux} disabled={fluxPending} className="text-[12px] text-menthe hover:text-menthe-clair disabled:opacity-50" style={{ background: "transparent" }} title="Étude d'implantation Data-B : un crédit, deux à cinq minutes">
                {fluxPending ? "Data-B lit la rue (2 à 5 min)…" : "Mesurer chez Data-B · 1 crédit"}
              </button>
            )}
          </div>
        </div>
      </div>
      {enseignes.length > 0 && <div className="mt-[22px] text-[14px] leading-[1.6] text-[#C3CBC7]">{enseignes.slice(0, 8).join(" · ")}</div>}
      <div className="mt-auto flex flex-col gap-4 pt-6">
        {!ecartee && (
          <div role="presentation" onClick={() => onCoche(!coche)} className="flex cursor-pointer items-center gap-3">
            <Case coche={coche} onChange={onCoche} taille={18} />
            <span className="text-[15px] text-[#E8EFEB]">{coche ? "Rue à prospecter" : "Prospecter cette rue"}</span>
          </div>
        )}
        {rue.correction && !enAttente && (
          <div className="text-[12.5px] text-[#8B938F]">Corrigée par vous{rue.correction.de ? ` : ${emplacementDe(rue.correction.de).mot} → ${emplacementDe(rue.correction.vers).mot}` : ""}{rue.correction.motif_cle ? ` · ${(motifs.find((m) => m.cle === rue.correction.motif_cle) || {}).mot || rue.correction.motif_cle}` : ""}{rue.correction.motif ? ` · ${rue.correction.motif}` : ""}</div>
        )}
        {rue.apprise && !rue.correction && <div className="text-[12.5px]" style={{ color: TEINTES.ecrire }}>Classée d'après vos corrections passées.</div>}
        {enAttente && (
          <div className="alx-entree flex flex-col gap-2.5 rounded-[12px] border border-white/[0.08] p-3.5">
            <div className="text-[13.5px] text-[#E8EFEB]">Pourquoi {emplacementDe(enAttente).mot} plutôt que {emplacementDe(rue.classe).mot} ?</div>
            <div className="flex flex-wrap gap-1.5">
              {motifs.map((m) => (
                <button key={m.cle} onClick={() => setMotifCle(m.cle)} title={m.detail} className="rounded-full border px-2.5 py-1 text-[12px] transition-colors" style={{ borderColor: motifCle === m.cle ? "#96c0b8" : "rgba(255,255,255,0.1)", color: motifCle === m.cle ? "#96c0b8" : "#C3CBC7", background: motifCle === m.cle ? "rgba(150,192,184,0.1)" : "transparent" }}>{m.mot}</button>
              ))}
            </div>
            <input value={motifTexte} onChange={(e) => setMotifTexte(e.target.value)} placeholder="Un mot de plus, si vous voulez" className="rounded-[10px] border border-white/[0.09] bg-[#0A0C0B] px-3 py-2 text-[13px] text-[#E8EFEB] outline-none focus:border-menthe/50" />
            <div className="flex flex-wrap items-center gap-2">
              <Bouton principal onClick={() => valider(false)} disabled={classerPending || !motifCle}>{classerPending ? "…" : "ALX retient"}</Bouton>
              <Bouton discret onClick={() => valider(true)} disabled={classerPending}>Sans raison</Bouton>
              <Bouton discret onClick={() => setEnAttente(null)}>Annuler</Bouton>
            </div>
          </div>
        )}
        {apprentissage && apprentissage.rue === rue.nom && !enAttente && (
          <div className="alx-entree flex flex-col gap-2 rounded-[12px] border border-menthe/25 p-3.5">
            <div className="text-[13px] text-[#C3CBC7]">
              {apprentissage.semblables.length
                ? `ALX retient. ${apprentissage.semblables.length} rue${apprentissage.semblables.length > 1 ? "s" : ""} de la ville ressemble${apprentissage.semblables.length > 1 ? "nt" : ""} : les passer en ${emplacementDe(apprentissage.vers).mot} aussi ?`
                : "ALX retient. Aucune autre rue de la ville ne ressemble à celle-ci."}
            </div>
            {apprentissage.semblables.map((x) => (
              <div key={x.nom} className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2 text-[12.5px]">
                <span className="min-w-0 truncate text-[#E8EFEB]">{x.nom} <span className="text-[#8B938F]">· {x.commerces} vitrines{x.longueur_m ? ` sur ${x.longueur_m} m` : ""}{x.loyer ? ` · ${Math.round(x.loyer[0])}–${Math.round(x.loyer[1])} €` : ""}</span></span>
                <button onClick={() => onClasserAussi([x.nom])} className="shrink-0 text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Aussi</button>
              </div>
            ))}
            {apprentissage.semblables.length > 1 && <div><Bouton onClick={() => onClasserAussi(apprentissage.semblables.map((x) => x.nom))} disabled={classerPending}>Toutes les {apprentissage.semblables.length}</Bouton></div>}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <span className="text-[13.5px] text-[#8B938F]">{ecartee ? "Reprendre en" : "Reclasser en"}</span>
          {EMPLACEMENTS.map((x) => {
            const on = !ecartee && x.classe === rue.classe;
            return (
              <button
                key={x.classe}
                disabled={classerPending || on}
                onClick={() => (ecartee ? onClasser(rue.nom, x.classe) : setEnAttente(x.classe))}
                className="alx-mont h-[30px] min-w-[34px] rounded-[9px] border px-2.5 text-[12px] font-medium tabular-nums"
                style={{ borderColor: on ? "#96c0b8" : "rgba(255,255,255,0.12)", background: on ? "rgba(150,192,184,0.12)" : "transparent", color: on ? "#96c0b8" : x.teinte }}
              >
                {x.court.replace("N°", "")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Une case pleine d'une teinte : « toutes les rues de cette couleur ». */
function CaseTeinte({ teinte, title, onClick }) {
  return <button type="button" onClick={onClick} title={title} className="h-4 w-4 rounded-[4px] border transition-transform hover:scale-110" style={{ borderColor: teinte, background: teinte }} />;
}

/** Pourquoi cette rue est en 1, 1 bis ou 2 : son rang dans la ville, écrit dans son motif. */
function pourquoiEmplacement(r) {
  const e = emplacementDe(r.classe);
  const base = r.motif || (r.loyer ? `loyer ${Math.round(r.loyer[0])}–${Math.round(r.loyer[1])} €/m²/an` : "loyer inconnu");
  return `Emplacement ${e.mot} : ${base}. L'emplacement est un rang dans la ville : les 10 % de rues les plus chères sont en 1, jusqu'à 35 % en 1 bis, le reste en 2. ${e.detail.charAt(0).toUpperCase() + e.detail.slice(1)}.`;
}

const valeurTri = (r, cle) => (cle === "classe" ? r.classe || 9 : cle === "loyer" ? (r.loyer ? (r.loyer[0] + r.loyer[1]) / 2 : 0) : r.prix_m2 || 0);

function OngletRues({ ville, onProspecter, pending, onClasser, classerPending, onFlux, fluxPending, motifs = [], apprentissage = null, onClasserAussi }) {
  const rues = ville?.rues || [];
  const ecartees = ville?.rues_ecartees || [];
  const enCours = ville?.parcours?.etat === "en_cours" && ville?.parcours?.phase === "rues";
  const [coches, setCoches] = useState(() => new Set(rues.filter((r) => r.retenue).map((r) => r.nom)));
  const [choisie, setChoisieBrute] = useState(null);
  const [tri, setTri] = useState(null);
  const [streetView, setStreetView] = useState(false);
  // Changer de rue ramène la carte : Street View est un coup d'œil, pas un mode.
  const setChoisie = (nom) => { setChoisieBrute(nom); setStreetView(false); };
  const bascule = (nom, oui) => setCoches((c) => { const n = new Set(c); if (oui) n.add(nom); else n.delete(nom); return n; });
  const rueChoisie = rues.find((r) => r.nom === choisie) || null;
  const ecarteeChoisie = !rueChoisie ? ecartees.find((r) => r.nom === choisie) || null : null;
  const triees = useMemo(() => {
    const avecRang = rues.map((r, i) => ({ ...r, rang: i + 1 }));
    if (!tri) return avecRang;
    return [...avecRang].sort((a, b) => (tri === "classe" ? valeurTri(a, tri) - valeurTri(b, tri) : valeurTri(b, tri) - valeurTri(a, tri)));
  }, [rues, tri]);
  const nSel = coches.size;
  const toutesCochees = rues.length > 0 && rues.every((r) => coches.has(r.nom));

  if (rues.length === 0 && ecartees.length === 0) {
    return <div className="mt-7 rounded-[16px] border border-white/[0.07] px-6 py-8 text-center text-[14px] text-[#8B938F]">{enCours ? "ALX relève les rues du centre : une minute." : "Aucune rue encore : lancez ALX, il lit le centre sur OpenStreetMap et propose les rues en une minute."}</div>;
  }

  const colonnes = [["classe", "Emplacement"], ["loyer", "Loyer au m²"], ["prix", "Prix au m²"]];
  return (
    <div className="alx-entree mt-7">
      <div className="grid grid-cols-1 items-stretch gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <CarteRues
          rues={rues}
          ecartees={ecartees}
          coches={coches}
          choisie={choisie}
          onChoisir={setChoisie}
          centre={ville?.centre}
          streetView={streetView && (rueChoisie || ecarteeChoisie)?.centre ? { ...(rueChoisie || ecarteeChoisie).centre, nom: choisie } : null}
          className="h-full min-h-[440px] max-md:h-[340px] max-md:min-h-0"
        />
        <div className="min-h-[440px] rounded-[16px] border border-white/[0.07] max-md:min-h-[220px]">
          <PanneauRue
            rue={rueChoisie || ecarteeChoisie}
            ecartee={!!ecarteeChoisie}
            coche={!!rueChoisie && coches.has(rueChoisie.nom)}
            onCoche={(oui) => rueChoisie && bascule(rueChoisie.nom, oui)}
            onClasser={onClasser}
            classerPending={classerPending}
            enStreetView={streetView}
            onStreetView={() => setStreetView((x) => !x)}
            onFlux={() => onFlux(choisie)}
            fluxPending={fluxPending === choisie}
            motifs={motifs}
            apprentissage={apprentissage}
            onClasserAussi={onClasserAussi}
          />
        </div>
      </div>

      <div className="mt-[30px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-[#8B938F]">
          <span>{nSel ? `${nSel} rue${nSel > 1 ? "s" : ""} sélectionnée${nSel > 1 ? "s" : ""}` : "Cochez les rues à prospecter"}</span>
          <span className="flex items-center gap-2 pl-1">
            {EMPLACEMENTS.map((e) => (
              <CaseTeinte key={e.classe} teinte={e.teinte} title={`Toutes les rues en emplacement ${e.mot}`} onClick={() => setCoches(new Set(rues.filter((r) => r.classe === e.classe).map((r) => r.nom)))} />
            ))}
          </span>
        </div>
        <Bouton principal disabled={!nSel || pending} onClick={() => onProspecter([...coches])}>{pending ? "…" : nSel ? `Prospecter ${nSel} rue${nSel > 1 ? "s" : ""}` : "Prospecter"}</Bouton>
      </div>

      <div className="mt-7 grid grid-cols-[28px_minmax(0,1fr)_120px_170px_150px] items-center gap-x-4 border-b border-white/[0.07] px-1.5 pb-3 max-md:grid-cols-[28px_minmax(0,1fr)_110px]">
        <Case coche={toutesCochees} onChange={(oui) => setCoches(oui ? new Set(rues.map((r) => r.nom)) : new Set())} />
        <Etiquette>Rue</Etiquette>
        {colonnes.map(([k, mot], i) => (
          <button key={k} onClick={() => setTri((t) => (t === k ? null : k))} className={`alx-mont text-right text-[10px] font-medium uppercase tracking-[.14em] ${i > 0 ? "max-md:hidden" : ""}`} style={{ background: "transparent", color: tri === k ? "#96c0b8" : "#8B938F" }}>
            {tri === k ? "↓ " : ""}{mot}
          </button>
        ))}
      </div>
      {triees.map((r) => {
        const e = emplacementDe(r.classe);
        const on = coches.has(r.nom);
        return (
          <div
            key={r.nom}
            onClick={() => setChoisie(r.nom)}
            className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_120px_170px_150px] items-center gap-x-4 border-b border-white/[0.05] px-1.5 py-3.5 transition-colors hover:bg-white/[0.028] max-md:grid-cols-[28px_minmax(0,1fr)_110px]"
            style={{ background: choisie === r.nom ? "rgba(150,192,184,0.06)" : on ? "rgba(150,192,184,0.03)" : undefined }}
          >
            <Case coche={on} onChange={(oui) => bascule(r.nom, oui)} />
            <span className="flex min-w-0 items-baseline gap-2.5">
              <Nombre taille={12} teinte={TEINTES.muet} className="w-6 shrink-0">{String(r.rang).padStart(2, "0")}</Nombre>
              <span className="truncate text-[16px] font-light text-[#F3F7F5]">{r.nom}</span>
              {r.parcourue_le && <Etiquette teinte={TEINTES.ecrire} className="!text-[9px]">prospectée</Etiquette>}
            </span>
            <span className="flex items-center justify-end gap-2">
              <Nombre taille={14.5} teinte={e.teinte} className="font-medium">{e.court}</Nombre>
              <span className="alx-bulle grid h-4 w-4 cursor-help place-items-center rounded-full border border-white/[0.16] text-[9.5px] text-[#8B938F]" data-bulle={pourquoiEmplacement(r)} onClick={(ev) => ev.stopPropagation()}>i</span>
            </span>
            <Nombre taille={14.5} teinte="#F3F7F5" className="text-right max-md:hidden">{r.loyer ? `${fmt(Math.round(r.loyer[0]))}–${fmt(Math.round(r.loyer[1]))} €/m²` : "—"}</Nombre>
            <Nombre taille={14.5} teinte="#C3CBC7" className="text-right max-md:hidden">{euroM2(r.prix_m2)}</Nombre>
          </div>
        );
      })}
      {ecartees.length > 0 && (
        <details className="mt-4 px-1.5 text-[12.5px] text-[#8B938F]">
          <summary className="cursor-pointer hover:text-[#E8EFEB]">{ecartees.length} rue{ecartees.length > 1 ? "s" : ""} écartée{ecartees.length > 1 ? "s" : ""} par ALX (loyer trop bas) : en gris sur la carte, reprenables d'un clic</summary>
          <div className="mt-2 flex flex-col gap-1">{ecartees.map((r) => <button key={r.nom} onClick={() => setChoisie(r.nom)} className="text-left hover:text-[#E8EFEB]" style={{ background: "transparent" }}><span className="text-[#C3CBC7]">{r.nom}</span> · {r.motif}</button>)}</div>
        </details>
      )}
      <div className="mt-6 text-right"><Link to={`/ALXVilles?ville=${ville?.id}`} className="text-[13px] text-[#8B938F] hover:text-[#E8EFEB]">Corriger le classement à la main →</Link></div>
    </div>
  );
}

// --- Les commerces --------------------------------------------------------------------------

/** Le prix d'un commerce, tel qu'on peut le connaître : la fourchette calculée, sinon l'idée d'après la vitrine. */
const prixDe = (c) => {
  const v = c.valorisation || {};
  const f = v.fourchette || v.fourchette_estimee;
  return f ? { milieu: (f[0] + f[1]) / 2, bas: f[0], haut: f[1], estime: !v.fourchette } : null;
};
const kEuros = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(n % 1000000 ? 1 : 0).replace(".", ",")} M€` : `${Math.round(n / 1000)} k€`);
const TRANCHES = [["200 – 350 k€", 200000, 350000], ["350 – 500 k€", 350000, 500000], ["500 k€ – 1 M€", 500000, 1000000], ["1 M€ et plus", 1000000, null]];

function OngletCommerces({ ville, cibles, onOuvrir, onRediger, pending }) {
  const [filtre, setFiltre] = useState("interessants");
  const [rue, setRue] = useState("");
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState("urgence"); // urgence | prix_desc | prix_asc
  const [tranche, setTranche] = useState({ min: "", max: "" }); // en euros, saisis en k€
  const [page, setPage] = useState(1);
  const min = Number(tranche.min) * 1000 || null;
  const max = Number(tranche.max) * 1000 || null;
  const dansLaTranche = (c) => {
    if (!min && !max) return true;
    const p = prixDe(c);
    if (!p) return false;
    return (!min || p.haut >= min) && (!max || p.bas <= max);
  };
  const PAR_PAGE = 40;
  const simple = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = simple(recherche.trim());
  const enCours = ville?.parcours?.etat === "en_cours" && ville?.parcours?.phase === "commerces";
  const interessants = cibles.filter((c) => ["appeler", "ecrire"].includes(c.pile));
  const liste = cibles
    .filter((c) => (q ? true : filtre === "interessants" ? ["appeler", "ecrire"].includes(c.pile) : filtre === "ecartes" ? c.pile === "ecartee" : filtre === "surveiller" ? c.pile === "surveiller" : true))
    .filter((c) => !rue || c.rue === rue)
    .filter((c) => !q || simple(`${c.enseigne} ${c.adresse} ${c.proprietaire?.nom || ""} ${c.activite || ""}`).includes(q))
    .filter(dansLaTranche)
    .sort((a, b) => {
      if (tri === "urgence") return urgenceDe(b).niveau - urgenceDe(a).niveau;
      const pa = prixDe(a)?.milieu, pb = prixDe(b)?.milieu;
      if (pa == null && pb == null) return urgenceDe(b).niveau - urgenceDe(a).niveau;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return tri === "prix_desc" ? pb - pa : pa - pb;
    });
  const avecPrix = cibles.filter((c) => prixDe(c)).length;
  const rues = [...new Set(cibles.map((c) => c.rue).filter(Boolean))];
  const sansMessage = interessants.filter((c) => !c.brouillon);
  const filtres = [["interessants", "Intéressants", interessants.length], ["surveiller", "À surveiller", cibles.filter((c) => c.pile === "surveiller").length], ["ecartes", "Écartés", cibles.filter((c) => c.pile === "ecartee").length], ["tous", "Tous", cibles.length]];

  return (
    <div className="alx-entree">
      <div className="mt-6 flex items-center gap-3 rounded-full border border-white/[0.09] bg-[#0A0C0B] py-[7px] pl-5 pr-3 focus-within:border-menthe/50">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#8B938F" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} placeholder="Chercher un commerce, une adresse, un propriétaire" className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-[14.5px] text-[#E8EFEB] outline-none" />
        {recherche && <button onClick={() => setRecherche("")} className="px-1.5 text-[16px] leading-none text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>×</button>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
          {filtres.map(([k, mot, n]) => (
            <button key={k} onClick={() => { setFiltre(k); setPage(1); }} className="hover:text-[#E8EFEB]" style={{ background: "transparent", color: filtre === k ? "#F3F7F5" : "#8B938F" }}>
              {mot} <Nombre taille={12} teinte={filtre === k ? TEINTES.ecrire : TEINTES.muet}>{n}</Nombre>
            </button>
          ))}
          {rues.length > 1 && (
            <select value={rue} onChange={(e) => { setRue(e.target.value); setPage(1); }} className="rounded-full border border-white/[0.1] bg-transparent px-3 py-1.5 text-[12.5px] text-[#C3CBC7] outline-none">
              <option value="" className="bg-[#0D0F0E]">Toutes les rues</option>
              {rues.map((r) => <option key={r} value={r} className="bg-[#0D0F0E]">{r}</option>)}
            </select>
          )}
        </div>
        {sansMessage.length > 0 && filtre === "interessants" && (
          <Bouton disabled={pending} onClick={() => onRediger(sansMessage.map((c) => c.id))}>{pending ? "…" : `Rédiger les ${sansMessage.length} messages`}</Bouton>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-[#8B938F]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Prix</span>
          {TRANCHES.map(([mot, a, b]) => {
            const on = min === a && (max === b || (!b && !max));
            return (
              <button key={mot} onClick={() => setTranche(on ? { min: "", max: "" } : { min: String(a / 1000), max: b ? String(b / 1000) : "" })} className="rounded-full border px-2.5 py-1 transition-colors" style={{ borderColor: on ? "#96c0b8" : "rgba(255,255,255,0.1)", color: on ? "#96c0b8" : "#8B938F", background: on ? "rgba(150,192,184,0.1)" : "transparent" }}>{mot}</button>
            );
          })}
          <span className="flex items-center gap-1.5">
            <input value={tranche.min} onChange={(e) => { setTranche((t) => ({ ...t, min: e.target.value.replace(/[^\d]/g, "") })); setPage(1); }} placeholder="min" className="w-[58px] rounded-full border border-white/[0.1] bg-transparent px-2.5 py-1 text-right text-[12.5px] text-[#E8EFEB] outline-none focus:border-menthe/50" />
            <span>–</span>
            <input value={tranche.max} onChange={(e) => { setTranche((t) => ({ ...t, max: e.target.value.replace(/[^\d]/g, "") })); setPage(1); }} placeholder="max" className="w-[58px] rounded-full border border-white/[0.1] bg-transparent px-2.5 py-1 text-right text-[12.5px] text-[#E8EFEB] outline-none focus:border-menthe/50" />
            <span>k€</span>
            {(tranche.min || tranche.max) && <button onClick={() => setTranche({ min: "", max: "" })} className="text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>×</button>}
          </span>
          <span className="text-[#5A6762]">{avecPrix} commerce{avecPrix > 1 ? "s" : ""} avec un prix</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Trier</span>
          {[["urgence", "urgence"], ["prix_desc", "prix ↓"], ["prix_asc", "prix ↑"]].map(([k, mot]) => (
            <button key={k} onClick={() => setTri(k)} className="hover:text-[#E8EFEB]" style={{ background: "transparent", color: tri === k ? "#F3F7F5" : "#8B938F" }}>{mot}</button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_220px_200px_150px_110px] items-center gap-x-4 border-b border-white/[0.07] px-1.5 pb-3 max-md:grid-cols-[minmax(0,1fr)_90px]">
        <Etiquette>Commerce</Etiquette>
        <Etiquette className="max-md:hidden">Rue</Etiquette>
        <Etiquette className="max-md:hidden">Propriétaire</Etiquette>
        <Etiquette className="text-right max-md:hidden">Prix</Etiquette>
        <Etiquette className="text-right">Urgence</Etiquette>
      </div>
      {liste.length === 0 && (
        <p className="m-0 px-1.5 py-6 text-[13.5px] text-[#8B938F]">{cibles.length ? "Rien avec ce filtre." : enCours ? "Les commerces arrivent rue par rue." : "Cochez des rues dans l'onglet Rues, puis lancez la prospection."}</p>
      )}
      {liste.slice(0, page * PAR_PAGE).map((c) => (
        <div
          key={c.id}
          onClick={() => onOuvrir(c.id)}
          className="alx-entree grid cursor-pointer grid-cols-[minmax(0,1fr)_220px_200px_150px_110px] items-center gap-x-4 border-b border-white/[0.05] px-1.5 py-[15px] transition-colors hover:bg-white/[0.028] max-md:grid-cols-[minmax(0,1fr)_90px]"
        >
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-light text-[#F3F7F5]">{joliNom(c.enseigne) || "Sans enseigne"}</span>
            <span className="block truncate text-[12.5px] text-[#8B938F] md:hidden">{c.adresse}</span>
          </span>
          <span className="min-w-0 truncate text-[14px] text-[#C3CBC7] max-md:hidden">{c.adresse}</span>
          <span className="min-w-0 truncate text-[14px] text-[#C3CBC7] max-md:hidden">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : c.foncier ? "Plusieurs, à départager" : <span className="text-[#8B938F]">à établir</span>}</span>
          <span className="text-right max-md:hidden">
            {(() => { const p = prixDe(c); return p ? <Nombre taille={14} teinte={p.estime ? "#8B938F" : "#F3F7F5"} title={p.estime ? "d'après la vitrine, une idée" : "d'après la surface"}>{p.estime ? "~ " : ""}{kEuros(p.bas)} – {kEuros(p.haut)}</Nombre> : <span className="text-[13px] text-[#5A6762]">—</span>; })()}
          </span>
          <span className="flex justify-end"><Urgence c={c} compact /></span>
        </div>
      ))}
      {liste.length > page * PAR_PAGE && <button onClick={() => setPage(page + 1)} className="w-full px-1.5 py-3 text-left text-[12.5px] text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Voir {Math.min(PAR_PAGE, liste.length - page * PAR_PAGE)} de plus</button>}
      <div className="mt-[22px] pb-[22px] text-[13.5px] text-[#8B938F]">
        {enCours ? "ALX continue de lire les commerces des rues cochées." : liste.length ? `${liste.length} commerce${liste.length > 1 ? "s" : ""}, dans l'ordre où les démarcher. Cliquez pour ouvrir la fiche.` : ""}
      </div>
    </div>
  );
}

// --- Les messages ---------------------------------------------------------------------------

function OngletMessages({ cibles, onOuvrir, cibleDemandee = null }) {
  const qc = useQueryClient();
  const avec = cibles.filter((c) => c.brouillon).sort((a, b) => urgenceDe(b).niveau - urgenceDe(a).niveau);
  const [choisi, setChoisi] = useState(cibleDemandee);
  const c = avec.find((x) => x.id === choisi) || avec[0] || null;
  // Le message se corrige sur place : l'objet et le texte, puis Enregistrer.
  const [texte, setTexte] = useState(null); // null tant qu'on n'a pas touché
  const [objet, setObjet] = useState(null);
  const cleTexte = c ? `${c.id}:${c.brouillon?.redige_le || ""}` : null;
  const derniereCle = useRef(cleTexte);
  if (cleTexte !== derniereCle.current) { derniereCle.current = cleTexte; if (texte !== null) setTexte(null); if (objet !== null) setObjet(null); }
  const modifie = c && ((texte !== null && texte !== c.brouillon.texte) || (objet !== null && objet !== (c.brouillon.objet || "")));
  const reecrire = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal: c?.brouillon?.canal || "mail" } }),
    onSuccess: () => { toast.success("Réécrit"); setTexte(null); setObjet(null); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const enregistrer = useMutation({
    mutationFn: () => base44.request("PUT", `/api/alx/cibles/${c.id}`, { body: { brouillon: { ...c.brouillon, texte: texte ?? c.brouillon.texte, objet: objet ?? c.brouillon.objet, corrige_le: new Date().toISOString() } } }),
    onSuccess: () => { toast.success("Message enregistré"); setTexte(null); setObjet(null); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!avec.length) return <div className="mt-7 rounded-[16px] border border-white/[0.07] px-6 py-8 text-center text-[14px] text-[#8B938F]">Aucun message encore : ouvrez un commerce et cliquez « Rédiger le message ».</div>;

  return (
    <div className="alx-entree mt-7 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="overflow-hidden rounded-[16px] border border-white/[0.07]">
        <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <Etiquette>À relire</Etiquette>
          <Nombre taille={13} teinte={TEINTES.ecrire}>{avec.length} en attente</Nombre>
        </div>
        <div className="max-h-[560px] overflow-auto">
          {avec.map((x) => (
            <button
              key={x.id}
              onClick={() => setChoisi(x.id)}
              className="block w-full border-b border-white/[0.05] px-5 py-4 text-left transition-colors hover:bg-white/[0.028]"
              style={{ background: c?.id === x.id ? "rgba(150,192,184,0.05)" : "transparent", borderLeft: `2px solid ${c?.id === x.id ? "#96c0b8" : "transparent"}` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15.5px] font-light text-[#F3F7F5]">{joliNom(x.enseigne) || x.adresse}</span>
                <Etiquette teinte={TEINTES.ecrire} className="shrink-0 whitespace-nowrap !text-[9px]">à relire</Etiquette>
              </div>
              <div className="mt-1 truncate text-[13px] text-[#8B938F]">{x.proprietaire?.nom ? joliNom(x.proprietaire.nom) : "propriétaire à établir"} · {x.rue || x.adresse}</div>
            </button>
          ))}
        </div>
      </div>

      {c && (
        <div key={c.id} className="alx-entree flex min-h-[420px] flex-col rounded-[16px] border border-white/[0.07] px-7 py-[26px]">
          <Etiquette teinte="#c3ddd6">{c.brouillon.canal === "courrier" ? "Courrier" : "E-mail"}{c.brouillon.corrige_le ? " · corrigé" : ""}</Etiquette>
          <div className="mt-3 text-[22px] font-light tracking-[-.02em] text-[#F3F7F5]">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : "Propriétaire à établir"}</div>
          <div className="mt-1 text-[13.5px] text-[#8B938F]">{joliNom(c.enseigne) || ""} · {c.adresse}</div>
          <input
            value={objet ?? c.brouillon.objet ?? ""}
            onChange={(e) => setObjet(e.target.value)}
            placeholder="Objet"
            className="mt-[18px] border-0 border-b border-white/[0.07] bg-transparent py-2 text-[15px] text-[#E8EFEB] outline-none focus:border-menthe/50"
          />
          <textarea
            value={texte ?? c.brouillon.texte ?? ""}
            onChange={(e) => setTexte(e.target.value)}
            rows={Math.max(10, ((texte ?? c.brouillon.texte ?? "").match(/\n/g) || []).length + 3)}
            className="mt-3 w-full resize-y border-0 bg-transparent text-[15px] leading-[1.7] text-[#C3CBC7] outline-none"
          />
          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-[22px]">
            <Bouton principal onClick={() => enregistrer.mutate()} disabled={!modifie || enregistrer.isPending}>{enregistrer.isPending ? "…" : modifie ? "Enregistrer" : "Enregistré"}</Bouton>
            <Bouton onClick={() => reecrire.mutate(c.id)} disabled={reecrire.isPending}>{reecrire.isPending ? "ALX réécrit…" : "Réécrire"}</Bouton>
            <Bouton discret onClick={() => onOuvrir(c.id)}>La fiche</Bouton>
          </div>
        </div>
      )}
    </div>
  );
}

// --- La page d'une ville ----------------------------------------------------------------------

function VillePage({ villeId, ville: villeListe, onNouvelle, onSuivante, ongletDemande = null, cibleDemandee = null }) {
  const qc = useQueryClient();
  const { data: ville } = useQuery({
    queryKey: ["alx-ville", villeId],
    queryFn: () => base44.request("GET", `/api/alx/villes/${villeId}`),
    refetchInterval: (q) => (q.state.data?.parcours?.etat === "en_cours" ? 3000 : false),
    placeholderData: villeListe,
  });
  const enCours = ville?.parcours?.etat === "en_cours";
  const { data: cibles = [] } = useQuery({
    queryKey: ["alx-cibles", villeId],
    queryFn: () => base44.request("GET", `/api/alx/cibles?ville=${villeId}`),
    refetchInterval: enCours ? 5000 : false,
  });
  const p = ville?.parcours;
  const rues = ville?.rues || [];
  const brouillons = cibles.filter((c) => c.brouillon).length;
  const [ongletChoisi, setOnglet] = useState(ongletDemande);
  const onglet = ongletChoisi || (brouillons ? "messages" : cibles.length ? "commerces" : "rues");
  const navigate = useNavigate();
  const ouvrirFiche = (id) => navigate(`/ALXCible?id=${id}`);

  // Quand le relevé des rues se termine pendant qu'on regarde, un avis le dit.
  const etatPrecedent = useRef(p?.etat);
  const nomVille = ville?.nom;
  const nRues = rues.length;
  useEffect(() => {
    if (etatPrecedent.current === "en_cours" && p?.etat === "rues_proposees") {
      avis.succes(`${nomVille} est prête.`, { description: `${nRues} rues classées, à cocher sur la carte.`, action: { mot: "Voir les rues", faire: () => setOnglet("rues") } });
    }
    etatPrecedent.current = p?.etat;
  }, [p?.etat, nomVille, nRues]);

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cibles", villeId] }); qc.invalidateQueries({ queryKey: ["alx-ville", villeId] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  const useGeste = (chemin, apres) => useMutation({
    mutationFn: (body) => base44.request("POST", `/api/alx/villes/${villeId}/${chemin}`, { body: body || {} }),
    onSuccess: () => { rafraichir(); if (apres) setOnglet(apres); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const lancer = useGeste("lancer", "rues");
  const prospecter = useGeste("parcourir", "commerces");
  const rediger = useGeste("rediger", "messages");
  const arreter = useGeste("arreter");
  const { data: etat } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 300000 });
  const [apprentissage, setApprentissage] = useState(null); // { rue, vers, semblables } après une correction
  const classer = useMutation({
    mutationFn: ({ nom, classe, motif_cle = null, motif = null }) => base44.request("POST", `/api/alx/villes/${villeId}/rues`, { body: { nom, classe, motif_cle, motif } }),
    onSuccess: (r, { nom, classe, motif_cle }) => { rafraichir(); setApprentissage(motif_cle ? { rue: nom, vers: classe, motif_cle, semblables: r.semblables || [] } : null); },
    onError: (e) => toast.error(e?.message || "Reclassement impossible"),
  });
  const classerAussi = useMutation({
    mutationFn: async (noms) => { for (const nom of noms) await base44.request("POST", `/api/alx/villes/${villeId}/rues`, { body: { nom, classe: apprentissage.vers, motif_cle: apprentissage.motif_cle, motif: `comme ${apprentissage.rue}` } }); return noms; },
    onSuccess: (noms) => { toast.success(`${noms.length} rue${noms.length > 1 ? "s" : ""} reclassée${noms.length > 1 ? "s" : ""} aussi`); rafraichir(); setApprentissage((a) => (a ? { ...a, semblables: a.semblables.filter((x) => !noms.includes(x.nom)) } : a)); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const flux = useMutation({
    mutationFn: (nom) => base44.request("POST", `/api/alx/villes/${villeId}/rues/${encodeURIComponent(nom)}/flux`, { body: {} }),
    onSuccess: (r, nom) => { toast.success(`${nom} : flux ${String(r.flux.note).replace(".", ",")} sur 5`, { description: `piéton ${r.flux.pieton ?? "—"}, voiture ${r.flux.voiture ?? "—"}${r.flux.du_cache ? " (étude déjà faite, aucun crédit)" : ""}` }); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Data-B n'a pas rendu le flux"),
  });

  const maintenant = enCeMoment(p, rues);
  const [motStatut, teinteStatut] = statutDe(p?.etat);

  return (
    <div className="relative mx-auto max-w-[1060px] pt-[22px]">
      <div aria-hidden className="pointer-events-none absolute -right-[220px] -top-[240px] z-0 h-[540px] w-[760px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.075),transparent)" }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="alx-serif m-0 text-[42px] italic tracking-[-.01em] text-[#F3F7F5]">{ville?.nom}</h1>
            <div className="mt-1 text-[13.5px] text-[#8B938F]">
              <span style={{ color: teinteStatut }}>{motStatut}</span>
              {ville?.recensement?.le ? ` · relevé du ${dateCourte(ville.recensement.le)} · ${fmt(ville.recensement.commerces_total)} vitrines` : ""}
              {` · ${pluriel(rues.length, "rue", "rues")} · ${pluriel(cibles.length, "commerce analysé", "commerces analysés")} · ${pluriel(brouillons, "message", "messages")}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-3">
            {[["←", "Toutes les villes", onNouvelle], ["→", "Ville suivante", onSuivante]].map(([fleche, title, faire]) => (
              <button
                key={fleche}
                onClick={faire || undefined}
                title={title}
                disabled={!faire}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.12] text-[16px] text-[#8B938F] transition-colors hover:border-white/[0.3] hover:text-[#E8EFEB] disabled:opacity-30"
                style={{ background: "transparent" }}
              >
                {fleche}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[26px] flex flex-wrap items-end justify-between gap-x-6 border-b border-white/[0.07]">
          <Onglets onglet={onglet} onChange={setOnglet} compte={{ rues: rues.length, commerces: cibles.length, messages: brouillons }} />
          <div className="flex items-center gap-4 pb-3 text-[12.5px]">
            {enCours ? (
              <button onClick={() => arreter.mutate()} disabled={arreter.isPending} className="text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>Arrêter</button>
            ) : (
              <button onClick={() => lancer.mutate()} disabled={lancer.isPending} title="Relit la commune sur OpenStreetMap et repropose les rues" className="text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>{lancer.isPending ? "…" : rues.length ? "Refaire les rues" : "Lancer ALX"}</button>
            )}
          </div>
        </div>


        {maintenant && (
          <div className="mb-2 mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-3 shrink-0 items-end gap-[5px]">
                {[0, 0.18, 0.36].map((d) => <span key={d} className="alx-vague h-[5px] w-[5px] rounded-full bg-menthe" style={{ animationDelay: `${d}s` }} />)}
              </span>
              <span className="text-[15px] text-[#C3CBC7]">{maintenant.texte}</span>
            </div>
            {maintenant.reste && p.phase !== "commerces" && <span className="shrink-0 text-[13.5px] text-[#8B938F]">Temps restant : <Nombre taille={13.5} teinte="#C3CBC7">{maintenant.reste}</Nombre></span>}
          </div>
        )}
        {maintenant && p.phase === "commerces" && <Direct ville={ville} p={p} />}
        {maintenant && <FilDuParcours p={p} />}

        {onglet === "rues" && <OngletRues key={rues.length} ville={ville} onProspecter={(noms) => prospecter.mutate({ rues: noms })} pending={prospecter.isPending} onClasser={(nom, classe, motif_cle, motif) => classer.mutate({ nom, classe, motif_cle, motif })} classerPending={classer.isPending || classerAussi.isPending} onFlux={(nom) => flux.mutate(nom)} fluxPending={flux.isPending ? flux.variables : null} motifs={etat?.motifs_rue || []} apprentissage={apprentissage} onClasserAussi={(noms) => classerAussi.mutate(noms)} />}
        {onglet === "commerces" && <OngletCommerces ville={ville} cibles={cibles} onOuvrir={ouvrirFiche} onRediger={(ids) => rediger.mutate({ cibles: ids })} pending={rediger.isPending} />}
        {onglet === "messages" && <OngletMessages cibles={cibles} onOuvrir={ouvrirFiche} cibleDemandee={cibleDemandee} />}

        {!enCours && onglet === "commerces" && <div className="mt-2 flex justify-end"><AjoutCommerce villeId={villeId} ville={ville} onAjoute={rafraichir} /></div>}
      </div>

    </div>
  );
}

function AjoutCommerce({ villeId, ville, onAjoute }) {
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState({ adresse: "", enseigne: "", activite: "", rue: "" });
  const rues = ville?.rues || [];
  const poser = (k) => (x) => setF((s) => ({ ...s, [k]: x }));
  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/cibles", { body: { ville_id: villeId, adresse: f.adresse, enseigne: f.enseigne || null, activite: f.activite || null, rue: f.rue || null } }),
    onSuccess: (r) => {
      toast.success(r.deja ? "Ce commerce existe déjà" : `${r.cible.enseigne || r.cible.adresse} ajouté, classé « ${PILES.find((x) => x.cle === r.cible.pile)?.mot || r.cible.pile} »`);
      setF({ adresse: "", enseigne: "", activite: "", rue: f.rue });
      onAjoute(r.cible);
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!ouvert) return <Bouton discret onClick={() => setOuvert(true)} title="Un commerce qu'ALX n'a pas vu : adresse et enseigne, il fait le reste">+ Ajouter un commerce</Bouton>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (f.adresse.trim() && !creer.isPending) creer.mutate(); }} className="flex w-full flex-col gap-4 rounded-[16px] border border-white/[0.07] p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <Champ label="Adresse" value={f.adresse} onChange={poser("adresse")} placeholder="12 rue d'Antibes" />
        <Champ label="Enseigne" value={f.enseigne} onChange={poser("enseigne")} placeholder="Maison Peirano" />
        <Champ label="Activité" value={f.activite} onChange={poser("activite")} placeholder="épicerie fine" />
        <label className="block">
          <Etiquette className="mb-1.5">Rue classée</Etiquette>
          <select value={f.rue} onChange={(e) => poser("rue")(e.target.value)} className="w-full rounded-[10px] border border-white/[0.09] bg-[#0A0C0B] px-4 py-3 text-[15px] text-[#E8EFEB] outline-none focus:border-menthe/50">
            <option value="">Hors classement</option>
            {rues.map((r) => <option key={r.nom} value={r.nom}>{r.nom} · emplacement {emplacementDe(r.classe).mot}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Bouton type="submit" principal disabled={!f.adresse.trim() || creer.isPending}>{creer.isPending ? "…" : "Ajouter"}</Bouton>
        <Bouton discret onClick={() => setOuvert(false)}>Fermer</Bouton>
        <span className="text-[12px] text-[#8B938F]">Pour un commerce qu'ALX n'a pas vu. L'emplacement vient de la rue choisie ; le propriétaire se trouve ensuite sur la fiche.</span>
      </div>
    </form>
  );
}

export default function ALX() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const villeId = params.get("ville");
  const ongletDemande = ["rues", "commerces", "messages"].includes(params.get("onglet")) ? params.get("onglet") : null;
  const cibleDemandee = params.get("cible") || null;
  const { data: villes = [] } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes"), refetchInterval: (q) => ((q.state.data || []).some((v) => v.parcours?.etat === "en_cours") ? 5000 : false) });
  const ville = villes.find((v) => v.id === villeId);
  const ouvrir = (id) => setParams({ ville: id });
  const nouvelle = () => setParams({});
  const i = villes.findIndex((v) => v.id === villeId);
  const suivante = villes.length > 1 && i >= 0 ? () => ouvrir(villes[(i + 1) % villes.length].id) : null;

  if (!user || user.role !== "admin") return null;

  return (
    <div className="alx min-h-screen">
      <div className="mx-auto max-w-[1440px] px-[34px] pb-[70px] pt-[26px] max-md:px-4">
        {villeId ? <VillePage key={villeId} villeId={villeId} ville={ville} onNouvelle={nouvelle} onSuivante={suivante} ongletDemande={ongletDemande} cibleDemandee={cibleDemandee} /> : <Accueil villes={villes} onOuvrir={ouvrir} />}
        {!villeId && (
          <div className="mt-10 text-center text-[12.5px] text-[#8B938F]">
            <Link to="/ALXBilan" className="hover:text-[#E8EFEB]">Le bilan des approches →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
