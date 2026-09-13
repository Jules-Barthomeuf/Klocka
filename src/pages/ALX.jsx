import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { EnTeteAlx, PILES, Bouton, Champ, euros, Halo, Statut, Bascule, Urgence, urgenceDe, joliNom } from "@/components/alx/alx-commun";

// La page d'accueil d'ALX. On y arrive toujours par la même porte : donnez
// une ville, ou reprenez une recherche récente. Une fois une ville ouverte,
// la même page devient le tableau de ses cibles, en trois piles.

const MANDAT = [
  "Murs commerciaux entre 200 000 et 1 000 000 €",
  "Hors activités exclues : bars de nuit, professions libérales, restauration rapide",
  "Au budget d'un client réel de Monday",
];

function classementClient(budget) {
  if (budget == null) return null;
  if (budget >= 700000) return "Emplacement 1";
  if (budget <= 500000) return "Emplacement 2";
  return "Emplacement 1 ou 2";
}

function CarteVille({ v, onOuvrir }) {
  const p = v.parcours || {};
  const enCours = p.etat === "en_cours";
  const c = v.cibles || {};
  const progression = enCours ? (p.phase === "rues" ? 8 : 12 + Math.round(((p.rues_faites || 0) / Math.max(1, p.rues_total || 1)) * 88)) : null;
  return (
    <button
      onClick={() => onOuvrir(v.id)}
      className="relative overflow-hidden text-left bg-surface border border-white/[0.08] hover:border-white/[0.2] rounded-[20px] p-6 flex flex-col gap-5 transition-colors"
    >
      {enCours && <Halo />}
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[22px] font-semibold tracking-[-.02em] text-encre">{v.nom}</div>
          <div className="text-[12.5px] text-brume mt-0.5">
            {(v.rues || []).length} rue{(v.rues || []).length > 1 ? "s" : ""} classée{(v.rues || []).length > 1 ? "s" : ""}
            {v.recensement?.commerces_total ? ` · ${v.recensement.commerces_total} commerces recensés` : ""}
          </div>
        </div>
        <Statut etat={p.etat} />
      </div>
      <div className="relative flex items-baseline gap-2">
        <span className="text-[38px] leading-none font-semibold tabular-nums tracking-[-.02em]">{c.total || 0}</span>
        <span className="text-[13px] text-ardoise">cible{(c.total || 0) > 1 ? "s" : ""}</span>
      </div>
      <div className="relative flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span style={{ color: "#E8B278" }}>{c.appeler || 0} à appeler</span>
        <span style={{ color: "#7896EB" }}>{c.ecrire || 0} à écrire</span>
        <span className="text-ardoise">{c.surveiller || 0} à surveiller</span>
        {p.brouillons > 0 && <span className="text-menthe">{p.brouillons} message{p.brouillons > 1 ? "s" : ""} à relire</span>}
      </div>
      {enCours && (
        <div className="relative flex flex-col gap-1.5">
          <div className="h-[3px] rounded bg-white/[0.07]"><div className="h-[3px] rounded bg-menthe transition-all" style={{ width: `${progression}%` }} /></div>
          <div className="text-[11px] text-brume font-mono truncate">{p.rue_en_cours || (p.phase === "rues" ? "recensement des rues" : "démarrage")}</div>
        </div>
      )}
    </button>
  );
}

function Accueil({ villes, onOuvrir }) {
  const [nom, setNom] = useState("");
  const creer = useMutation({
    mutationFn: async () => {
      const r = await base44.request("POST", "/api/alx/villes", { body: { nom } });
      // Le parcours démarre tout de suite ; s'il tourne déjà, on ouvre simplement la ville.
      try {
        await base44.request("POST", `/api/alx/villes/${r.ville.id}/lancer`, { body: {} });
      } catch (e) {
        if (!/déjà en cours/.test(e?.message || "")) throw e;
      }
      return r;
    },
    onSuccess: (r) => onOuvrir(r.ville.id),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const { data: clientsData } = useQuery({ queryKey: ["alx-clients"], queryFn: () => base44.request("GET", "/api/alx/clients") });
  const clients = clientsData?.clients || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden bg-surface border border-white/[0.08] rounded-[24px] px-9 py-10">
        <Halo />
        <div className="relative grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 items-center">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="m-0 text-[40px] max-md:text-[28px] font-semibold tracking-[-.03em] leading-[1.05] text-encre">
                Donnez une ville.<br /><span className="text-menthe-clair">ALX s'occupe du reste.</span>
              </h2>
              <p className="m-0 mt-4 text-[15px] text-ardoise leading-[1.65] max-w-[560px]">
                Il recense le centre, classe les rues par leur loyer, lit chaque commerce, retrouve le propriétaire, et vous rend trois piles avec les messages déjà écrits. Rien ne part sans votre relecture.
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (nom.trim() && !creer.isPending) creer.mutate(); }} className="flex gap-2.5 flex-wrap max-w-[520px]">
              <Champ value={nom} onChange={setNom} placeholder="Antibes" className="flex-1 min-w-[240px]" />
              <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>{creer.isPending ? "…" : "Lancer ALX"}</Bouton>
            </form>
            <span className="text-[12px] text-brume -mt-3">Une ville prend une à deux heures. Vous pouvez fermer la page.</span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le mandat, toujours le même</div>
            {MANDAT.map((m) => (
              <div key={m} className="flex gap-3 text-[14px] text-craie leading-[1.55]"><span className="text-menthe">—</span><span>{m}</span></div>
            ))}
            <div className="text-[12px] text-brume mt-2">
              {clientsData && clients.length ? `Pour ${clients.length} client${clients.length > 1 ? "s" : ""} actif${clients.length > 1 ? "s" : ""} sur Monday, budgets ${euros(Math.min(...clients.map((c) => c.budget).filter(Boolean)))} à ${euros(Math.max(...clients.map((c) => c.budget).filter(Boolean)))}.` : clientsData ? "Aucun client actif sur Monday : mandat général." : "Monday n'est pas connecté : mandat général."}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="m-0 text-[18px] font-semibold tracking-[-.01em] text-encre">Vos villes</h3>
          <span className="text-[12.5px] text-brume">{villes.length} ville{villes.length > 1 ? "s" : ""}</span>
        </div>
        {villes.length === 0 ? (
          <p className="m-0 text-[13.5px] text-brume">Aucune ville encore. La première que vous lancez apparaîtra ici.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {villes.map((v) => <CarteVille key={v.id} v={v} onOuvrir={onOuvrir} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CarteCible({ c }) {
  const p = PILES.find((x) => x.cle === (c.pile || "surveiller"));
  const plate = c.pile === "surveiller" || c.pile === "ecartee";
  if (plate) {
    return (
      <Link
        to={`/ALXCible?id=${c.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center px-4 py-3.5 rounded-[12px] border transition-colors bg-[#0b0c0e] border-white/[0.06] hover:border-white/[0.16]"
      >
        <div className="min-w-0">
          <div className="text-[14px] text-craie truncate">{joliNom(c.enseigne) || "Sans enseigne"}</div>
          <div className="text-[12px] text-brume truncate">{c.adresse}{c.proprietaire?.nom ? ` · ${c.proprietaire.nom}` : c.pile === "ecartee" && c.motif ? ` · ${c.motif}` : ""}</div>
        </div>
        <div className="text-[9px] tracking-[.12em] uppercase text-brume whitespace-nowrap">
          {c.emplacement ? `Emplacement ${c.emplacement}` : "—"}
        </div>
      </Link>
    );
  }
  return (
    <Link
      to={`/ALXCible?id=${c.id}`}
      className="group bg-surface border border-white/[0.08] hover:border-white/[0.18] rounded-[16px] p-[18px] flex flex-col gap-3 transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <div className="text-[15px] font-medium text-encre">{joliNom(c.enseigne) || "Sans enseigne"}</div>
        <div className="text-[13px] text-ardoise">{c.adresse}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {c.emplacement && <span className="text-[9px] tracking-[.12em] uppercase text-ardoise border border-white/[0.09] rounded-full px-2.5 py-1">Emplacement {c.emplacement}</span>}
        {c.activite && <span className="text-[9px] tracking-[.12em] uppercase text-ardoise border border-white/[0.09] rounded-full px-2.5 py-1">{c.activite}</span>}
      </div>
      {c.motif && (
        <div className="text-[13px] text-craie leading-[1.55] border-t border-white/[0.05] pt-3">
          <span style={{ color: p.teinte }}>Signal — </span>{c.motif}
        </div>
      )}
      <div className="flex justify-between items-center gap-2.5">
        <div className="text-[12px] text-brume truncate">{c.proprietaire?.nom || "propriétaire à établir"}</div>
        {c.prochaine_action && !c.deal_id && <div className="text-[12px] text-menthe whitespace-nowrap">{c.prochaine_action}</div>}
        {c.deal_id && <div className="text-[12px] text-menthe whitespace-nowrap">Dossier créé</div>}
      </div>
    </Link>
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
      toast.success(r.deja ? "Ce commerce existe déjà" : `${r.cible.enseigne || r.cible.adresse} ajouté, classé « ${PILES.find((p) => p.cle === r.cible.pile)?.mot || r.cible.pile} »`);
      setF({ adresse: "", enseigne: "", activite: "", rue: f.rue });
      onAjoute(r.cible);
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!ouvert) return <Bouton onClick={() => setOuvert(true)} title="Un commerce qu'ALX n'a pas vu : adresse et enseigne, il fait le reste">Ajouter un commerce</Bouton>;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (f.adresse.trim() && !creer.isPending) creer.mutate(); }}
      className="w-full bg-surface border border-white/[0.08] rounded-[18px] p-5 flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-3">
        <Champ label="Adresse" value={f.adresse} onChange={poser("adresse")} placeholder={`12 rue d'Antibes`} />
        <Champ label="Enseigne" value={f.enseigne} onChange={poser("enseigne")} placeholder="Maison Peirano" />
        <Champ label="Activité" value={f.activite} onChange={poser("activite")} placeholder="épicerie fine" />
        <label className="block">
          <span className="block text-[10px] tracking-[.16em] uppercase text-ardoise mb-1.5">Rue classée</span>
          <select
            value={f.rue}
            onChange={(e) => poser("rue")(e.target.value)}
            className="w-full bg-fond border border-bord rounded-[10px] px-4 py-3 text-[15px] text-encre outline-none focus:border-menthe"
          >
            <option value="">Hors classement</option>
            {rues.map((r) => <option key={r.nom} value={r.nom}>{r.nom} · emplacement {r.classe}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Bouton type="submit" principal disabled={!f.adresse.trim() || creer.isPending}>{creer.isPending ? "…" : "Ajouter"}</Bouton>
        <Bouton onClick={() => setOuvert(false)}>Fermer</Bouton>
        <span className="text-[12px] text-brume">
          {rues.length === 0 ? "Aucune rue classée pour cette ville : classez-les dans Les rues pour que l'emplacement se remplisse." : "Pour un commerce qu'ALX n'a pas vu. L'emplacement vient de la rue choisie ; le propriétaire se trouve ensuite sur la fiche."}
        </span>
      </div>
    </form>
  );
}

const ETAPES = [
  ["La ville", (p) => (p.mode === "rue" ? "Une rue, sans recenser la ville." : "Clients actifs lus dans Monday, avec leurs budgets.")],
  ["Les rues", (p) => (p.phase === "rues" ? "Balayage du centre par l'annuaire, loyer de chaque rue chez Data-B." : `${p.rues_total || 0} rue${(p.rues_total || 0) > 1 ? "s" : ""} à parcourir, emplacement 1 d'abord.`)],
  ["Les commerces", (p) => `${p.commerces_trouves || 0} commerce${(p.commerces_trouves || 0) > 1 ? "s" : ""} de pied d'immeuble lus dans l'annuaire, activité et enseigne.`],
  ["Le propriétaire", (p) => `Data-B, adresse par adresse : ${p.proprietaires_trouves || 0} retrouvé${(p.proprietaires_trouves || 0) > 1 ? "s" : ""}.`],
  ["La société et les gens", () => "Annuaire des entreprises, BODACC, DVF."],
  ["Le classement", (p) => `Trois piles, un motif par cible. ${p.ecartees || 0} écartée${(p.ecartees || 0) > 1 ? "s" : ""} avec motif.`],
  ["Le contact", (p) => `${p.brouillons || 0} message${(p.brouillons || 0) > 1 ? "s" : ""} rédigé${(p.brouillons || 0) > 1 ? "s" : ""}, en attente de votre relecture.`],
];

const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");

function EnCours({ ville, onArreter, arretPending }) {
  const p = ville.parcours || {};
  const enCours = p.etat === "en_cours";
  const etape = p.etape || 1;
  const progression = enCours
    ? p.phase === "rues"
      ? 10
      : 15 + Math.round(((p.rues_faites || 0) / Math.max(1, p.rues_total || 1)) * 85)
    : 100;
  const journal = (p.journal || []).slice(-6).reverse();
  const titre = enCours
    ? `${ville.nom} · en cours`
    : p.etat === "fini"
      ? `${ville.nom} · terminé`
      : p.etat === "arrete"
        ? `${ville.nom} · arrêté`
        : p.etat === "interrompu"
          ? `${ville.nom} · interrompu`
          : `${ville.nom} · en erreur`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="bg-surface border border-white/[0.08] rounded-[20px] p-[30px] flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {enCours && <span className="w-[9px] h-[9px] rounded-full bg-menthe shadow-[0_0_12px_rgba(150,192,184,0.9)] animate-pulse" />}
            <div className="text-[22px] font-semibold tracking-[-.02em] text-encre">{titre}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[11px] text-brume font-mono">
              {enCours ? `étape ${etape} sur 7 · ` : ""}démarré à {heure(p.demarre_le)}{p.fini_le ? ` · fini à ${heure(p.fini_le)}` : ""}
            </div>
            {enCours && <Bouton onClick={onArreter} disabled={arretPending}>Arrêter</Bouton>}
          </div>
        </div>
        <div className="h-[3px] rounded bg-white/[0.07]"><div className="h-[3px] rounded bg-menthe transition-all" style={{ width: `${progression}%` }} /></div>
        <div className="flex flex-col">
          {ETAPES.map(([mot, detail], i) => {
            const rang = i + 1;
            const fait = !enCours || rang < etape || (p.phase === "commerces" && rang <= 2);
            const actif = enCours && rang === etape;
            return (
              <div key={mot} className="grid grid-cols-[26px_minmax(0,1fr)_auto] gap-3.5 items-baseline py-3.5 border-b border-white/[0.05]">
                <div className="text-[11px] font-mono text-brume">{rang}</div>
                <div className="flex flex-col gap-1">
                  <div className="text-[15px]" style={{ color: fait || actif ? "var(--k-encre)" : "#3a3f47" }}>{mot}{actif && p.rue_en_cours && rang >= 3 ? ` · ${p.rue_en_cours}` : ""}</div>
                  <div className="text-[13px] text-brume leading-[1.55]">{detail(p)}</div>
                </div>
                <div className="text-[9px] tracking-[.14em] uppercase" style={{ color: fait ? "var(--k-menthe)" : actif ? "var(--k-encre)" : "#3a3f47" }}>{fait ? "fait" : actif ? "en cours" : "à venir"}</div>
              </div>
            );
          })}
        </div>
        <p className="m-0 text-[13px] text-brume">
          {enCours ? "Les résultats se posent au fur et à mesure : les rues sont déjà consultables, les cibles arrivent par paquets." : "Relancer reprend où ALX s'est arrêté : une cible déjà lue n'est pas relue."}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-surface border border-white/[0.08] rounded-[18px] p-[22px] flex flex-col gap-3.5">
          <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">{enCours ? "Déjà trouvé" : "Trouvé"}</div>
          {[
            ["Rues parcourues", `${p.rues_faites || 0}${p.rues_total ? ` / ${p.rues_total}` : ""}`],
            ["Commerces lus", p.commerces_trouves || 0],
            ["Propriétaires retrouvés", p.proprietaires_trouves || 0],
            ["Messages rédigés", p.brouillons || 0],
            ["Écartés avec motif", p.ecartees || 0],
          ].map(([mot, n]) => (
            <div key={mot} className="flex justify-between items-baseline">
              <span className="text-[14px] text-craie">{mot}</span>
              <span className="text-[20px] font-semibold tabular-nums text-encre">{n}</span>
            </div>
          ))}
          {p.erreurs > 0 && <div className="text-[12px]" style={{ color: "#E8B278" }}>{p.erreurs} lecture{p.erreurs > 1 ? "s" : ""} en erreur, détail dans le journal.</div>}
        </div>
        <div className="bg-surface border border-[rgba(232,178,120,0.25)] rounded-[18px] p-[22px] flex flex-col gap-2.5">
          <div className="text-[10px] tracking-[.16em] uppercase" style={{ color: "#E8B278" }}>À votre main</div>
          <div className="text-[14px] text-craie leading-[1.6]">Le classement des rues est proposé, pas décidé. Corrigez-le dans Villes : les rues reclassées sont reprises au prochain lancement.</div>
        </div>
        <div className="bg-surface border border-white/[0.08] rounded-[18px] p-[22px] flex flex-col gap-3">
          <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Journal</div>
          <div className="font-mono text-[11px] text-brume leading-[1.9]">
            {journal.length === 0 && <div>…</div>}
            {journal.map((l, i) => <div key={i}>{heure(l.le)} · {l.texte}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

const PAR_PAGE = 40;
const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");
const euroM2 = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €/m²`);

// Le verdict en clair, jamais un score : ce que la pile veut dire pour celui qui démarche.
const VERDICTS = {
  appeler: ["Fortes chances de vendre", "#E8B278"],
  ecrire: ["Vendra un jour : à écrire", "#7896EB"],
  surveiller: ["Peu de chances pour l'instant", "var(--k-ardoise)"],
  ecartee: ["Non", "var(--k-brume)"],
};
const raisonsDe = (c) => {
  const r = [];
  for (const x of c.signaux?.forts || []) r.push(x.libelle + (x.valeur ? ` (${x.valeur})` : ""));
  for (const x of c.signaux?.patients || []) r.push(x.libelle + (x.valeur ? ` (${x.valeur})` : ""));
  for (const x of c.drapeaux || []) if (x.effet !== "information") r.push(x.libelle);
  if (!r.length && c.motif) r.push(c.motif);
  return r;
};

function Case({ coche, onChange, titre }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!coche}
      title={titre}
      onClick={(e) => { e.stopPropagation(); onChange(!coche); }}
      // La feuille de style globale a une règle `button { background-color }`
      // hors de tout @layer : elle prime sur toute classe Tailwind (bg-menthe,
      // border-bord-doux…) quelle que soit sa spécificité. Un style inline la bat.
      style={{ background: coche ? "#96c0b8" : "#000000", borderColor: coche ? "#96c0b8" : "#2c3139" }}
      className="k-case w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors"
    >
      {coche && (
        <svg viewBox="0 0 12 12" className="w-[10px] h-[10px]" fill="none">
          <path d="M2 6l2.5 2.5L10 3" stroke="#0b1211" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function Etapes({ etape, onChange, compte }) {
  const items = [["rues", "Les rues"], ["commerces", "Les commerces"], ["messages", "Les messages"]];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(([cle, mot], i) => {
        const actif = etape === cle;
        return (
          <button key={cle} onClick={() => onChange(cle)} className={`flex items-center gap-3 rounded-full border px-4 py-2 transition-colors ${actif ? "border-menthe/50 bg-menthe/10" : "border-white/[0.1] hover:border-white/[0.2]"}`}>
            <span className={`w-6 h-6 rounded-full text-[12px] flex items-center justify-center ${actif ? "bg-menthe text-[#0b1211] font-semibold" : "bg-white/[0.06] text-ardoise"}`}>{i + 1}</span>
            <span className={`text-[14px] ${actif ? "text-encre" : "text-ardoise"}`}>{mot}</span>
            {compte[cle] != null && <span className="text-[12px] text-brume tabular-nums">{compte[cle]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function EtapeRues({ ville, onProspecter, pending }) {
  const rues = ville?.rues || [];
  const [coches, setCoches] = useState(() => new Set(rues.filter((r) => r.retenue).map((r) => r.nom)));
  const toutes = (classe) => setCoches(new Set(rues.filter((r) => !classe || r.classe === classe).map((r) => r.nom)));
  const bascule = (nom, oui) => setCoches((c) => { const n = new Set(c); if (oui) n.add(nom); else n.delete(nom); return n; });
  const ecartees = ville?.rues_ecartees || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <button onClick={() => toutes(1)} className="text-menthe hover:text-menthe-clair">Tout l'emplacement 1</button>
          <span className="text-brume">·</span>
          <button onClick={() => toutes(null)} className="text-menthe hover:text-menthe-clair">Toutes</button>
          <span className="text-brume">·</span>
          <button onClick={() => setCoches(new Set())} className="text-ardoise hover:text-encre">Aucune</button>
          <span className="text-brume ml-2">{rues.length} rue{rues.length > 1 ? "s" : ""} proposée{rues.length > 1 ? "s" : ""}{ville?.recensement?.commerces_total ? ` · ${ville.recensement.commerces_total} commerces recensés` : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/ALXVilles?ville=${ville?.id}`} className="text-[13px] text-ardoise hover:text-encre">Corriger le classement</Link>
          <Bouton principal disabled={!coches.size || pending} onClick={() => onProspecter([...coches])}>
            {pending ? "…" : `Prospecter ${coches.size} rue${coches.size > 1 ? "s" : ""}`}
          </Bouton>
        </div>
      </div>

      <div className="bg-surface border border-white/[0.08] rounded-[20px] overflow-hidden">
        <div className="grid grid-cols-[36px_minmax(0,1.6fr)_120px_130px_130px_100px_90px] max-md:grid-cols-[36px_minmax(0,1fr)_100px] gap-3 items-center px-5 py-3 text-[10px] tracking-[.14em] uppercase text-brume border-b border-white/[0.06]">
          <span />
          <span>Rue</span>
          <span>Emplacement</span>
          <span className="max-md:hidden">Loyer</span>
          <span className="max-md:hidden">Prix au m²</span>
          <span className="max-md:hidden">Rendement</span>
          <span className="max-md:hidden text-right">Commerces</span>
        </div>
        {rues.length === 0 && <p className="m-0 px-5 py-6 text-[13.5px] text-brume">Aucune rue encore : lancez ALX, il recense le centre et propose les rues.</p>}
        {rues.map((r) => (
          <label key={r.nom} className="grid grid-cols-[36px_minmax(0,1.6fr)_120px_130px_130px_100px_90px] max-md:grid-cols-[36px_minmax(0,1fr)_100px] gap-3 items-center px-5 py-3.5 border-t border-white/[0.05] hover:bg-white/[0.025] cursor-pointer">
            <Case coche={coches.has(r.nom)} onChange={(oui) => bascule(r.nom, oui)} />
            <div className="min-w-0">
              <div className="text-[14.5px] text-encre truncate">{r.nom}{r.parcourue_le ? <span className="ml-2 text-[10px] tracking-[.12em] uppercase text-menthe">prospectée</span> : null}</div>
              <div className="text-[12px] text-brume truncate">{(r.chaines || []).slice(0, 4).join(", ") || r.motif}</div>
            </div>
            <span className="text-[11px] tracking-[.12em] uppercase" style={{ color: r.classe === 1 ? "var(--k-menthe)" : "#7896EB" }}>Emplacement {r.classe}</span>
            <span className="text-[13px] text-craie tabular-nums max-md:hidden">{r.loyer ? `${Math.round(r.loyer[0])}–${Math.round(r.loyer[1])} €/m²/an` : "—"}</span>
            <span className="text-[13px] text-craie tabular-nums max-md:hidden" title={r.prix_m2_source || ""}>{euroM2(r.prix_m2)}</span>
            <span className="text-[13px] text-craie tabular-nums max-md:hidden">{r.rendement != null ? `${String(r.rendement).replace(".", ",")} %` : "—"}</span>
            <span className="text-[13px] text-ardoise tabular-nums text-right max-md:hidden">{r.commerces ?? "—"}</span>
          </label>
        ))}
      </div>
      {ecartees.length > 0 && (
        <details className="text-[12.5px] text-brume px-1">
          <summary className="cursor-pointer hover:text-encre">{ecartees.length} rue{ecartees.length > 1 ? "s" : ""} écartée{ecartees.length > 1 ? "s" : ""} par ALX (loyer trop bas ou trop peu de commerces) : reprenables dans Corriger le classement</summary>
          <div className="mt-2 flex flex-col gap-1">{ecartees.map((r) => <div key={r.nom}><span className="text-craie">{r.nom}</span> · {r.motif}</div>)}</div>
        </details>
      )}
    </div>
  );
}

function LigneCommerce({ c, coche, onCoche }) {
  const navigate = useNavigate();
  const s = c.societe || {};
  const forme = s.forme || c.proprietaire?.forme || null;
  return (
    <div
      onClick={() => navigate(`/ALXCible?id=${c.id}`)}
      className="grid grid-cols-[36px_minmax(0,1.4fr)_minmax(0,1.2fr)_220px] max-md:grid-cols-[36px_minmax(0,1fr)_auto] gap-4 items-center px-5 py-4 border-t border-white/[0.05] first:border-t-0 hover:bg-white/[0.025] cursor-pointer"
    >
      <Case coche={coche} onChange={onCoche} />
      <div className="min-w-0">
        <div className="text-[15px] text-encre truncate">{joliNom(c.enseigne) || "Sans enseigne"}</div>
        <div className="text-[12.5px] text-brume truncate">{c.adresse}{c.activite ? ` · ${c.activite}` : ""}</div>
      </div>
      <div className="min-w-0 max-md:hidden">
        <div className="text-[14px] text-craie truncate">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : c.foncier ? "Plusieurs propriétaires, à départager" : "Propriétaire à établir"}</div>
        {forme && <div className="text-[12px] text-brume truncate">{forme}{s.gerants?.length ? ` · ${s.gerants.length} gérant${s.gerants.length > 1 ? "s" : ""}` : ""}</div>}
      </div>
      <Urgence c={c} />
    </div>
  );
}

function EtapeCommerces({ ville, cibles, onRediger, pending }) {
  const [filtre, setFiltre] = useState("interessants");
  const [rue, setRue] = useState("");
  const [coches, setCoches] = useState(new Set());
  const [page, setPage] = useState(1);
  const interessants = cibles.filter((c) => ["appeler", "ecrire"].includes(c.pile));
  const liste = cibles
    .filter((c) => (filtre === "interessants" ? ["appeler", "ecrire"].includes(c.pile) : filtre === "ecartes" ? c.pile === "ecartee" : filtre === "surveiller" ? c.pile === "surveiller" : true))
    .filter((c) => !rue || c.rue === rue)
    .sort((a, b) => urgenceDe(b).niveau - urgenceDe(a).niveau);
  const rues = [...new Set(cibles.map((c) => c.rue).filter(Boolean))];
  const bascule = (id, oui) => setCoches((c) => { const n = new Set(c); if (oui) n.add(id); else n.delete(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Bascule valeur={filtre} onChange={(f) => { setFiltre(f); setPage(1); }} options={[["interessants", "Intéressants", interessants.length], ["surveiller", "À surveiller", cibles.filter((c) => c.pile === "surveiller").length], ["ecartes", "Écartés", cibles.filter((c) => c.pile === "ecartee").length], ["tous", "Tous", cibles.length]]} />
          <select value={rue} onChange={(e) => { setRue(e.target.value); setPage(1); }} className="bg-fond border border-bord rounded-full px-3.5 py-2 text-[12.5px] text-encre outline-none focus:border-menthe">
            <option value="">Toutes les rues</option>
            {rues.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="text-[12.5px] text-brume">{cibles.length} commerce{cibles.length > 1 ? "s" : ""}, {interessants.length} intéressant{interessants.length > 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3 text-[12.5px]">
          <button onClick={() => setCoches(new Set(liste.map((c) => c.id)))} className="text-menthe hover:text-menthe-clair">Tout cocher</button>
          <button onClick={() => setCoches(new Set())} className="text-ardoise hover:text-encre">Aucun</button>
          <Bouton principal disabled={!coches.size || pending} onClick={() => onRediger([...coches])}>{pending ? "…" : `Rédiger ${coches.size} message${coches.size > 1 ? "s" : ""}`}</Bouton>
        </div>
      </div>
      <div className="bg-surface border border-white/[0.08] rounded-[20px] overflow-hidden">
        <div className="grid grid-cols-[36px_minmax(0,1.4fr)_minmax(0,1.2fr)_220px] max-md:grid-cols-[36px_minmax(0,1fr)_auto] gap-4 items-center px-5 py-3 text-[10px] tracking-[.14em] uppercase text-brume border-b border-white/[0.06]">
          <span /><span>Commerce</span><span className="max-md:hidden">Propriétaire</span><span>Urgence</span>
        </div>
        {liste.length === 0 && <p className="m-0 px-5 py-6 text-[13.5px] text-brume">{cibles.length ? "Rien avec ce filtre." : ville?.parcours?.etat === "en_cours" ? "Les commerces arrivent rue par rue." : "Aucun commerce encore : cochez des rues à l'étape 1 et prospectez."}</p>}
        {liste.slice(0, page * PAR_PAGE).map((c) => <LigneCommerce key={c.id} c={c} coche={coches.has(c.id)} onCoche={(oui) => bascule(c.id, oui)} />)}
        {liste.length > page * PAR_PAGE && <button onClick={() => setPage(page + 1)} className="w-full text-left px-5 py-3 text-[12.5px] text-menthe hover:text-menthe-clair border-t border-white/[0.05]">Voir {Math.min(PAR_PAGE, liste.length - page * PAR_PAGE)} de plus ({liste.length - page * PAR_PAGE} restants)</button>}
      </div>
    </div>
  );
}

function EtapeMessages({ cibles }) {
  const avec = cibles.filter((c) => c.brouillon);
  return (
    <div className="bg-surface border border-white/[0.08] rounded-[20px] overflow-hidden">
      {avec.length === 0 && <p className="m-0 px-5 py-6 text-[13.5px] text-brume">Aucun message encore : cochez des commerces à l'étape 2 et rédigez.</p>}
      {avec.map((c) => (
        <Link key={c.id} to={`/ALXCible?id=${c.id}`} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] max-md:grid-cols-[minmax(0,1fr)_auto] gap-4 items-center px-5 py-4 border-t border-white/[0.05] first:border-t-0 hover:bg-white/[0.025]">
          <div className="min-w-0">
            <div className="text-[14.5px] text-encre truncate">{joliNom(c.enseigne) || c.adresse}</div>
            <div className="text-[12px] text-brume truncate">{c.proprietaire?.nom ? joliNom(c.proprietaire.nom) : "propriétaire à établir"} · {c.brouillon.canal === "mail" ? "mail" : "courrier"}{c.brouillon.objet ? ` · ${c.brouillon.objet}` : ""}</div>
          </div>
          <div className="text-[12.5px] text-ardoise leading-[1.5] line-clamp-2 max-md:hidden">{c.brouillon.texte}</div>
          <span className="text-[13px] text-menthe whitespace-nowrap">Relire et envoyer →</span>
        </Link>
      ))}
    </div>
  );
}

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
  const etapeNaturelle = brouillons ? "messages" : cibles.length ? "commerces" : "rues";
  const [etapeChoisie, setEtape] = useState(null);
  const etape = etapeChoisie || etapeNaturelle;

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cibles", villeId] }); qc.invalidateQueries({ queryKey: ["alx-ville", villeId] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  const useGeste = (chemin, apres) => useMutation({
    mutationFn: (body) => base44.request("POST", `/api/alx/villes/${villeId}/${chemin}`, { body: body || {} }),
    onSuccess: () => { rafraichir(); if (apres) setEtape(apres); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const lancer = useGeste("lancer", "rues");
  const prospecter = useGeste("parcourir", "commerces");
  const rediger = useGeste("rediger", "messages");
  const arreter = useGeste("arreter");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <button onClick={onNouvelle} className="text-left text-[13px] text-menthe hover:text-menthe-clair">← Toutes les villes</button>
          <div className="flex items-center gap-4">
            <h1 className="m-0 text-[36px] max-md:text-[26px] font-semibold tracking-[-.025em] leading-[1.05] text-encre">{ville?.nom}</h1>
            <Statut etat={p?.etat} />
          </div>
          <div className="text-[13px] text-ardoise">
            {ville?.recensement?.le ? `Relevé du ${dateCourte(ville.recensement.le)} · ${ville.recensement.commerces_total} commerces recensés · ` : ""}
            {rues.length} rue{rues.length > 1 ? "s" : ""} · {cibles.length} commerce{cibles.length > 1 ? "s" : ""} analysé{cibles.length > 1 ? "s" : ""} · {brouillons} message{brouillons > 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {enCours ? (
            <Bouton onClick={() => arreter.mutate()} disabled={arreter.isPending}>Arrêter</Bouton>
          ) : (
            <Bouton onClick={() => lancer.mutate()} disabled={lancer.isPending} title="Recense à nouveau le centre et repropose les rues">{rues.length ? "Refaire les rues" : "Lancer ALX"}</Bouton>
          )}
        </div>
      </div>

      <Etapes etape={etape} onChange={setEtape} compte={{ rues: rues.length, commerces: cibles.length, messages: brouillons }} />

      {enCours && <EnCours ville={ville} onArreter={() => arreter.mutate()} arretPending={arreter.isPending} />}
      {p?.etat && !enCours && p.etat !== "rues_proposees" && (
        <details className="bg-surface border border-white/[0.08] rounded-[18px] px-6 py-4">
          <summary className="cursor-pointer text-[13.5px] text-ardoise hover:text-encre">
            {p.etat === "fini" ? "Dernier passage terminé" : p.etat === "arrete" ? "Dernier passage arrêté" : p.etat === "interrompu" ? "Dernier passage interrompu par un redémarrage" : "Dernier passage en erreur"} à {heure(p.fini_le || p.maj_le)}
            {p.rues_total ? ` · ${p.rues_faites}/${p.rues_total} rues` : ""} · {p.cibles_creees || 0} commerce{(p.cibles_creees || 0) > 1 ? "s" : ""} analysé{(p.cibles_creees || 0) > 1 ? "s" : ""} · {p.proprietaires_trouves || 0} propriétaire{(p.proprietaires_trouves || 0) > 1 ? "s" : ""}{p.brouillons ? ` · ${p.brouillons} message${p.brouillons > 1 ? "s" : ""}` : ""}{p.erreurs ? ` · ${p.erreurs} erreur${p.erreurs > 1 ? "s" : ""}` : ""} · voir le journal
          </summary>
          <div className="mt-4"><EnCours ville={ville} onArreter={() => arreter.mutate()} arretPending={arreter.isPending} /></div>
        </details>
      )}

      {etape === "rues" && <EtapeRues key={rues.length} ville={ville} onProspecter={(noms) => prospecter.mutate({ rues: noms })} pending={prospecter.isPending} />}
      {etape === "commerces" && <EtapeCommerces ville={ville} cibles={cibles} onRediger={(ids) => rediger.mutate({ cibles: ids })} pending={rediger.isPending} />}
      {etape === "messages" && <EtapeMessages cibles={cibles} />}

      {!enCours && etape === "commerces" && (
        <div className="flex justify-end"><AjoutCommerce villeId={villeId} ville={ville} onAjoute={rafraichir} /></div>
      )}
    </div>
  );
}

export default function ALX() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const villeId = params.get("ville");
  const { data: villes = [] } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes") });
  const ville = villes.find((v) => v.id === villeId);
  const ouvrir = (id) => setParams({ ville: id });
  const nouvelle = () => setParams({});

  if (!user || user.role !== "admin") return null;

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        {!villeId && <EnTeteAlx />}
        {villeId ? (
          <VillePage villeId={villeId} ville={ville} onNouvelle={nouvelle} />
        ) : (
          <Accueil villes={villes} onOuvrir={ouvrir} />
        )}
      </div>
    </div>
  );
}
