import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Bouton, Champ, Etiquette, Nombre, TEINTES, joliNom, pileDe } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";
import PenseeIA from "@/components/PenseeIA";
import CoordonneesProprietaire from "@/components/alx/CoordonneesProprietaire";

// Les cartes de prospection. On ne cherche pas « dans une ville », on cherche
// pour quelqu'un : la carte porte le nom qu'on veut, les critères du client,
// et les villes ouvertes pour lui.
//
// Les critères disent où aller. Le tableau de marché sait à quel rendement
// chaque ville se traite : plus le rendement visé est haut, plus la ville et
// l'emplacement descendent. Le budget fois le taux donne le loyer à chercher,
// et le loyer au mètre déjà relevé donne la surface. « 250 000 € à 8 % »
// devient « un local de 40 à 64 m² sur l'axe Libération à Dijon ».

const fmt = (n) => (n || 0).toLocaleString("fr-FR");
const virgule = (n) => String(n).replace(".", ",");
const kEuros = (n) => (n == null ? "—" : n >= 10000 ? `${fmt(Math.round(n / 1000))} k€` : `${fmt(Math.round(n))} €`);
const taux = ([a, b]) => (a === b ? `${virgule(a)} %` : `${virgule(a)} à ${virgule(b)} %`);
const plage = (f, unite) => (!f ? "—" : f[0] === f[1] ? `${fmt(f[0])} ${unite}` : `${fmt(f[0])} à ${fmt(f[1])} ${unite}`);

const CHAMP = "w-full rounded-[10px] border border-bord bg-surface px-4 py-3 text-[15px] text-encre outline-none transition-colors placeholder:text-brume focus:border-menthe";

/** Une case à cocher : un carré, une coche. */
function Case({ coche, onChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!coche}
      onClick={(e) => { e.stopPropagation(); onChange?.(!coche); }}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold transition-colors"
      style={{ borderColor: coche ? J["menthe"] : "rgba(255,255,255,0.16)", background: coche ? J["menthe"] : "transparent", color: J["sur-menthe"] }}
    >
      {coche ? "✓" : ""}
    </button>
  );
}

/** Les trois piles en une ligne de barres, comme sur la carte d'une ville. */
function Barres({ cibles }) {
  const total = cibles?.total || 0;
  const part = (n) => (total ? `${((n || 0) / total) * 100}%` : "0%");
  return (
    <div className="flex h-[3px]">
      <div style={{ width: part(cibles?.appeler), background: TEINTES.appeler }} />
      <div style={{ width: part(cibles?.ecrire), background: TEINTES.ecrire }} />
      <div style={{ width: part(cibles?.surveiller), background: TEINTES.barreSurveiller }} />
    </div>
  );
}

function CarteDeProspection({ c, onOuvrir }) {
  const qc = useQueryClient();
  const villes = c.villes || [];
  // Le nom se corrige sur place : un clic dessus, on tape, on valide. Le reste
  // de la carte ouvre la prospection.
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(c.nom);
  const renommer = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/alx/cartes/${c.id}`, { body: { nom } }),
    onSuccess: () => { setEdition(false); qc.invalidateQueries({ queryKey: ["alx-cartes"] }); },
    onError: (e) => { toast.error(e?.message || "Impossible"); setNom(c.nom); setEdition(false); },
  });
  const valider = () => {
    const propre = nom.trim();
    if (!propre || propre === c.nom) { setNom(c.nom); setEdition(false); return; }
    renommer.mutate();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!edition) onOuvrir(c.id); }}
      onKeyDown={(e) => { if (!edition && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOuvrir(c.id); } }}
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-trait text-left transition-colors hover:border-[rgba(150,192,184,0.3)]"
      style={{ background: J["fond"] }}
    >
      <Barres cibles={c.cibles} />
      <div className="flex items-baseline justify-between gap-3 px-6 pb-1.5 pt-6">
        {edition ? (
          <input
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={valider}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") valider();
              if (e.key === "Escape") { setNom(c.nom); setEdition(false); }
            }}
            className="alx-mont min-w-0 flex-1 border-b border-menthe bg-transparent text-[22px] font-medium tracking-[-.01em] text-encre outline-none"
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEdition(true); }}
            title="Cliquer pour renommer"
            className="alx-mont text-[22px] font-medium tracking-[-.01em] text-encre hover:text-menthe-clair"
          >
            {c.nom}
          </span>
        )}
        {c.client && <span className="shrink-0 text-[12.5px] text-ardoise">{c.client}</span>}
      </div>
      <div className="px-6 pb-5 text-[12.5px] text-menthe">{c.phrase}</div>
      <div className="flex w-full flex-col px-6 pb-2">
        {[["À appeler", c.cibles?.appeler, TEINTES.appeler], ["À écrire", c.cibles?.ecrire, TEINTES.ecrire], ["À surveiller", c.cibles?.surveiller, TEINTES.muet]].map(([m, n, t]) => (
          <div key={m} className="flex items-baseline justify-between gap-3 border-t border-trait py-[11px]">
            <span className="text-[13.5px] text-craie">{m}</span>
            <Nombre taille={16} teinte={t}>{fmt(n)}</Nombre>
          </div>
        ))}
      </div>
      <div className="mt-auto flex w-full items-center gap-2 px-6 pb-4 pt-3.5 text-[12.5px] text-ardoise">
        {villes.some((v) => v.etat === "en_cours") && <span className="alx-pouls h-[5px] w-[5px] shrink-0 rounded-full bg-menthe" />}
        <span className="min-w-0 truncate">
          {villes.length ? villes.map((v) => v.nom).join(", ") : "aucune ville encore"}
        </span>
      </div>
    </div>
  );
}

/** L'accueil d'ALX : les cartes, et la carte qu'on crée. */
export default function Cartes({ villes = [], onOuvrirCarte, onOuvrirVille }) {
  const qc = useQueryClient();
  const [nom, setNom] = useState("");
  const { data } = useQuery({ queryKey: ["alx-cartes"], queryFn: () => base44.request("GET", "/api/alx/cartes") });
  const cartes = data?.cartes || [];
  const orphelines = villes.filter((v) => !v.carte_id);

  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/cartes", { body: { nom } }),
    onSuccess: (r) => { setNom(""); qc.invalidateQueries({ queryKey: ["alx-cartes"] }); onOuvrirCarte(r.carte.id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  return (
    <div className="flex flex-col gap-11">
      <section className="relative overflow-hidden rounded-[20px] border border-trait px-12 pb-[46px] pt-[52px] max-md:px-6 max-md:py-8" style={{ background: "linear-gradient(155deg,#141816 0%,#0C0F0E 48%,#0A0B0B 100%)" }}>
        <div aria-hidden className="pointer-events-none absolute -left-[120px] -top-[220px] h-[520px] w-[700px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.055),transparent)" }} />
        <div className="relative flex flex-col items-center text-center">
          <h1 className="m-0 font-light leading-[1.06] tracking-[-.03em]" style={{ fontSize: "clamp(34px,3.6vw,52px)" }}>
            <span className="block text-encre">Dites pour qui vous cherchez.</span>
            <span className="block text-menthe">ALX <span className="alx-serif italic tracking-[-.01em]">trouve où chercher.</span></span>
          </h1>
          <p className="mx-auto mb-0 mt-[22px] max-w-[58ch] text-[15px] leading-[1.6] text-[#8E9793]">
            Une carte par investisseur : son budget, son rendement visé. ALX rend les villes qui se traitent à ce taux-là, le loyer et la surface à chercher, et ouvre la prospection rue par rue.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (nom.trim() && !creer.isPending) creer.mutate(); }}
            className="mt-8 flex w-full max-w-[600px] items-center gap-2.5 rounded-full border border-trait bg-surface py-[7px] pl-[22px] pr-[7px] focus-within:border-menthe/50"
          >
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Investisseur Machin"
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[18px] text-encre outline-none"
            />
            <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>{creer.isPending ? <PenseeIA etat="working" taille={20} clair /> : "Créer la carte"}</Bouton>
          </form>
          <p className="mb-0 mt-3.5 text-[12.5px] text-ardoise">Le nom est libre. Les critères se posent dans la carte, et se changent quand le client change d'avis.</p>
        </div>
      </section>

      {cartes.length === 0 ? (
        <p className="m-0 text-center text-[13.5px] text-ardoise">Aucune carte encore. La première que vous créez apparaîtra ici.</p>
      ) : (
        <div className="mx-auto grid w-full max-w-[1160px] justify-center gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 360px))" }}>
          {cartes.map((c) => <CarteDeProspection key={c.id} c={c} onOuvrir={onOuvrirCarte} />)}
        </div>
      )}

      {orphelines.length > 0 && (
        <div className="mx-auto w-full max-w-[1160px]">
          <Etiquette className="mb-3">Villes sans carte</Etiquette>
          <div className="flex flex-wrap gap-2">
            {orphelines.map((v) => (
              <button
                key={v.id}
                onClick={() => onOuvrirVille(v.id)}
                className="rounded-full border border-bord px-4 py-2 text-[13px] text-craie transition-colors hover:border-bord-vif"
              >
                {v.nom}
                <span className="ml-2 text-brume tabular-nums">{fmt(v.cibles?.total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Les critères de la carte. Ils ne s'ouvrent plus par une barre à eux : la
 * flèche vit à côté du nom de la carte, là où l'œil la cherche.
 */
function Criteres({ carte, familles }) {
  const qc = useQueryClient();
  const c = carte.criteres || {};
  const [f, setF] = useState({
    prix_min: c.prix_min ?? "", prix_max: c.prix_max ?? "",
    rendement: c.rendement ?? "",
    famille: c.famille ?? "", note: c.note ?? "",
  });
  const change = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const enregistrer = useMutation({
    mutationFn: () => base44.request("PATCH", `/api/alx/cartes/${carte.id}`, { body: { criteres: f } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alx-carte", carte.id] }); qc.invalidateQueries({ queryKey: ["alx-cartes"] }); toast.success("Critères enregistrés"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  return (
    <section className="rounded-[18px] border border-trait bg-surface p-[26px]">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Champ label="Budget mini" value={f.prix_min} onChange={change("prix_min")} placeholder="200 000" />
        <Champ label="Budget maxi" value={f.prix_max} onChange={change("prix_max")} placeholder="300 000" />
        <Champ label="Rendement visé" value={f.rendement} onChange={change("rendement")} placeholder="8" />
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[.16em] text-ardoise">Type de ville</span>
          <select value={f.famille} onChange={(e) => change("famille")(e.target.value)} className={CHAMP}>
            <option value="">Toutes</option>
            {(familles || []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <Champ label="Ce qu'il évite" value={f.note} onChange={change("note")} placeholder="Restauration rapide, pas de rez-de-chaussée aveugle…" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Bouton principal onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending}>{enregistrer.isPending ? <PenseeIA etat="working" taille={20} clair /> : "Enregistrer les critères"}</Bouton>
        <span className="text-[12.5px] text-ardoise">Le rendement commande la ville : au-delà de 9 %, on quitte les métropoles.</span>
      </div>
    </section>
  );
}

/** Une ville du tableau de marché : ce qu'on y cherche, et comment l'ouvrir. */
function LigneVille({ v, carteId, onOuvrirVille, cochee, onBasculer }) {
  const qc = useQueryClient();
  // Une ville qu'ALX a déjà relevée se rattache sans rien relire ; une ville
  // neuve part en prospection et s'ouvre.
  const deja = !!v.ville_id;
  const prospecter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cartes/${carteId}/villes`, {
      body: deja ? { ville_id: v.ville_id, lancer: false } : { nom: v.ville, code_postal: v.code_postal },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["alx-carte", carteId] });
      qc.invalidateQueries({ queryKey: ["alx-villes"] });
      if (!deja) onOuvrirVille(r.ville.id);
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <tr className="border-t border-trait align-top">
      <td className="py-3 pr-3 align-middle"><Case coche={cochee} onChange={() => onBasculer(v.insee)} /></td>
      <td className="py-3 pr-4">
        <div className="text-[14px] text-encre">{v.ville}</div>
        <div className="text-[12px] text-brume">{v.typologie}</div>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap"><Nombre taille={14} teinte={J["menthe"]}>{taux(v.taux)}</Nombre></td>
      <td className="py-3 pr-4 text-[13px] text-craie">{v.emplacement}</td>
      <td className="py-3 pr-4 whitespace-nowrap text-[13px] text-craie tabular-nums">{plage(v.loyer, "€/an")}</td>
      <td className="py-3 pr-4 whitespace-nowrap text-[13px] tabular-nums">
        {v.surface ? <span className="text-craie">{plage(v.surface, "m²")}</span> : <span className="text-brume" title="ALX n'a pas encore relevé de loyer au mètre dans cette ville">—</span>}
        {v.loyer_m2 ? <div className="text-[11.5px] text-brume">{fmt(v.loyer_m2)} €/m²</div> : null}
      </td>
      <td className="whitespace-nowrap py-3 text-right">
        {deja && (
          <button onClick={() => onOuvrirVille(v.ville_id)} className="mr-3 text-[12.5px] text-ardoise hover:text-encre">
            {v.cibles ? `${fmt(v.cibles)} commerces` : "Voir"}
          </button>
        )}
        <Bouton onClick={() => prospecter.mutate()} disabled={prospecter.isPending} className="!px-4 !py-2 !text-[12.5px]">
          {prospecter.isPending ? <PenseeIA etat="searching" taille={20} /> : deja ? "Ajouter" : "Prospecter"}
        </Bouton>
      </td>
    </tr>
  );
}

/** Une carte ouverte : ses critères, où aller, et ce qui colle déjà. */
export function PageCarte({ carteId, onOuvrirVille, onFermer }) {
  const qc = useQueryClient();
  const [texte, setTexte] = useState("");
  const [tout, setTout] = useState(false);
  // Les critères sont repliés : on les pose une fois, on les relit rarement.
  const [criteresOuverts, setCriteresOuverts] = useState(false);
  // La sélection est la même sur la carte et dans la liste : un code INSEE.
  const [cochees, setCochees] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [villeFiltre, setVilleFiltre] = useState(null);
  const [societeFiltre, setSocieteFiltre] = useState(null);
  const basculer = (insee) => setCochees((s) => {
    const n = new Set(s);
    if (n.has(insee)) n.delete(insee); else n.add(insee);
    return n;
  });
  const { data, isLoading } = useQuery({
    queryKey: ["alx-carte", carteId],
    queryFn: () => base44.request("GET", `/api/alx/cartes/${carteId}`),
    refetchInterval: 8000,
  });
  const effacer = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/alx/cartes/${carteId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alx-cartes"] }); onFermer(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Les villes cochées partent ensemble, et vont droit aux commerces.
  const prospecter = useMutation({
    mutationFn: () => {
      const toutes = [...(data?.conseillees || []), ...(data?.prospectees || [])];
      const villes = [...cochees]
        .map((insee) => toutes.find((x) => x.insee === insee))
        .filter(Boolean)
        .map((v) => ({ nom: v.ville, code_postal: v.code_postal, ville_id: v.ville_id }));
      return base44.request("POST", `/api/alx/cartes/${carteId}/prospecter`, { body: { villes } });
    },
    onSuccess: (r) => {
      setCochees(new Set());
      qc.invalidateQueries({ queryKey: ["alx-carte", carteId] });
      qc.invalidateQueries({ queryKey: ["alx-villes"] });
      const lancees = (r.villes || []).filter((v) => v.lancee).length;
      toast.success(lancees > 1 ? `${lancees} villes lancées` : lancees ? `${r.villes[0].nom} lancée` : "Rien à lancer");
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center gap-7 py-28">
        <PenseeIA etat="searching" taille={64} pixels={150} />
        <span className="text-[15px] text-ardoise">Ouverture de la carte…</span>
      </div>
    );
  }
  const { carte, villes = [], conseillees = [], prospectees = [], cibles = [], societes = [], familles = [] } = data;
  const criteres = carte.criteres || {};
  // Les villes présentes dans les commerces retenus, pour filtrer la liste.
  const villesDesCibles = [...new Map(cibles.filter((c) => c.ville).map((c) => [c.ville_id, c.ville])).entries()]
    .map(([id, nom]) => [id, nom, cibles.filter((c) => c.ville_id === id).length]);
  const retenues = cibles.filter((c) => (!villeFiltre || c.ville_id === villeFiltre)
    && (!societeFiltre || (c.proprietaire_siren || c.proprietaire) === societeFiltre));
  const mot = texte.trim().toLowerCase();
  const filtrees = conseillees.filter((v) => !mot || `${v.ville} ${v.typologie} ${v.emplacement}`.toLowerCase().includes(mot));
  const montrees = tout || mot ? filtrees : filtrees.slice(0, 12);
  // La case du coin du tableau : elle coche ce qui est affiché, filtre compris.
  const toutesCochees = montrees.length > 0 && montrees.every((v) => cochees.has(v.insee));
  const basculerToutes = () => setCochees((s) => {
    const n = new Set(s);
    for (const v of montrees) { if (toutesCochees) n.delete(v.insee); else n.add(v.insee); }
    return n;
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={onFermer} className="mb-2 text-[12.5px] text-ardoise hover:text-encre">← Toutes les cartes</button>
          {/* La flèche contre le nom : elle ouvre les critères de cette carte. */}
          <div className="flex items-center gap-2.5">
            <h1 className="alx-mont m-0 text-[34px] font-medium tracking-[-.02em] text-encre">{carte.nom}</h1>
            <button
              type="button"
              onClick={() => setCriteresOuverts((o) => !o)}
              aria-expanded={criteresOuverts}
              aria-label={criteresOuverts ? "Masquer les critères" : "Voir les critères"}
              title={criteresOuverts ? "Masquer les critères" : "Voir les critères"}
              className="grid h-8 w-8 flex-none place-items-center rounded-full border border-bord text-ardoise transition-colors hover:border-menthe hover:text-menthe"
              style={{ background: "transparent" }}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${criteresOuverts ? "rotate-180" : ""}`} />
            </button>
          </div>
          <p className="m-0 mt-1.5 text-[13.5px] text-menthe">{carte.phrase}{carte.client ? ` · ${carte.client}` : ""}</p>
          {carte.criteres?.note && <p className="m-0 mt-1 text-[12.5px] text-ardoise">{carte.criteres.note}</p>}
        </div>
        <button
          onClick={() => { if (window.confirm(`Effacer la carte « ${carte.nom} » ? Les villes et les commerces restent.`)) effacer.mutate(); }}
          className="text-[12.5px] text-ardoise hover:text-encre"
        >
          Effacer la carte
        </button>
      </header>

      {criteresOuverts && <Criteres carte={carte} familles={familles} />}

      {villes.length > 0 && (
        <section>
          <Etiquette className="mb-3">Les villes de cette carte</Etiquette>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {villes.map((v) => {
              const marche = prospectees.find((p) => p.ville_id === v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => onOuvrirVille(v.id)}
                  className="overflow-hidden rounded-[14px] border border-trait bg-surface text-left transition-colors hover:border-[rgba(150,192,184,0.3)]"
                >
                  <Barres cibles={v.cibles} />
                  <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3.5">
                    <span className="alx-mont text-[16px] text-encre">{joliNom(v.nom)}</span>
                    <Nombre taille={14} teinte={J["craie"]}>{fmt(v.cibles?.total)}</Nombre>
                  </div>
                  <div className="px-4 pb-3.5 text-[12px] text-brume">
                    {marche ? `${taux(marche.taux)} · ${marche.emplacement}` : `${(v.rues || []).length} rues classées`}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[18px] border border-trait bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-[26px] pt-[24px]">
          <div>
            <Etiquette>Où aller chercher</Etiquette>
            <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">
              {conseillees.length} ville{conseillees.length > 1 ? "s" : ""} se traite{conseillees.length > 1 ? "nt" : ""} à ce rendement. Le loyer est celui que le budget doit porter ; la surface s'en déduit quand ALX connaît déjà le loyer au mètre.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cochees.size > 0 && (
              <Bouton principal onClick={() => prospecter.mutate()} disabled={prospecter.isPending}>
                {prospecter.isPending ? <PenseeIA etat="searching" taille={20} clair /> : `Prospecter ${cochees.size} ville${cochees.size > 1 ? "s" : ""}`}
              </Bouton>
            )}
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Chercher une ville" className="w-[220px] rounded-full border border-bord bg-surface px-4 py-2 text-[13px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
          </div>
        </div>
        <div className="overflow-x-auto px-[26px] pb-[10px]">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[.14em] text-brume">
                <th className="py-3 pr-3 font-normal">
                  <Case coche={toutesCochees} onChange={basculerToutes} />
                </th>
                <th className="py-3 pr-4 font-normal">Ville</th>
                <th className="py-3 pr-4 font-normal">Taux</th>
                <th className="py-3 pr-4 font-normal">Emplacement</th>
                <th className="py-3 pr-4 font-normal">Loyer à chercher</th>
                <th className="py-3 pr-4 font-normal">Surface</th>
                <th className="py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {montrees.map((v) => <LigneVille key={v.insee} v={v} carteId={carteId} onOuvrirVille={onOuvrirVille} cochee={cochees.has(v.insee)} onBasculer={basculer} />)}
            </tbody>
          </table>
          {!montrees.length && <p className="py-6 text-center text-[13px] text-ardoise">Aucune ville à ce rendement. Élargissez la fourchette.</p>}
        </div>
        {filtrees.length > montrees.length && (
          <div className="border-t border-trait px-[26px] py-3 text-center">
            <button onClick={() => setTout(true)} className="text-[12.5px] text-menthe hover:underline">Voir les {filtrees.length - montrees.length} autres villes</button>
          </div>
        )}
      </section>

      <section className="rounded-[18px] border border-trait bg-surface p-[26px]">
        <div className="flex flex-wrap items-baseline justify-end gap-3">
          {societeFiltre && (
            <button onClick={() => setSocieteFiltre(null)} className="text-[12.5px] text-menthe hover:underline">
              Voir tous les commerces
            </button>
          )}
        </div>

        {/* Filtrer par ville : on cherche pour un investisseur, mais on appelle ville par ville. */}
        {villesDesCibles.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {[[null, "Toutes", cibles.length], ...villesDesCibles].map(([cle, mot, n]) => (
              <button
                key={cle || "toutes"}
                onClick={() => setVilleFiltre(cle)}
                className={`alx-mont border-b pb-1 text-[11px] font-medium uppercase tracking-[.14em] transition-colors ${
                  villeFiltre === cle ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"
                }`}
              >
                {mot} <span className="text-brume">{n}</span>
              </button>
            ))}
          </div>
        )}

        {cibles.length === 0 ? (
          <p className="m-0 mt-4 text-[13px] text-ardoise">Rien encore. Cochez des villes ci-dessus : les commerces arrivent avec leur loyer.</p>
        ) : (
          <div className="mt-5 grid gap-7" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,320px)" }}>
            <div className="flex flex-col">
              {retenues.map((c) => {
                const marche = prospectees.find((p) => p.ville_id === c.ville_id);
                const ouvert = detail === c.id;
                return (
                  <div key={c.id} className="border-t border-trait">
                    <button
                      onClick={() => setDetail(ouvert ? null : c.id)}
                      className="flex w-full flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3 text-left transition-colors hover:bg-white/[0.02]"
                    >
                      <span className="min-w-[220px] flex-1">
                        <span className="text-[14px] text-encre">{joliNom(c.nom)}</span>
                        <span className="ml-2 text-[12.5px] text-brume">{[c.adresse, c.ville].filter(Boolean).join(", ")}</span>
                      </span>
                      <span className="text-[12.5px] text-craie tabular-nums">
                        {fmt(c.loyer_annuel)} €/an{c.loyer_estime ? <span className="text-brume" title="Loyer estimé au loyer de marché de la rue, faute de bail connu"> estimé</span> : ""}
                        {c.surface ? ` · ${fmt(c.surface)} m²` : ""}
                      </span>
                      <span className="whitespace-nowrap">
                        <Nombre taille={15} teinte={J["encre"]}>{kEuros(c.prix_propose)}</Nombre>
                        <Nombre taille={13} teinte={J["menthe"]} className="ml-2">{virgule(c.rendement)} %</Nombre>
                      </span>
                      <span className="w-[96px] text-right text-[11px] uppercase tracking-[.12em]" style={{ color: TEINTES[c.pile] || J["brume"] }}>{pileDe(c.pile).mot}</span>
                    </button>

                    {/* Pourquoi celui-ci : le calcul, pas une impression. */}
                    {ouvert && (
                      <div className="mb-3 rounded-[12px] border border-trait bg-surface px-4 py-3.5">
                        <Etiquette className="mb-2">Pourquoi il correspond</Etiquette>
                        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px] leading-[1.6] text-craie">
                          <li>
                            Loyer {c.loyer_estime ? "estimé" : "relevé"} de {fmt(c.loyer_annuel)} € par an
                            {c.loyer_m2 ? ` (${fmt(c.loyer_m2)} €/m²)` : ""} : à {virgule(criteres.rendement || c.rendement)} %, il faut payer {kEuros(c.prix[0])} à {kEuros(c.prix[1])}.
                          </li>
                          <li>
                            Le budget va de {kEuros(criteres.prix_min)} à {kEuros(criteres.prix_max)} : {kEuros(c.prix_propose)} y tombe, et sort à {virgule(c.rendement)} %.
                          </li>
                          {marche && (
                            <li>{c.ville} se traite à {taux(marche.taux)} dans ce type d&apos;emplacement ({marche.emplacement}).</li>
                          )}
                          {c.emplacement && <li>Rue classée en emplacement {c.emplacement === 1.5 ? "1 bis" : c.emplacement}{c.rue ? ` (${c.rue})` : ""}.</li>}
                          {c.score_ml && <li>Le modèle place cette adresse en {c.score_ml.libelle?.toLowerCase() || "rang inconnu"}.</li>}
                          {c.proprietaire && <li>Propriétaire : {joliNom(c.proprietaire)}{c.proprietaire_siren ? ` (SIREN ${c.proprietaire_siren})` : ""}.</li>}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-4">
                          <button onClick={() => onOuvrirVille(c.ville_id, c.id)} className="text-[12.5px] text-menthe hover:underline">Ouvrir la fiche du commerce</button>
                        </div>
                        {(c.proprietaire_siren || c.proprietaire) && (
                          <div className="mt-3 max-w-[560px]">
                            <CoordonneesProprietaire siren={c.proprietaire_siren} nom={c.proprietaire} ville={c.ville} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!retenues.length && <p className="m-0 py-4 text-[13px] text-ardoise">Aucun commerce pour ce filtre.</p>}
            </div>

            {/* Les sociétés à démarcher : les propriétaires de ces murs. */}
            <div>
              <Etiquette className="mb-2.5">Les sociétés à appeler</Etiquette>
              {societes.length === 0 ? (
                <p className="m-0 text-[12.5px] text-ardoise">Aucun propriétaire identifié sur ces commerces.</p>
              ) : (
                <div className="flex flex-col">
                  {societes.slice(0, 14).map((s) => (
                    <button
                      key={s.siren || s.nom}
                      onClick={() => { setSocieteFiltre(societeFiltre === (s.siren || s.nom) ? null : (s.siren || s.nom)); setDetail(null); }}
                      className={`border-t border-trait py-2.5 text-left transition-colors hover:bg-white/[0.02] ${societeFiltre === (s.siren || s.nom) ? "bg-white/[0.03]" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[13.5px] text-encre">{joliNom(s.nom)}</span>
                        <Nombre taille={13} teinte={J["menthe"]}>{s.biens}</Nombre>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-brume">
                        {s.villes.join(", ")} · {fmt(s.loyer_total)} €/an
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-brume">
                Une société qui tient plusieurs de ces murs vaut un appel avant les autres : c&apos;est une discussion, pas une offre.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
