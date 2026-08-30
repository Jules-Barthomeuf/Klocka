import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Search } from "lucide-react";

// Assigner, dans les deux sens.
//
// Depuis un projet, on choisit des clients ; depuis un client, on choisit des
// projets. Le lien est le même — `client_emails` sur le projet, `client_email`
// pour le principal — et la liste à cocher aussi : on la construit une fois,
// on la nourrit de l'un ou de l'autre.

const estAssigne = (projet, email) =>
  projet.client_email === email || (projet.client_emails || []).includes(email);

function Ligne({ coche, onChange, titre, detail }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-t border-[#f2f3f5]/[0.08] transition-colors ${
        coche ? "bg-[#a9c5b9]/[0.06]" : "hover:bg-[#f2f3f5]/[0.03]"
      }`}
    >
      <span
        className={`w-4 h-4 flex items-center justify-center border flex-shrink-0 ${
          coche ? "bg-[#a9c5b9] border-[#a9c5b9]" : "border-[#3a3f4a]"
        }`}
      >
        {coche && <Check className="w-3 h-3 text-[#000000]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] text-[#f2f3f5] truncate">{titre}</span>
        {detail && <span className="block text-[12px] text-[#9298a6] truncate">{detail}</span>}
      </span>
    </button>
  );
}

function Liste({ elements, coches, basculer, recherche, setRecherche, vide }) {
  return (
    <>
      <div className="relative mb-2">
        <Search className="w-4 h-4 text-[#6a7180] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          className="w-full bg-[#0f1114] border border-[#1f2228] focus:border-[#a9c5b9] rounded-md pl-9 pr-3 py-2 text-[14px] text-[#f2f3f5] outline-none"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto border-b border-[#f2f3f5]/[0.08]">
        {elements.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-[#6a7180]">{vide}</p>
        ) : (
          elements.map((el) => (
            <Ligne
              key={el.cle}
              coche={coches.has(el.cle)}
              onChange={() => basculer(el.cle)}
              titre={el.titre}
              detail={el.detail}
            />
          ))
        )}
      </div>
    </>
  );
}

const filtre = (texte, q) => !q || String(texte || "").toLowerCase().includes(q.toLowerCase());

/**
 * Depuis un projet : cocher les clients. Rend au parent les deux champs à
 * enregistrer — le premier coché devient principal s'il n'y en avait pas.
 */
export function DialogueAssignerClient({ ouvert, onClose, users, formData, onValider }) {
  const [recherche, setRecherche] = useState("");
  const initial = useMemo(
    () => new Set([formData.client_email, ...(formData.client_emails || [])].filter(Boolean)),
    [formData.client_email, formData.client_emails]
  );
  const [coches, setCoches] = useState(initial);

  // Réouvert sur un autre projet : on repart de ce qu'il a.
  React.useEffect(() => {
    if (ouvert) setCoches(new Set(initial));
  }, [ouvert, initial]);

  const clients = users
    .filter((u) => u.role !== "admin")
    .filter((u) => filtre(u.full_name, recherche) || filtre(u.email, recherche))
    .map((u) => ({ cle: u.email, titre: u.full_name || u.email, detail: u.full_name ? u.email : null }));

  const basculer = (cle) =>
    setCoches((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const valider = () => {
    const emails = [...coches];
    // Le principal reste s'il est toujours coché ; sinon le premier prend sa place.
    const principal = coches.has(formData.client_email) ? formData.client_email : emails[0] || "";
    onValider({ client_email: principal, client_emails: emails.filter((e) => e !== principal) });
    onClose();
  };

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#000000] border-[#1f2228] max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#f2f3f5]">Assigner des clients</DialogTitle>
          <DialogDescription className="text-[#9298a6]">
            Les clients cochés verront ce projet dans leur espace. Un mail les prévient à l'enregistrement.
          </DialogDescription>
        </DialogHeader>
        <Liste
          elements={clients}
          coches={coches}
          basculer={basculer}
          recherche={recherche}
          setRecherche={setRecherche}
          vide="Aucun client ne correspond."
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[12px] text-[#9298a6]">
            {coches.size} client{coches.size > 1 ? "s" : ""} assigné{coches.size > 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-[#2c3139] text-[11px] tracking-[.14em] uppercase text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06]">
              Annuler
            </button>
            <button onClick={valider} className="px-5 py-2 bg-[#a9c5b9] text-[#000000] text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-[#bcd4c9]">
              Assigner
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Depuis un client : cocher les projets. Le système sait déjà pour qui — la
 * ligne d'où l'on vient — il ne reste qu'à choisir. Enregistre tout de suite.
 */
export function DialogueAssignerProjets({ user, projects, ouvert, onClose }) {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState("");
  const initial = useMemo(
    () => new Set(projects.filter((p) => user && estAssigne(p, user.email)).map((p) => p.id)),
    [projects, user]
  );
  const [coches, setCoches] = useState(initial);

  React.useEffect(() => {
    if (ouvert) setCoches(new Set(initial));
  }, [ouvert, initial]);

  const elements = projects
    .filter((p) => !p.archived)
    .filter((p) => filtre(p.titre, recherche) || filtre(p.adresse_complete, recherche) || filtre(p.ville_secteur_champ1, recherche))
    .map((p) => ({ cle: p.id, titre: p.titre || "Sans titre", detail: p.ville_secteur_champ1 || p.adresse_complete || null }));

  const basculer = (cle) =>
    setCoches((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const enregistrer = useMutation({
    mutationFn: async () => {
      const email = user.email;
      let ajoutes = 0;
      let retires = 0;
      for (const p of projects) {
        const avant = estAssigne(p, email);
        const apres = coches.has(p.id);
        if (avant === apres) continue;
        if (apres) {
          const patch = p.client_email
            ? { client_emails: Array.from(new Set([...(p.client_emails || []), email])) }
            : { client_email: email };
          await base44.entities.Project.update(p.id, patch);
          ajoutes += 1;
          // Même courtoisie que depuis le projet : le client apprend qu'un
          // projet l'attend. Jamais bloquant.
          try {
            await base44.functions.invoke("sendProjectAssignmentEmail", { clientEmail: email, projectTitle: p.titre, projectId: p.id });
          } catch {
            /* le mail est un plus, l'assignation est le fait */
          }
        } else {
          const restants = (p.client_emails || []).filter((e) => e !== email);
          const patch =
            p.client_email === email
              ? { client_email: restants[0] || "", client_emails: restants.slice(1) }
              : { client_emails: restants };
          await base44.entities.Project.update(p.id, patch);
          retires += 1;
        }
      }
      return { ajoutes, retires };
    },
    onSuccess: ({ ajoutes, retires }) => {
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        [ajoutes ? `${ajoutes} projet${ajoutes > 1 ? "s" : ""} assigné${ajoutes > 1 ? "s" : ""}` : null, retires ? `${retires} retiré${retires > 1 ? "s" : ""}` : null]
          .filter(Boolean)
          .join(" · ") || "Rien à changer"
      );
      onClose();
    },
    onError: (e) => toast.error(e?.message || "Assignation impossible"),
  });

  if (!user) return null;

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && !enregistrer.isPending && onClose()}>
      <DialogContent className="bg-[#000000] border-[#1f2228] max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#f2f3f5]">Assigner des projets</DialogTitle>
          <DialogDescription className="text-[#9298a6]">
            À <span className="text-[#f2f3f5]">{user.full_name || user.email}</span>. Les projets cochés apparaîtront dans son espace.
          </DialogDescription>
        </DialogHeader>
        <Liste
          elements={elements}
          coches={coches}
          basculer={basculer}
          recherche={recherche}
          setRecherche={setRecherche}
          vide="Aucun projet ne correspond."
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[12px] text-[#9298a6]">
            {coches.size} projet{coches.size > 1 ? "s" : ""} coché{coches.size > 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={enregistrer.isPending} className="px-4 py-2 border border-[#2c3139] text-[11px] tracking-[.14em] uppercase text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06] disabled:opacity-40">
              Annuler
            </button>
            <button
              onClick={() => enregistrer.mutate()}
              disabled={enregistrer.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#a9c5b9] text-[#000000] text-[11px] tracking-[.14em] uppercase font-semibold hover:bg-[#bcd4c9] disabled:opacity-40"
            >
              {enregistrer.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Assigner
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
