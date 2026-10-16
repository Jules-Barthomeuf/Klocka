import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useUser } from "@/components/providers/UserProvider";
import AccesAdmins from "@/components/compte/AccesAdmins";
import Chargement from "@/components/ui/Chargement";

// L'équipe (10 oct. 2026) : les administrateurs et les mandataires, à part
// des clients (page Clients). Un admin peut aussi être mandataire ; un
// mandataire peut recevoir l'admin ; un client devient mandataire depuis
// Clients (« Promouvoir mandataire ») ou par l'invitation ci-dessous. Seuls
// les super admins changent les rôles ; les autres admins lisent.

const req = (m, chemin, body) => base44.request(m, `/api/admin/equipe${chemin}`, body ? { body } : undefined);
const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const plein = "inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";
const champ = "h-9 rounded-full border border-bord-vif bg-fond px-3.5 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "jamais");

function Pastille({ children, ton = "bg-relief text-craie" }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] ${ton}`}>{children}</span>;
}

function Ligne({ u, peut, onRole, occupe }) {
  const [confirme, setConfirme] = useState(null);
  const demander = (role, aussi, mot) => setConfirme({ role, aussi, mot });
  const actions = [];
  if (peut && !u.super_admin) {
    if (u.role === "admin") {
      actions.push(u.aussi_mandataire ? { mot: "Ne plus être mandataire", role: "admin", aussi: false } : { mot: "Aussi mandataire", role: "admin", aussi: true });
      actions.push(u.aussi_mandataire ? { mot: "Retirer l'admin (reste mandataire)", role: "mandataire", danger: true } : { mot: "Rétrograder en client", role: "user", danger: true });
    } else if (u.role === "mandataire") {
      actions.push({ mot: "Donner l'admin (reste mandataire)", role: "admin", aussi: true });
      actions.push({ mot: "Retirer le mandataire", role: "user", danger: true });
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-trait px-2 py-4 first:border-t-0">
      <div className="min-w-[240px] flex-1">
        <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] text-encre">{u.nom || u.email}{u.super_admin && <Pastille ton="bg-menthe/15 text-encre"><ShieldCheck className="mr-1 h-3 w-3" />super admin</Pastille>}{u.roles.map((r) => <Pastille key={r}>{r}</Pastille>)}{u.invitation_en_attente && <Pastille ton="bg-ambre/15 text-ambre">invitation en attente</Pastille>}{!u.actif && !u.invitation_en_attente && <Pastille ton="bg-relief text-brume">sans mot de passe</Pastille>}</p>
        <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{u.email}{u.secteur ? ` · secteur ${u.secteur.nom}` : u.roles.includes("mandataire") ? " · sans secteur" : ""}{u.role === "admin" && u.pages_fermees ? ` · ${u.pages_fermees} page(s) fermée(s)` : ""} · dernière visite {quand(u.derniere_visite)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {confirme ? (
          <span className="inline-flex items-center gap-2 text-[12.5px] text-craie">{confirme.mot} ?<button type="button" disabled={occupe} onClick={() => { onRole(u.email, confirme.role, confirme.aussi); setConfirme(null); }} className={plein}>Confirmer</button><button type="button" onClick={() => setConfirme(null)} className={bouton}>Annuler</button></span>
        ) : actions.map((a) => <button key={a.mot} type="button" onClick={() => demander(a.role, a.aussi, a.mot)} className={`${bouton} ${a.danger ? "hover:border-alerte hover:text-alerte" : ""}`}>{a.mot}</button>)}
      </div>
    </div>
  );
}

export default function AdminEquipe() {
  const user = useUser();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["equipe"], queryFn: () => req("GET", "") });
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("mandataire");
  const [lien, setLien] = useState(null);
  const [copie, setCopie] = useState(false);
  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["equipe"] }); qc.invalidateQueries({ queryKey: ["admin-mandataires"] }); qc.invalidateQueries({ queryKey: ["current-user"] }); };
  const changer = useMutation({ mutationFn: ({ email: e, role: r, aussi }) => req("POST", `/${encodeURIComponent(e)}/role`, { role: r, aussi_mandataire: aussi ?? null }), onSuccess: (r) => { toast.success(`${r.user.email} : ${r.user.roles.join(" et ") || "client"}`); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const inviter = useMutation({ mutationFn: () => req("POST", "/inviter", { email: email.trim(), nom: nom.trim(), role }), onSuccess: (r) => { setLien(r.lien || null); toast.success(r.deja_actif ? `${r.user.email} est maintenant ${r.user.roles.join(" et ")}` : `Compte créé : envoyez-lui le lien`); setEmail(""); setNom(""); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const copier = async () => { try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch { toast.error("Copie impossible"); } };
  if (user?.role !== "admin") return <p className="p-8 text-[14px] text-ardoise">Réservé aux administrateurs.</p>;
  const d = q.data;
  const peut = !!d?.peut_modifier;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6">
      <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Équipe</h1>
      <p className="m-0 mt-1.5 text-[14px] text-ardoise">Les administrateurs et les mandataires. Les clients sont dans Clients.{!peut && d ? " Vous lisez : seuls les super administrateurs changent les rôles." : ""}</p>
      {q.isLoading && <Chargement taille="grand" />}
      {d && (
        <div className="mt-8 flex flex-col gap-10">
          {peut && (
            <section className="rounded-bloc border border-trait p-5">
              <h2 className={titreCase}>Inviter dans l'équipe</h2>
              <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviter.mutate(); }}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse email" type="email" className={`${champ} w-[280px] max-w-full`} />
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom et nom" className={`${champ} w-[220px] max-w-full`} />
                <div className="inline-flex rounded-full border border-bord-vif p-[3px]">{[["mandataire", "Mandataire"], ["admin", "Admin"]].map(([v, mot]) => <button key={v} type="button" onClick={() => setRole(v)} className={`h-8 rounded-full px-3 text-[13px] ${role === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={role === v ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
                <button type="submit" disabled={!email.trim() || inviter.isPending} className={plein}>{inviter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inviter"}</button>
              </form>
              <p className="m-0 mt-2 text-[12.5px] text-brume">Une adresse déjà cliente devient mandataire (ou admin) en gardant ses projets. Un compte neuf reçoit un lien pour choisir son mot de passe, valable 14 jours.</p>
              {lien && <p className="m-0 mt-3 flex flex-wrap items-center gap-2 text-[13px] text-encre"><span className="truncate rounded-full border border-trait px-3 py-1.5 font-mono text-[12px]">{lien}</span><button type="button" onClick={copier} className={bouton}>{copie ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Copy className="h-3.5 w-3.5" />}Copier le lien</button></p>}
            </section>
          )}
          <section>
            <h2 className={titreCase}>Administrateurs · {d.admins.length}</h2>
            <div className="rounded-bloc border border-trait px-3">{d.admins.map((u) => <Ligne key={u.id} u={u} peut={peut} onRole={(e, r, a) => changer.mutate({ email: e, role: r, aussi: a })} occupe={changer.isPending} />)}</div>
          </section>
          <section>
            <h2 className={titreCase}>Mandataires · {d.mandataires.length}</h2>
            <div className="rounded-bloc border border-trait px-3">
              {d.mandataires.map((u) => <Ligne key={u.id} u={u} peut={peut} onRole={(e, r, a) => changer.mutate({ email: e, role: r, aussi: a })} occupe={changer.isPending} />)}
              {!d.mandataires.length && <p className="m-0 py-8 text-center text-[14px] text-brume">Aucun mandataire : invitez-en un ci-dessus, ou promouvez un client depuis Clients.</p>}
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-brume">Le secteur, la fiche (RSAC, assurance, photo, signature) et l'analyste référent se règlent dans Mandataires.</p>
          </section>
          {user?.gere_les_acces && (
            <section>
              <h2 className={titreCase}>Les pages de chaque administrateur</h2>
              <AccesAdmins />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
