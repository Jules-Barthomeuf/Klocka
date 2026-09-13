import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { EnTeteAlx, PILES, Bouton, Champ, euros, Halo, Chiffre, Statut, Bascule } from "@/components/alx/alx-commun";

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
          <div className="text-[14px] text-craie truncate">{c.enseigne || "Sans enseigne"}</div>
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
        <div className="text-[15px] font-medium text-encre">{c.enseigne || "Sans enseigne"}</div>
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

const PAR_COLONNE = 30;

const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");

function LigneATraiter({ c }) {
  const p = PILES.find((x) => x.cle === c.pile);
  return (
    <Link to={`/ALXCible?id=${c.id}`} className="grid grid-cols-[10px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] max-md:grid-cols-[10px_minmax(0,1fr)_auto] gap-4 items-center px-5 py-4 border-t border-white/[0.06] first:border-t-0 hover:bg-white/[0.025] transition-colors">
      <span className="w-[8px] h-[8px] rounded-full" style={{ background: p?.teinte }} />
      <div className="min-w-0">
        <div className="text-[14.5px] text-encre truncate">{c.enseigne || "Sans enseigne"}</div>
        <div className="text-[12px] text-brume truncate">{c.adresse}{c.emplacement ? ` · emplacement ${c.emplacement}` : ""}</div>
      </div>
      <div className="min-w-0 max-md:hidden">
        <div className="text-[13px] text-craie truncate">{c.proprietaire?.nom || "propriétaire à établir"}</div>
        <div className="text-[12px] text-brume truncate">{c.societe?.forme || c.proprietaire?.forme || ""}{c.societe?.gerants?.length ? ` · ${c.societe.gerants.length} gérant${c.societe.gerants.length > 1 ? "s" : ""}` : ""}</div>
      </div>
      <div className="text-[12.5px] text-ardoise leading-[1.45] line-clamp-2 max-md:hidden">{c.motif}</div>
      <div className="flex items-center gap-3 whitespace-nowrap">
        {c.brouillon && <span className="text-[10px] tracking-[.12em] uppercase text-menthe border border-menthe/30 rounded-full px-2.5 py-1">{c.brouillon.canal === "mail" ? "mail prêt" : "courrier prêt"}</span>}
        <span className="text-[13px] text-menthe">{p?.cle === "appeler" ? "Appeler" : "Écrire"} →</span>
      </div>
    </Link>
  );
}

function VillePage({ villeId, ville: villeListe, onNouvelle }) {
  const qc = useQueryClient();
  const [vue, setVue] = useState("traiter");
  const [plus, setPlus] = useState({});
  // La ville se relit toutes les trois secondes tant qu'ALX travaille dessus.
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
  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cibles", villeId] }); qc.invalidateQueries({ queryKey: ["alx-ville", villeId] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/villes/${villeId}/lancer`, { body: {} }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const arreter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/villes/${villeId}/arreter`, { body: {} }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const par = (p) => cibles.filter((c) => (c.pile || "surveiller") === p);
  const aTraiter = [...par("appeler"), ...par("ecrire")];
  const ecartees = par("ecartee");
  const proprietaires = cibles.filter((c) => c.proprietaire?.nom).length;
  const brouillons = cibles.filter((c) => c.brouillon).length;
  const p = ville?.parcours;
  const n = (k) => plus[k] || PAR_COLONNE;
  const voirPlus = (k, total) => total > n(k) && (
    <button onClick={() => setPlus((x) => ({ ...x, [k]: n(k) + PAR_COLONNE }))} className="text-[12.5px] text-menthe hover:text-menthe-clair text-left py-2 px-5">
      Voir {Math.min(PAR_COLONNE, total - n(k))} de plus ({total - n(k)} restantes)
    </button>
  );

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
            {(ville?.rues || []).length} rue{(ville?.rues || []).length > 1 ? "s" : ""} classée{(ville?.rues || []).length > 1 ? "s" : ""} · {cibles.length} cible{cibles.length > 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link to={`/ALXVilles?ville=${villeId}`} className="inline-flex items-center border border-bord-doux text-craie hover:text-encre hover:border-bord-vif rounded-full px-4 py-2.5 text-[13px] transition-colors">Les rues</Link>
          {enCours ? (
            <Bouton onClick={() => arreter.mutate()} disabled={arreter.isPending}>Arrêter</Bouton>
          ) : (
            <Bouton principal onClick={() => lancer.mutate()} disabled={lancer.isPending}>{p?.etat ? "Relancer ALX" : "Lancer ALX"}</Bouton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Chiffre label="À appeler" valeur={par("appeler").length} teinte="#E8B278" detail="signal fort" onClick={() => setVue("traiter")} actif={vue === "traiter"} />
        <Chiffre label="À écrire" valeur={par("ecrire").length} teinte="#7896EB" detail="signal patient" onClick={() => setVue("traiter")} />
        <Chiffre label="Propriétaires" valeur={proprietaires} detail={`sur ${cibles.length} cible${cibles.length > 1 ? "s" : ""}`} />
        <Chiffre label="Messages prêts" valeur={brouillons} detail="à relire avant envoi" />
        <Chiffre label="Écartées" valeur={ecartees.length} detail="avec leur motif" onClick={() => setVue("ecartees")} actif={vue === "ecartees"} />
      </div>

      {p?.etat && p.etat !== "fini" && <EnCours ville={ville} onArreter={() => arreter.mutate()} arretPending={arreter.isPending} />}
      {p?.etat === "fini" && (
        <details className="bg-surface border border-white/[0.08] rounded-[18px] px-6 py-4">
          <summary className="cursor-pointer text-[13.5px] text-ardoise hover:text-encre">
            Parcours terminé à {heure(p.fini_le)} · {p.rues_faites} rue{p.rues_faites > 1 ? "s" : ""} · {p.cibles_creees} cible{p.cibles_creees > 1 ? "s" : ""} créée{p.cibles_creees > 1 ? "s" : ""} · {p.proprietaires_trouves} propriétaire{p.proprietaires_trouves > 1 ? "s" : ""} · {p.brouillons} message{p.brouillons > 1 ? "s" : ""}{p.erreurs ? ` · ${p.erreurs} erreur${p.erreurs > 1 ? "s" : ""}` : ""} · voir le journal
          </summary>
          <div className="mt-4"><EnCours ville={ville} onArreter={() => arreter.mutate()} arretPending={arreter.isPending} /></div>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Bascule
          valeur={vue}
          onChange={setVue}
          options={[["traiter", "À traiter", aTraiter.length], ["piles", "Les piles", cibles.length - ecartees.length], ["ecartees", "Écartées", ecartees.length]]}
        />
        {!enCours && <AjoutCommerce villeId={villeId} ville={ville} onAjoute={rafraichir} />}
      </div>

      {vue === "traiter" && (
        <div className="bg-surface border border-white/[0.08] rounded-[20px] overflow-hidden">
          {aTraiter.length === 0 ? (
            <p className="m-0 px-5 py-6 text-[13.5px] text-brume">{enCours ? "Les premières cibles à appeler ou à écrire arrivent avec les rues." : "Rien à traiter : aucun signal fort ni patient pour l'instant."}</p>
          ) : (
            <>
              {aTraiter.slice(0, n("traiter")).map((c) => <LigneATraiter key={c.id} c={c} />)}
              {voirPlus("traiter", aTraiter.length)}
            </>
          )}
        </div>
      )}

      {vue === "piles" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {["appeler", "ecrire", "surveiller"].map((pile) => {
            const pi = PILES.find((x) => x.cle === pile);
            const dedans = par(pile);
            return (
              <div key={pile} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between pb-2.5" style={{ borderBottom: `1px solid ${pi.teinte}59` }}>
                  <div className="text-[10px] tracking-[.16em] uppercase font-semibold" style={{ color: pi.teinte }}>{pi.mot}</div>
                  <div className="text-[12px] text-brume">{pi.detail} · {dedans.length}</div>
                </div>
                {dedans.slice(0, n(pile)).map((c) => <CarteCible key={c.id} c={c} />)}
                {dedans.length === 0 && <p className="m-0 text-[12.5px] text-brume py-2">Rien ici.</p>}
                {voirPlus(pile, dedans.length)}
                {pile === "surveiller" && <p className="m-0 text-[12px] text-brume leading-[1.6] py-1">Relecture BODACC et DVF tous les mois.</p>}
              </div>
            );
          })}
        </div>
      )}

      {vue === "ecartees" && (
        <div className="flex flex-col gap-2">
          {ecartees.length === 0 && <p className="m-0 text-[13.5px] text-brume">Aucune cible écartée.</p>}
          {ecartees.slice(0, n("ecartees")).map((c) => <CarteCible key={c.id} c={c} />)}
          {voirPlus("ecartees", ecartees.length)}
        </div>
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
