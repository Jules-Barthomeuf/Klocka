import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { BoutonLienInvitation } from "@/components/admin/InviterClient";
import { Check, Copy, Link2, Loader2, Plus, Search, Send, Users, X } from "lucide-react";

// L'onglet Familles de la page Clients. Une famille : plusieurs comptes,
// chacun avec son adresse et son mot de passe, qui voient tous le même
// dossier, celui du titulaire. Deux façons d'en former une : inviter tout le
// monde d'un coup (un lien par personne), ou rattacher des comptes qui
// existent déjà. Les règles vivent dans server/famille.js.

const sansAccents = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nomDe = (u) => u?.full_name || u?.email || "Sans nom";
const estClient = (u) => u && u.role !== "admin" && u.role !== "mandataire";

const copier = async (texte) => {
  try {
    await navigator.clipboard.writeText(texte);
    toast.success("Lien copié");
  } catch {
    window.prompt("Copiez le lien :", texte);
  }
};

const appel = (chemin, body) => base44.request("POST", chemin, { body });

const champ = "w-full bg-transparent border-0 border-b border-encre/[0.18] focus:border-menthe px-0 py-1.5 text-[15px] max-md:text-[16px] text-encre outline-none placeholder:text-brume";
const etiquette = "block text-[11px] tracking-[.16em] uppercase text-brume mb-1.5";
const principal = "inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40";
const secondaire = "inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40";

/** Le point qui désigne le titulaire : celui dont tous voient le dossier. */
function PointTitulaire({ actif, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Titulaire : tous voient son dossier" title="Titulaire : tous voient son dossier"
      className="grid h-8 w-8 flex-none place-items-center rounded-full" style={{ background: "transparent" }}>
      <span className={`h-3.5 w-3.5 rounded-full border ${actif ? "border-menthe bg-menthe" : "border-bord-vif"}`} />
    </button>
  );
}

/** Chercher un compte client existant, par nom ou adresse. */
function ChoixCompte({ users, exclus = [], onChoisir, placeholder = "Chercher un compte par nom ou adresse" }) {
  const [q, setQ] = useState("");
  const mots = sansAccents(q).split(/\s+/).filter(Boolean);
  const trouves = mots.length
    ? users.filter((u) => estClient(u) && !exclus.includes(u.id) && mots.every((m) => sansAccents(`${u.full_name || ""} ${u.email}`).includes(m))).slice(0, 6)
    : [];
  return (
    <div className="relative">
      <div className="flex items-center gap-3 border-b border-encre/[0.18] pb-1.5 focus-within:border-menthe">
        <Search className="h-3.5 w-3.5 flex-none text-brume" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          className="w-full border-none bg-transparent py-1 text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      </div>
      {trouves.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
          {trouves.map((u) => (
            <button key={u.id} type="button" onClick={() => { onChoisir(u); setQ(""); }}
              className="block w-full px-4 py-2.5 text-left hover:bg-encre/[0.06]" style={{ background: "transparent" }}>
              <span className="text-[14px] text-encre">{nomDe(u)}</span>
              <span className="ml-2 text-[12.5px] text-ardoise">{u.email}</span>
              {u.est_compte_shadow && <span className="ml-2 text-[12.5px] text-brume">déjà dans une famille</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ligneVide = () => ({ full_name: "", email: "" });

/** Inviter une famille : une ligne par personne, le plus en ajoute une. */
function InviterFamille({ onFait }) {
  const [lignes, setLignes] = useState([ligneVide(), ligneVide()]);
  const [titulaire, setTitulaire] = useState(0);
  const [resultats, setResultats] = useState(null);

  const remplies = lignes.filter((l) => l.email.trim());
  const mutation = useMutation({
    // Le titulaire part en tête : c'est ainsi que le serveur le reconnaît.
    mutationFn: (envoyer) => {
      const ordre = [lignes[titulaire], ...lignes.filter((_, i) => i !== titulaire)].filter((l) => l.email.trim());
      return appel("/api/admin/familles/inviter", { membres: ordre, envoyer });
    },
    onSuccess: (r) => {
      setResultats(r.resultats);
      onFait?.();
      const envoyes = r.resultats.filter((m) => m.envoye).length;
      if (envoyes) toast.success(`${envoyes} invitation${envoyes > 1 ? "s" : ""} envoyée${envoyes > 1 ? "s" : ""}`);
      const echec = r.resultats.find((m) => m.erreur_envoi);
      if (echec) toast.error(echec.erreur_envoi);
    },
    onError: (e) => toast.error(e?.message || "Invitation impossible"),
  });

  const poser = (i, cle, v) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [cle]: v } : l)));
  const retirer = (i) => {
    setLignes((ls) => ls.filter((_, j) => j !== i));
    setTitulaire((t) => (t === i ? 0 : t > i ? t - 1 : t));
  };
  const recommencer = () => { setLignes([ligneVide(), ligneVide()]); setTitulaire(0); setResultats(null); };

  if (resultats) {
    return (
      <div>
        <div className="border-y border-trait">
          {resultats.map((m, i) => (
            <div key={m.email} className={`flex flex-wrap items-center gap-3 px-2 py-4 ${i ? "border-t border-trait" : ""}`}>
              <div className="min-w-[200px] flex-1">
                <p className="m-0 text-[16px] text-encre">{m.full_name || m.email}{i === 0 && <span className="ml-2 text-[12.5px] text-menthe">titulaire</span>}</p>
                <p className="m-0 mt-0.5 text-[13.5px] text-ardoise">
                  {m.email} · {m.deja_actif ? "compte déjà actif, rattaché" : m.envoye ? <><Check className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-menthe" />lien envoyé</> : "lien prêt"}
                </p>
              </div>
              {m.lien && (
                <button type="button" onClick={() => copier(m.lien)} className={secondaire}>
                  <Copy className="h-4 w-4" /> Copier son lien
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="m-0 mt-3 text-[12.5px] text-brume">Chaque lien est personnel et valable quatorze jours : chacun choisit son mot de passe.</p>
        <button type="button" onClick={recommencer} className="mt-4 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          Inviter une autre famille
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(true); }}>
      <div className="space-y-3">
        {lignes.map((l, i) => (
          <div key={i} className="flex items-end gap-3 max-md:flex-wrap">
            <PointTitulaire actif={titulaire === i} onClick={() => setTitulaire(i)} />
            <label className="min-w-[160px] flex-1">
              {i === 0 && <span className={etiquette}>Nom</span>}
              <input value={l.full_name} onChange={(e) => poser(i, "full_name", e.target.value)} placeholder="Prénom Nom" className={champ} />
            </label>
            <label className="min-w-[200px] flex-1">
              {i === 0 && <span className={etiquette}>Adresse email</span>}
              <input type="email" value={l.email} onChange={(e) => poser(i, "email", e.target.value)} placeholder="nom@exemple.fr" className={champ} />
            </label>
            <button type="button" onClick={() => retirer(i)} disabled={lignes.length <= 2}
              aria-label="Retirer cette ligne" title="Retirer cette ligne"
              className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre disabled:invisible" style={{ background: "transparent" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLignes((ls) => [...ls, ligneVide()])}
        className="mt-3 inline-flex items-center gap-2 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
        <Plus className="h-4 w-4" /> Ajouter une personne
      </button>
      <p className="m-0 mt-3 text-[12.5px] text-brume">Le point désigne le titulaire : tous voient son dossier. Chacun reçoit son propre lien.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={remplies.length < 2 || !lignes[titulaire]?.email.trim() || mutation.isPending} className={principal}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer les liens
        </button>
        <button type="button" onClick={() => mutation.mutate(false)} disabled={remplies.length < 2 || !lignes[titulaire]?.email.trim() || mutation.isPending} className={secondaire}>
          <Link2 className="h-4 w-4" /> Juste les liens
        </button>
      </div>
    </form>
  );
}

/** Former une famille avec des comptes qui existent déjà. */
function FormerFamille({ users, onFait }) {
  const [choisis, setChoisis] = useState([]);
  const [titulaire, setTitulaire] = useState(null);
  const mutation = useMutation({
    mutationFn: () => appel("/api/admin/familles/lier", { titulaire_id: titulaire, membre_ids: choisis.filter((id) => id !== titulaire) }),
    onSuccess: () => {
      toast.success("Famille formée");
      setChoisis([]);
      setTitulaire(null);
      onFait?.();
    },
    onError: (e) => toast.error(e?.message || "Rattachement impossible"),
  });
  const parId = (id) => users.find((u) => u.id === id);

  return (
    <div>
      {choisis.length > 0 && (
        <div className="mb-3 border-y border-trait">
          {choisis.map((id, i) => {
            const u = parId(id);
            return (
              <div key={id} className={`flex items-center gap-3 px-2 py-3 ${i ? "border-t border-trait" : ""}`}>
                <PointTitulaire actif={titulaire === id} onClick={() => setTitulaire(id)} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[16px] text-encre">{nomDe(u)}</p>
                  <p className="m-0 truncate text-[13.5px] text-ardoise">{u?.email}</p>
                </div>
                <button type="button" onClick={() => { setChoisis((c) => c.filter((x) => x !== id)); if (titulaire === id) setTitulaire(null); }}
                  aria-label="Retirer" title="Retirer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ChoixCompte users={users} exclus={choisis} onChoisir={(u) => { setChoisis((c) => [...c, u.id]); setTitulaire((t) => t || u.id); }} />
      <p className="m-0 mt-3 text-[12.5px] text-brume">Choisissez au moins deux comptes, puis le titulaire : les autres verront son dossier.</p>
      <button type="button" onClick={() => mutation.mutate()} disabled={choisis.length < 2 || !titulaire || mutation.isPending} className={`${principal} mt-4`}>
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Former la famille
      </button>
    </div>
  );
}

/** Une famille de la liste : le titulaire, puis ceux qui voient son dossier. */
function LigneFamille({ famille, users, onFait }) {
  const [ajout, setAjout] = useState(false);
  const geste = useMutation({
    mutationFn: ({ chemin, body }) => appel(chemin, body),
    onSuccess: () => onFait?.(),
    onError: (e) => toast.error(e?.message || "Action impossible"),
  });
  const titulaire = famille.comptes.find((c) => c.titulaire);

  return (
    <div className="border-t border-trait px-2 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="m-0 text-[16px] text-encre">Famille de {titulaire?.full_name || titulaire?.email}</p>
        <button type="button" onClick={() => setAjout((a) => !a)} className="inline-flex items-center gap-1.5 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <Plus className="h-3.5 w-3.5" /> Ajouter un compte
        </button>
      </div>
      <div className="mt-2">
        {famille.comptes.map((c) => (
          <div key={c.id} className="group flex flex-wrap items-center gap-3 py-1.5">
            <span className={`h-2 w-2 flex-none rounded-full ${c.titulaire ? "bg-menthe" : "bg-encre/[0.18]"}`} />
            <span className="text-[13.5px] text-encre">{c.full_name || c.email}</span>
            <span className="text-[13.5px] text-ardoise">
              {c.email}{c.titulaire ? " · titulaire" : ""}{c.actif ? "" : " · lien pas encore ouvert"}
            </span>
            <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
              {!c.actif && <BoutonLienInvitation user={{ email: c.email, mot_de_passe_defini_le: null }} />}
              {!c.titulaire && (
                <>
                  <button type="button" disabled={geste.isPending} onClick={() => geste.mutate({ chemin: "/api/admin/familles/titulaire", body: { user_id: c.id } })}
                    className="rounded-full px-3 py-1 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                    Choisir comme titulaire
                  </button>
                  <button type="button" disabled={geste.isPending}
                    onClick={() => { if (window.confirm(`Retirer ${c.full_name || c.email} de la famille ? Son compte retrouve son propre dossier.`)) geste.mutate({ chemin: "/api/admin/familles/delier", body: { user_id: c.id } }); }}
                    className="rounded-full px-3 py-1 text-[12.5px] text-ardoise hover:text-alerte" style={{ background: "transparent" }}>
                    Retirer
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      {ajout && (
        <div className="mt-3 max-w-[520px]">
          <ChoixCompte users={users} exclus={famille.comptes.map((c) => c.id)} placeholder="Rattacher un compte existant"
            onChoisir={(u) => geste.mutate({ chemin: "/api/admin/familles/lier", body: { titulaire_id: famille.titulaire_id, membre_ids: [u.id] } }, { onSuccess: () => setAjout(false) })} />
          <p className="m-0 mt-2 text-[12.5px] text-brume">Pour une personne sans compte : invitez-la depuis Utilisateurs, puis rattachez-la ici.</p>
        </div>
      )}
    </div>
  );
}

export default function FamillesClients({ users = [] }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("inviter");
  const { data: familles = [], isLoading, isError } = useQuery({
    queryKey: ["familles-comptes"],
    queryFn: () => base44.request("GET", "/api/admin/familles"),
  });
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["familles-comptes"] });
    queryClient.invalidateQueries({ queryKey: ["all-users"] });
  };

  return (
    <div>
      <div className="mb-10 rounded-bloc border border-trait p-6 max-md:p-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[20px] text-encre">Nouvelle famille</p>
          <div className="flex gap-1 rounded-full bg-rail-actif p-1">
            {[["inviter", "Inviter"], ["former", "Avec des comptes existants"]].map(([k, mot]) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={`rounded-full px-3 py-1 text-[12.5px] ${mode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
                style={mode === k ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
        </div>
        {mode === "inviter" ? <InviterFamille onFait={rafraichir} /> : <FormerFamille users={users} onFait={rafraichir} />}
      </div>

      <p className="m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-brume">Familles · {familles.length}</p>
      {isLoading ? (
        <p className="py-10 text-center text-[13.5px] text-brume"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Chargement des familles</p>
      ) : isError ? (
        <p className="py-10 text-center text-[13.5px] text-brume">Les familles n'ont pas pu être chargées. Rechargez la page.</p>
      ) : familles.length === 0 ? (
        <p className="py-10 text-center text-[13.5px] text-brume">Aucune famille encore : invitez-en une, ou rattachez des comptes existants.</p>
      ) : (
        <div className="border-b border-trait">
          {familles.map((f) => <LigneFamille key={f.titulaire_id} famille={f} users={users} onFait={rafraichir} />)}
        </div>
      )}
    </div>
  );
}
