import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast, avis } from "@/components/ui/avis";
import { PILES, EMPLACEMENTS, TEINTES, emplacementDe, Bouton, Etiquette, Nombre, Champ, Urgence, urgenceDe, joliNom } from "@/components/alx/alx-commun";
import CarteRues from "@/components/alx/CarteRues";
import FicheCommerce from "@/components/alx/FicheCommerce";

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

const ETAPES = [
  ["La ville", () => "Clients actifs lus dans Monday, avec leurs budgets."],
  ["Les rues", (p) => (p.phase === "rues" ? "Rues et vitrines du centre sur OpenStreetMap, loyer de chaque rue chez Data-B." : `${pluriel(p.rues_total || 0, "rue", "rues")} à parcourir, emplacement 1 d'abord.`)],
  ["Les commerces", (p) => `${pluriel(p.commerces_trouves || 0, "vitrine lue", "vitrines lues")} sur Google Maps, recoupées avec l'annuaire.`],
  ["Le propriétaire", (p) => `Data-B, adresse par adresse : ${pluriel(p.proprietaires_trouves || 0, "retrouvé", "retrouvés")}.`],
  ["La société et les gens", () => "Annuaire des entreprises, BODACC, DVF."],
  ["Le classement", (p) => `Trois piles, un motif par cible. ${pluriel(p.ecartees || 0, "écartée", "écartées")} avec motif.`],
  ["Le contact", (p) => `${pluriel(p.brouillons || 0, "message rédigé", "messages rédigés")}, en attente de votre relecture.`],
];

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

/** Les sept étapes et ce qui a déjà été trouvé : le détail du parcours, replié par défaut. */
function DetailParcours({ ville }) {
  const p = ville.parcours || {};
  const enCours = p.etat === "en_cours";
  const etape = p.etape || 1;
  const journal = (p.journal || []).slice(-6).reverse();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col">
        {ETAPES.map(([mot, detail], i) => {
          const rang = i + 1;
          const fait = !enCours || rang < etape || (p.phase === "commerces" && rang <= 2);
          const actif = enCours && rang === etape;
          return (
            <div key={mot} className="flex items-baseline gap-4 border-t border-white/[0.06] py-[15px]">
              <Nombre taille={12} teinte={actif ? TEINTES.ecrire : TEINTES.muet} className="w-[22px] shrink-0">{String(rang).padStart(2, "0")}</Nombre>
              <div className="min-w-0 flex-1">
                <div className="text-[16px]" style={{ color: fait ? "#C3CBC7" : actif ? "#F3F7F5" : "#8B938F" }}>{mot}{actif && p.rue_en_cours && rang >= 3 ? ` · ${p.rue_en_cours}` : ""}</div>
                <div className="text-[13px] text-[#8B938F]">{detail(p)}</div>
              </div>
              <Etiquette teinte={actif ? TEINTES.ecrire : TEINTES.muet} className="!text-[9.5px]">{fait ? "fait" : actif ? "en cours" : "à venir"}</Etiquette>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-[16px] border border-white/[0.07] px-[26px] pb-5 pt-6">
          <Etiquette teinte="#c3ddd6">{enCours ? "Déjà trouvé" : "Trouvé"}</Etiquette>
          <div className="mt-[18px] flex flex-col">
            {[
              ["Rues parcourues", `${p.rues_faites || 0}${p.rues_total ? ` / ${p.rues_total}` : ""}`, "#F3F7F5"],
              ["Commerces lus", fmt(p.commerces_trouves), "#F3F7F5"],
              ["Propriétaires retrouvés", fmt(p.proprietaires_trouves), "#F3F7F5"],
              ["Messages rédigés", fmt(p.brouillons), TEINTES.ecrire],
              ["Écartés avec motif", fmt(p.ecartees), TEINTES.appeler],
            ].map(([mot, val, t]) => (
              <div key={mot} className="flex items-baseline justify-between gap-4 border-t border-white/[0.055] py-[13px]">
                <span className="text-[14.5px] text-[#C3CBC7]">{mot}</span>
                <Nombre taille={20} teinte={t}>{val}</Nombre>
              </div>
            ))}
            {p.erreurs > 0 && <div className="pt-3 text-[12px]" style={{ color: TEINTES.appeler }}>{p.erreurs} lecture{p.erreurs > 1 ? "s" : ""} en erreur, détail dans le journal.</div>}
          </div>
        </div>
        <div className="rounded-[16px] border border-white/[0.07] px-[26px] py-5">
          <Etiquette>Journal</Etiquette>
          <div className="mt-3 font-mono text-[11px] leading-[1.9] text-[#8B938F]">
            {journal.length === 0 && <div>…</div>}
            {journal.map((l, i) => <div key={i}>{heure(l.le)} · {l.texte}</div>)}
          </div>
        </div>
      </div>
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
    <div ref={barre} className="relative mt-[26px] flex gap-1 border-b border-white/[0.07]">
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

function PanneauRue({ rue, ecartee = false, coche, onCoche, onClasser, classerPending }) {
  if (!rue) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-6 text-center">
        <div className="text-[15px] text-[#C3CBC7]">Cliquez une rue sur la carte.</div>
        <div className="text-[13px] text-[#8B938F]">Vert, emplacement 1 ; ambre, 1 bis ; bleu, 2. Une rue cochée se dessine plus épaisse.</div>
      </div>
    );
  }
  const e = emplacementDe(ecartee ? null : rue.classe);
  const enseignes = rue.enseignes || rue.chaines || [];
  return (
    <div className="flex h-full flex-col px-[26px] py-6">
      <Etiquette teinte={e.teinte}>{ecartee ? "Écartée par ALX" : `Emplacement ${e.mot}`}</Etiquette>
      <div className="mt-2.5 text-[24px] font-light tracking-[-.02em] text-[#F3F7F5]">{rue.nom}</div>
      <div className="mt-1.5 text-[14px] text-[#8B938F]">{rue.motif}</div>
      <div className="mt-[22px] grid grid-cols-2 gap-x-5 gap-y-[18px]">
        {[
          ["Loyer", rue.loyer ? `${Math.round(rue.loyer[0])}–${Math.round(rue.loyer[1])} €/m²/an` : "—"],
          ["Prix au m²", euroM2(rue.prix_m2)],
          ["Rendement", rue.rendement != null ? `${String(rue.rendement).replace(".", ",")} %` : "—"],
          ["Vitrines", rue.commerces ?? "—"],
          ["Longueur", rue.longueur_m ? `${rue.longueur_m} m` : "—"],
          ["Passage", rue.trace?.length ? `${Math.ceil((rue.longueur_m || 0) / 40)} pas de 40 m` : "—"],
        ].map(([mot, val]) => (
          <div key={mot}>
            <Etiquette className="!text-[9.5px]">{mot}</Etiquette>
            <div className="mt-1.5"><Nombre taille={16} teinte="#F3F7F5">{val}</Nombre></div>
          </div>
        ))}
      </div>
      {enseignes.length > 0 && <div className="mt-[22px] text-[14px] leading-[1.6] text-[#C3CBC7]">{enseignes.slice(0, 8).join(" · ")}</div>}
      <div className="mt-auto flex flex-col gap-4 pt-6">
        {!ecartee && (
          <div role="presentation" onClick={() => onCoche(!coche)} className="flex cursor-pointer items-center gap-3">
            <Case coche={coche} onChange={onCoche} taille={18} />
            <span className="text-[15px] text-[#E8EFEB]">{coche ? "Rue à prospecter" : "Prospecter cette rue"}</span>
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
                onClick={() => onClasser(rue.nom, x.classe)}
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

const valeurTri = (r, cle) => (cle === "classe" ? r.classe || 9 : cle === "loyer" ? (r.loyer ? (r.loyer[0] + r.loyer[1]) / 2 : 0) : r.prix_m2 || 0);

function OngletRues({ ville, onProspecter, pending, onClasser, classerPending }) {
  const rues = ville?.rues || [];
  const ecartees = ville?.rues_ecartees || [];
  const enCours = ville?.parcours?.etat === "en_cours" && ville?.parcours?.phase === "rues";
  const [coches, setCoches] = useState(() => new Set(rues.filter((r) => r.retenue).map((r) => r.nom)));
  const [choisie, setChoisie] = useState(null);
  const [tri, setTri] = useState(null);
  const bascule = (nom, oui) => setCoches((c) => { const n = new Set(c); if (oui) n.add(nom); else n.delete(nom); return n; });
  const rueChoisie = rues.find((r) => r.nom === choisie) || null;
  const ecarteeChoisie = !rueChoisie ? ecartees.find((r) => r.nom === choisie) || null : null;
  const triees = useMemo(() => {
    const avecRang = rues.map((r, i) => ({ ...r, rang: i + 1 }));
    if (!tri) return avecRang;
    return [...avecRang].sort((a, b) => (tri === "classe" ? valeurTri(a, tri) - valeurTri(b, tri) : valeurTri(b, tri) - valeurTri(a, tri)));
  }, [rues, tri]);
  const nSel = coches.size;

  if (rues.length === 0 && ecartees.length === 0) {
    return <div className="mt-7 rounded-[16px] border border-white/[0.07] px-6 py-8 text-center text-[14px] text-[#8B938F]">{enCours ? "ALX relève les rues du centre : une minute." : "Aucune rue encore : lancez ALX, il lit le centre sur OpenStreetMap et propose les rues en une minute."}</div>;
  }

  const colonnes = [["classe", "Emplacement"], ["loyer", "Loyer au m²"], ["prix", "Prix au m²"]];
  return (
    <div className="alx-entree mt-7">
      <div className="grid grid-cols-1 items-stretch gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <CarteRues rues={rues} ecartees={ecartees} coches={coches} choisie={choisie} onChoisir={setChoisie} centre={ville?.centre} className="h-full min-h-[440px] max-md:h-[340px] max-md:min-h-0" />
        <div className="min-h-[440px] rounded-[16px] border border-white/[0.07] max-md:min-h-[220px]">
          <PanneauRue
            rue={rueChoisie || ecarteeChoisie}
            ecartee={!!ecarteeChoisie}
            coche={!!rueChoisie && coches.has(rueChoisie.nom)}
            onCoche={(oui) => rueChoisie && bascule(rueChoisie.nom, oui)}
            onClasser={onClasser}
            classerPending={classerPending}
          />
        </div>
      </div>

      <div className="mt-[30px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[#8B938F]">
          <span>{nSel ? `${nSel} rue${nSel > 1 ? "s" : ""} sélectionnée${nSel > 1 ? "s" : ""}` : "Cochez les rues à prospecter"}</span>
          <span className="text-white/20">·</span>
          {EMPLACEMENTS.map((e) => (
            <button key={e.classe} onClick={() => setCoches(new Set(rues.filter((r) => r.classe === e.classe).map((r) => r.nom)))} className="hover:text-[#E8EFEB]" style={{ color: e.teinte, background: "transparent" }}>tout le {e.mot}</button>
          ))}
          <button onClick={() => setCoches(new Set(rues.map((r) => r.nom)))} className="hover:text-[#E8EFEB]" style={{ background: "transparent" }}>toutes</button>
          <button onClick={() => setCoches(new Set())} className="hover:text-[#E8EFEB]" style={{ background: "transparent" }}>aucune</button>
        </div>
        <Bouton principal disabled={!nSel || pending} onClick={() => onProspecter([...coches])}>{pending ? "…" : nSel ? `Prospecter ${nSel} rue${nSel > 1 ? "s" : ""}` : "Prospecter"}</Bouton>
      </div>

      <div className="mt-7 grid grid-cols-[28px_minmax(0,1fr)_150px_130px_130px] items-center border-b border-white/[0.07] px-1.5 pb-3 max-md:grid-cols-[28px_minmax(0,1fr)_110px]">
        <span />
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
            className="grid cursor-pointer grid-cols-[28px_minmax(0,1fr)_150px_130px_130px] items-center border-b border-white/[0.05] px-1.5 py-3.5 transition-colors hover:bg-white/[0.028] max-md:grid-cols-[28px_minmax(0,1fr)_110px]"
            style={{ background: choisie === r.nom ? "rgba(150,192,184,0.06)" : on ? "rgba(150,192,184,0.03)" : undefined }}
          >
            <Case coche={on} onChange={(oui) => bascule(r.nom, oui)} />
            <span className="flex min-w-0 items-baseline gap-2.5">
              <Nombre taille={12} teinte={TEINTES.muet} className="w-6 shrink-0">{String(r.rang).padStart(2, "0")}</Nombre>
              <span className="truncate text-[16px] font-light text-[#F3F7F5]">{r.nom}</span>
              {r.parcourue_le && <Etiquette teinte={TEINTES.ecrire} className="!text-[9px]">prospectée</Etiquette>}
            </span>
            <Nombre taille={14.5} teinte={e.teinte} className="text-right font-medium">{e.court}</Nombre>
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

function OngletCommerces({ ville, cibles, onOuvrir, onRediger, pending }) {
  const [filtre, setFiltre] = useState("interessants");
  const [rue, setRue] = useState("");
  const [page, setPage] = useState(1);
  const PAR_PAGE = 40;
  const enCours = ville?.parcours?.etat === "en_cours" && ville?.parcours?.phase === "commerces";
  const interessants = cibles.filter((c) => ["appeler", "ecrire"].includes(c.pile));
  const liste = cibles
    .filter((c) => (filtre === "interessants" ? ["appeler", "ecrire"].includes(c.pile) : filtre === "ecartes" ? c.pile === "ecartee" : filtre === "surveiller" ? c.pile === "surveiller" : true))
    .filter((c) => !rue || c.rue === rue)
    .sort((a, b) => urgenceDe(b).niveau - urgenceDe(a).niveau);
  const rues = [...new Set(cibles.map((c) => c.rue).filter(Boolean))];
  const sansMessage = interessants.filter((c) => !c.brouillon);
  const filtres = [["interessants", "Intéressants", interessants.length], ["surveiller", "À surveiller", cibles.filter((c) => c.pile === "surveiller").length], ["ecartes", "Écartés", cibles.filter((c) => c.pile === "ecartee").length], ["tous", "Tous", cibles.length]];

  return (
    <div className="alx-entree">
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_240px_220px_120px] items-center border-b border-white/[0.07] px-1.5 pb-3 max-md:grid-cols-[minmax(0,1fr)_90px]">
        <Etiquette>Commerce</Etiquette>
        <Etiquette className="max-md:hidden">Rue</Etiquette>
        <Etiquette className="max-md:hidden">Propriétaire</Etiquette>
        <Etiquette className="text-right">Urgence</Etiquette>
      </div>
      {liste.length === 0 && (
        <p className="m-0 px-1.5 py-6 text-[13.5px] text-[#8B938F]">{cibles.length ? "Rien avec ce filtre." : enCours ? "Les commerces arrivent rue par rue." : "Cochez des rues dans l'onglet Rues, puis lancez la prospection."}</p>
      )}
      {liste.slice(0, page * PAR_PAGE).map((c) => (
        <div
          key={c.id}
          onClick={() => onOuvrir(c.id)}
          className="alx-entree grid cursor-pointer grid-cols-[minmax(0,1fr)_240px_220px_120px] items-center border-b border-white/[0.05] px-1.5 py-[15px] transition-colors hover:bg-white/[0.028] max-md:grid-cols-[minmax(0,1fr)_90px]"
        >
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-light text-[#F3F7F5]">{joliNom(c.enseigne) || "Sans enseigne"}</span>
            <span className="block truncate text-[12.5px] text-[#8B938F] md:hidden">{c.adresse}</span>
          </span>
          <span className="min-w-0 truncate text-[14px] text-[#C3CBC7] max-md:hidden">{c.adresse}</span>
          <span className="min-w-0 truncate text-[14px] text-[#C3CBC7] max-md:hidden">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : c.foncier ? "Plusieurs, à départager" : <span className="text-[#8B938F]">à établir</span>}</span>
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

function OngletMessages({ cibles, onOuvrir }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const avec = cibles.filter((c) => c.brouillon).sort((a, b) => urgenceDe(b).niveau - urgenceDe(a).niveau);
  const [choisi, setChoisi] = useState(null);
  const c = avec.find((x) => x.id === choisi) || avec[0] || null;
  const reecrire = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal: "mail" } }),
    onSuccess: () => { toast.success("Réécrit"); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!avec.length) return <div className="mt-7 rounded-[16px] border border-white/[0.07] px-6 py-8 text-center text-[14px] text-[#8B938F]">Aucun message encore : ouvrez un commerce et répondez « Oui ».</div>;

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
        <div className="flex min-h-[420px] flex-col rounded-[16px] border border-white/[0.07] px-7 py-[26px]">
          <Etiquette teinte="#c3ddd6">{c.brouillon.canal === "courrier" ? "Courrier" : "E-mail"}</Etiquette>
          <div className="mt-3 text-[22px] font-light tracking-[-.02em] text-[#F3F7F5]">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : "Propriétaire à établir"}</div>
          <div className="mt-1 text-[13.5px] text-[#8B938F]">{joliNom(c.enseigne) || ""} · {c.adresse}{c.brouillon.objet ? ` · ${c.brouillon.objet}` : ""}</div>
          <div className="mt-[22px] whitespace-pre-line border-t border-white/[0.07] pt-5 text-[15px] leading-[1.7] text-[#C3CBC7]">{c.brouillon.texte}</div>
          <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-[26px]">
            <Bouton principal onClick={() => navigate(`/ALXCible?id=${c.id}#message`)}>Valider et envoyer</Bouton>
            <Bouton onClick={() => reecrire.mutate(c.id)} disabled={reecrire.isPending}>{reecrire.isPending ? "…" : "Réécrire"}</Bouton>
            <Bouton discret onClick={() => onOuvrir(c.id)}>Voir la fiche</Bouton>
          </div>
        </div>
      )}
    </div>
  );
}

// --- La page d'une ville ----------------------------------------------------------------------

function VillePage({ villeId, ville: villeListe, onNouvelle }) {
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
  const [ongletChoisi, setOnglet] = useState(null);
  const onglet = ongletChoisi || (brouillons ? "messages" : cibles.length ? "commerces" : "rues");
  const [fiche, setFiche] = useState(null);

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
  const classer = useMutation({
    mutationFn: ({ nom, classe }) => base44.request("POST", `/api/alx/villes/${villeId}/rues`, { body: { nom, classe } }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Reclassement impossible"),
  });

  const maintenant = enCeMoment(p, rues);
  const [motStatut, teinteStatut] = statutDe(p?.etat);

  return (
    <div className="relative mx-auto max-w-[1060px] pt-[22px]">
      <div aria-hidden className="pointer-events-none absolute -right-[220px] -top-[240px] z-0 h-[540px] w-[760px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.075),transparent)" }} />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button onClick={onNouvelle} className="text-[13.5px] text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>← Toutes les villes</button>
          <div className="flex items-center gap-3">
            <Etiquette teinte={teinteStatut} className="!text-[9.5px]">{motStatut}</Etiquette>
            {enCours ? (
              <Bouton discret onClick={() => arreter.mutate()} disabled={arreter.isPending}>Arrêter</Bouton>
            ) : (
              <Bouton discret onClick={() => lancer.mutate()} disabled={lancer.isPending} title="Relit le centre et repropose les rues, en une minute">{rues.length ? "Refaire les rues" : "Lancer ALX"}</Bouton>
            )}
          </div>
        </div>

        <h1 className="alx-serif m-0 mt-[22px] text-[42px] italic tracking-[-.01em] text-[#F3F7F5]">{ville?.nom}</h1>
        <div className="mt-1 text-[13.5px] text-[#8B938F]">
          {ville?.recensement?.le ? `Relevé du ${dateCourte(ville.recensement.le)} · ${fmt(ville.recensement.commerces_total)} vitrines · ` : ""}
          {pluriel(rues.length, "rue", "rues")} · {pluriel(cibles.length, "commerce analysé", "commerces analysés")} · {pluriel(brouillons, "message", "messages")}
        </div>

        <Onglets onglet={onglet} onChange={setOnglet} compte={{ rues: rues.length, commerces: cibles.length, messages: brouillons }} />

        {maintenant && (
          <div className="mb-2 mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-3 shrink-0 items-end gap-[5px]">
                {[0, 0.18, 0.36].map((d) => <span key={d} className="alx-vague h-[5px] w-[5px] rounded-full bg-menthe" style={{ animationDelay: `${d}s` }} />)}
              </span>
              <span className="text-[15px] text-[#C3CBC7]">{maintenant.texte}</span>
            </div>
            {maintenant.reste && <span className="shrink-0 text-[13.5px] text-[#8B938F]">Temps restant : <Nombre taille={13.5} teinte="#C3CBC7">{maintenant.reste}</Nombre></span>}
          </div>
        )}

        {p?.etat && (
          <details className="mt-4 text-[13px] text-[#8B938F]">
            <summary className="cursor-pointer hover:text-[#E8EFEB]">
              {enCours ? "Le détail du parcours" : `Dernier passage ${p.etat === "fini" ? "terminé" : p.etat === "arrete" ? "arrêté" : p.etat === "interrompu" ? "interrompu par un redémarrage" : p.etat === "rues_proposees" ? "terminé, rues proposées" : "en erreur"} à ${heure(p.fini_le || p.maj_le)}`}
              {p.erreurs ? ` · ${p.erreurs} erreur${p.erreurs > 1 ? "s" : ""}` : ""} · journal
            </summary>
            <div className="mt-5"><DetailParcours ville={ville} /></div>
          </details>
        )}

        {onglet === "rues" && <OngletRues key={rues.length} ville={ville} onProspecter={(noms) => prospecter.mutate({ rues: noms })} pending={prospecter.isPending} onClasser={(nom, classe) => classer.mutate({ nom, classe })} classerPending={classer.isPending} />}
        {onglet === "commerces" && <OngletCommerces ville={ville} cibles={cibles} onOuvrir={setFiche} onRediger={(ids) => rediger.mutate({ cibles: ids })} pending={rediger.isPending} />}
        {onglet === "messages" && <OngletMessages cibles={cibles} onOuvrir={setFiche} />}

        {!enCours && onglet === "commerces" && <div className="mt-2 flex justify-end"><AjoutCommerce villeId={villeId} ville={ville} onAjoute={rafraichir} /></div>}
      </div>

      {fiche && <FicheCommerce id={fiche} onFermer={() => setFiche(null)} />}
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
  const { data: villes = [] } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes"), refetchInterval: (q) => ((q.state.data || []).some((v) => v.parcours?.etat === "en_cours") ? 5000 : false) });
  const ville = villes.find((v) => v.id === villeId);
  const ouvrir = (id) => setParams({ ville: id });
  const nouvelle = () => setParams({});

  if (!user || user.role !== "admin") return null;

  return (
    <div className="alx min-h-screen">
      <div className="mx-auto max-w-[1440px] px-[34px] pb-[70px] pt-[26px] max-md:px-4">
        {villeId ? <VillePage villeId={villeId} ville={ville} onNouvelle={nouvelle} /> : <Accueil villes={villes} onOuvrir={ouvrir} />}
        {!villeId && (
          <div className="mt-10 text-center text-[12.5px] text-[#8B938F]">
            <Link to="/ALXBilan" className="hover:text-[#E8EFEB]">Le bilan des approches →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
