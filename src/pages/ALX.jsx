import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { EnTeteAlx, PILES, Bouton, Champ, euros } from "@/components/alx/alx-commun";

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
    <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
      <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[34px] flex flex-col gap-[26px]">
        <div className="flex flex-col gap-3">
          <div className="text-[24px] font-semibold tracking-[-.02em] text-encre">Donnez une ville. ALX s'occupe du reste.</div>
          <p className="m-0 text-[15px] text-ardoise leading-[1.65] max-w-[620px]">
            Il parcourt le centre commerçant, classe les rues, lit les devantures, retrouve les propriétaires, et
            vous rend trois piles : à appeler, à écrire, à surveiller. Rien ne part sans votre relecture.
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (nom.trim() && !creer.isPending) creer.mutate(); }}
          className="flex flex-col gap-2.5 max-w-[520px]"
        >
          <span className="text-[10px] tracking-[.16em] uppercase text-ardoise">Ville</span>
          <div className="flex gap-2.5 flex-wrap">
            <Champ value={nom} onChange={setNom} placeholder="Antibes" className="flex-1 min-w-[240px]" />
            <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>
              {creer.isPending ? "…" : "Lancer ALX"}
            </Bouton>
          </div>
          <span className="text-[12px] text-brume">Une ville prend une à deux heures. Vous pouvez fermer la page.</span>
        </form>

        <div className="border-t border-trait pt-6 flex flex-col gap-3.5">
          <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Ce qu'il cherche, pour qui</div>
          {clients.length === 0 ? (
            <p className="m-0 text-[13px] text-brume">
              {clientsData ? "Aucun client actif sur Monday en ce moment." : "Monday n'est pas configuré : ALX cherche pour le mandat général."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {clients.slice(0, 6).map((c) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_150px_130px] gap-3.5 items-center px-3.5 py-3 bg-fond/60 border border-white/[0.06] rounded-[10px]">
                  <div className="text-[14px] text-craie truncate">{c.nom}</div>
                  <div className="text-[13px] text-ardoise text-right">{c.budget ? euros(c.budget) + " max" : "budget non renseigné"}</div>
                  <div className="text-[9px] tracking-[.14em] uppercase text-menthe text-right">{classementClient(c.budget) || "—"}</div>
                </div>
              ))}
            </div>
          )}
          <div className="text-[12px] text-brume">
            {clientsData ? `Lu dans Monday, tableau Investisseurs · ${clients.length} client${clients.length > 1 ? "s" : ""} actif${clients.length > 1 ? "s" : ""}` : "Monday n'est pas connecté."}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[26px] flex flex-col gap-[18px]">
          <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le mandat, toujours le même</div>
          <div className="flex flex-col gap-3 text-[14px] text-craie leading-[1.6]">
            {MANDAT.map((m) => (
              <div key={m} className="flex gap-3">
                <span className="text-menthe">—</span>
                <span>{m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[26px] flex flex-col gap-4">
          <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Recherches récentes</div>
          {villes.length === 0 ? (
            <p className="m-0 text-[13px] text-brume">Aucune recherche encore. La première ville que vous lancez apparaîtra ici.</p>
          ) : (
            <div className="flex flex-col gap-0">
              {villes.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onOuvrir(v.id)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-baseline py-3 border-t border-trait first:border-t-0 text-left hover:bg-white/[0.02] transition-colors -mx-1 px-1"
                >
                  <div>
                    <div className="text-[14px] text-craie">{v.nom}</div>
                    <div className="text-[12px] text-brume mt-0.5">{v.cibles?.total || 0} cible{(v.cibles?.total || 0) > 1 ? "s" : ""} · {(v.rues || []).length} rue{(v.rues || []).length > 1 ? "s" : ""} classée{(v.rues || []).length > 1 ? "s" : ""}</div>
                  </div>
                  <div className="text-[11px] text-menthe">Ouvrir</div>
                </button>
              ))}
            </div>
          )}
        </div>
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
      className="group bg-surface border border-white/[0.08] rounded-[12px] p-[18px] flex flex-col gap-3 transition-colors"
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

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-white/[0.08] rounded-[14px] px-5 py-4">
        <p className="m-0 text-[13px] text-ardoise">
          Un commerce se saisit ici, adresse et enseigne. Le parcours automatique d'une ville entière n'existe pas encore : chaque commerce entre à la main, ALX fait le reste sur sa fiche.
        </p>
        <Bouton principal onClick={() => setOuvert(true)}>Ajouter un commerce</Bouton>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (f.adresse.trim() && !creer.isPending) creer.mutate(); }}
      className="bg-surface border border-white/[0.08] rounded-[14px] p-5 flex flex-col gap-4"
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
          {rues.length === 0 ? "Aucune rue classée pour cette ville : classez-les dans Villes pour que l'emplacement se remplisse." : "L'emplacement vient de la rue choisie. Le propriétaire se renseigne ensuite sur la fiche."}
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
      <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[30px] flex flex-col gap-6">
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
        <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[22px] flex flex-col gap-3.5">
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
        <div className="bg-surface border border-[rgba(232,178,120,0.25)] rounded-[14px] p-[22px] flex flex-col gap-2.5">
          <div className="text-[10px] tracking-[.16em] uppercase" style={{ color: "#E8B278" }}>À votre main</div>
          <div className="text-[14px] text-craie leading-[1.6]">Le classement des rues est proposé, pas décidé. Corrigez-le dans Villes : les rues reclassées sont reprises au prochain lancement.</div>
        </div>
        <div className="bg-surface border border-white/[0.08] rounded-[14px] p-[22px] flex flex-col gap-3">
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

function Kanban({ villeId, ville: villeListe, onNouvelle }) {
  const qc = useQueryClient();
  const [voirEcartees, setVoirEcartees] = useState(false);
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
  const ecartees = par("ecartee");
  const p = ville?.parcours;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-trait">
        <div className="flex gap-6 flex-wrap">
          <Link to="/ALXVilles" className="text-[15px] pb-3 text-ardoise hover:text-encre transition-colors">Villes</Link>
          <div className="text-[15px] pb-3 text-encre shadow-[inset_0_-2px_0_0_#96c0b8]">Cibles</div>
          <Link to="/ALXBilan" className="text-[15px] pb-3 text-ardoise hover:text-encre transition-colors">Bilan</Link>
        </div>
        <div className="flex items-center gap-3.5 pb-2.5">
          <div className="text-[11px] text-brume font-mono">
            {ville?.nom}{ville?.recensement?.le ? ` · relevé du ${new Date(ville.recensement.le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` : ""} · {(ville?.rues || []).length} rue{(ville?.rues || []).length > 1 ? "s" : ""} · {cibles.length} cible{cibles.length > 1 ? "s" : ""}
          </div>
          {!enCours && (
            <Bouton onClick={() => lancer.mutate()} disabled={lancer.isPending}>{p?.etat ? "Relancer ALX" : "Lancer ALX"}</Bouton>
          )}
          <Bouton onClick={onNouvelle}>Nouvelle ville</Bouton>
        </div>
      </div>

      {p?.etat && <EnCours ville={ville} onArreter={() => arreter.mutate()} arretPending={arreter.isPending} />}

      {!enCours && <AjoutCommerce villeId={villeId} ville={ville} onAjoute={rafraichir} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {["appeler", "ecrire", "surveiller"].map((pile) => {
          const p = PILES.find((x) => x.cle === pile);
          const dedans = par(pile);
          return (
            <div key={pile} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between pb-2.5" style={{ borderBottom: `1px solid ${p.teinte}59` }}>
                <div className="text-[10px] tracking-[.16em] uppercase font-semibold" style={{ color: p.teinte }}>{p.mot}</div>
                <div className="text-[12px] text-brume">{p.detail} · {dedans.length}</div>
              </div>
              {dedans.slice(0, plus[pile] || PAR_COLONNE).map((c) => <CarteCible key={c.id} c={c} />)}
              {dedans.length === 0 && <p className="m-0 text-[12.5px] text-brume py-2">Rien ici.</p>}
              {dedans.length > (plus[pile] || PAR_COLONNE) && (
                <button onClick={() => setPlus((x) => ({ ...x, [pile]: (x[pile] || PAR_COLONNE) + PAR_COLONNE }))} className="text-[12.5px] text-menthe hover:text-menthe-clair text-left py-1">
                  Voir {Math.min(PAR_COLONNE, dedans.length - (plus[pile] || PAR_COLONNE))} de plus ({dedans.length - (plus[pile] || PAR_COLONNE)} restantes)
                </button>
              )}
              {pile === "surveiller" && (
                <>
                  <p className="m-0 text-[12px] text-brume leading-[1.6] py-1">Relecture BODACC et DVF tous les mois.</p>
                  {ecartees.length > 0 && (
                    <button
                      onClick={() => setVoirEcartees((v) => !v)}
                      className="flex items-center justify-between gap-2.5 bg-[#0b0c0e] border border-dashed border-white/[0.12] rounded-[12px] px-4 py-3.5 text-left hover:border-white/[0.2] transition-colors"
                    >
                      <span className="text-[13px] text-ardoise">{ecartees.length} écarté{ecartees.length > 1 ? "s" : ""} avec motif</span>
                      <span className="text-[13px] text-menthe">{voirEcartees ? "Masquer" : "Voir"}</span>
                    </button>
                  )}
                  {voirEcartees && ecartees.slice(0, plus.ecartee || PAR_COLONNE).map((c) => <CarteCible key={c.id} c={c} />)}
                  {voirEcartees && ecartees.length > (plus.ecartee || PAR_COLONNE) && (
                    <button onClick={() => setPlus((x) => ({ ...x, ecartee: (x.ecartee || PAR_COLONNE) + PAR_COLONNE }))} className="text-[12.5px] text-menthe hover:text-menthe-clair text-left py-1">Voir plus</button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
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
          <Kanban villeId={villeId} ville={ville} onNouvelle={nouvelle} />
        ) : (
          <Accueil villes={villes} onOuvrir={ouvrir} />
        )}
      </div>
    </div>
  );
}
