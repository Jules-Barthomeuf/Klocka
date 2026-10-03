import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, KeyRound, Loader2, PenLine } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { vueDe } from "@/lib/vue";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Le haut de la page Compte : qui vous êtes. Pour tout le monde, la photo
// (l'avatar en bas à gauche), le nom, le téléphone, le mot de passe. Pour un
// mandataire, en plus : comment il se présente sur ses documents (nom, e-mail
// et téléphone pro, ville de signature, signature), et, en lecture, ce que
// Klocka tient pour lui (RSAC, carte, assurances) — ça engage l'agence.

const etiq = "m-0 text-[11.5px] uppercase tracking-[.12em] text-brume";

function Ligne({ titre, note = null, compacte = false, children }) {
  return (
    <div className={`grid border-t border-trait py-4 first:border-t-0 ${compacte ? "gap-1" : "gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-center"}`}>
      <div>
        <p className="m-0 text-[14px] text-encre">{titre}</p>
        {note && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-brume">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Un champ texte qui s'enregistre en quittant le champ (ou sur Entrée). */
function Champ({ valeur, onEnregistrer, placeholder = "", type = "text" }) {
  const [v, setV] = useState(valeur || "");
  const [fait, setFait] = useState(false);
  useEffect(() => { setV(valeur || ""); }, [valeur]);
  const enregistrer = async () => {
    if ((v || "") === (valeur || "")) return;
    try { await onEnregistrer(v.trim()); setFait(true); setTimeout(() => setFait(false), 1600); } catch { setV(valeur || ""); }
  };
  return (
    <div className="flex items-center gap-2">
      <input type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={enregistrer}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-full max-w-[420px] rounded-[10px] border border-trait bg-surface-pleine px-3.5 py-2.5 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif" />
      {fait && <Check className="h-4 w-4 flex-none text-menthe" aria-label="Enregistré" />}
    </div>
  );
}

const dateFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null);

/**
 * `partie` : « tout » (une colonne), « haut » (profil et documents, au-dessus
 * des réglages) ou « habilitations » (la colonne de droite, en vue large).
 */
export default function ProfilCompte({ user, partie = "tout" }) {
  const queryClient = useQueryClient();
  // La vue, pas le rôle : un admin en « Vue Mandataire » a sa page Compte de
  // mandataire (sa fiche, ses habilitations, son secteur), sous la même adresse.
  const mandataire = vueDe(user) === "mandataire";
  const adminEnVue = user?.role === "admin" && mandataire;
  const fichierPhoto = useRef(null);
  const fichierSignature = useRef(null);
  const [mdp, setMdp] = useState(null);

  const { data: compte } = useQuery({
    queryKey: ["m-compte"],
    queryFn: () => base44.request("GET", "/api/mandataire/compte"),
    enabled: mandataire,
  });
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["current-user"] });
    queryClient.invalidateQueries({ queryKey: ["m-compte"] });
  };
  const erreur = (e) => toast.error(e?.message || "Impossible");

  const photo = useMutation({
    mutationFn: (f) => { const d = new FormData(); d.append("fichier", f); return base44.request("POST", "/api/auth/photo", { body: d, isForm: true }); },
    onSuccess: () => { rafraichir(); toast.success("Photo mise à jour"); },
    onError: erreur,
  });
  const signature = useMutation({
    mutationFn: (f) => { const d = new FormData(); d.append("fichier", f); return base44.request("POST", "/api/mandataire/compte/signature", { body: d, isForm: true }); },
    onSuccess: () => { rafraichir(); toast.success("Signature enregistrée"); },
    onError: erreur,
  });
  const poserProfil = async (patch) => { try { await base44.auth.updateMe(patch); rafraichir(); } catch (e) { erreur(e); throw e; } };
  const poserPro = async (patch) => { try { await base44.request("PATCH", "/api/mandataire/compte", { body: patch }); rafraichir(); } catch (e) { erreur(e); throw e; } };
  const changerMdp = useMutation({
    mutationFn: (corps) => base44.request("POST", "/api/auth/changer-mot-de-passe", { body: corps }),
    onSuccess: () => { setMdp(null); toast.success("Mot de passe changé"); },
    onError: erreur,
  });

  const initiale = (user?.full_name || user?.email || "?").charAt(0).toUpperCase();
  const m = compte?.modifiable || {};
  const k = compte?.klocka || {};

  const haut = partie !== "habilitations";
  const droite = partie !== "haut";
  return (
    <div className="space-y-5">
      {haut && (
      <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
        <p className={`${etiq} pt-4`}>Profil</p>
        <Ligne titre="Photo" note={mandataire ? "Votre portrait : en bas à gauche de l'application, et en première page de vos avis de valeur." : "En bas à gauche de l'application."}>
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-full bg-menthe text-[22px] font-medium text-sur-menthe">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initiale}
            </span>
            <input ref={fichierPhoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fichierPhoto.current?.click()} disabled={photo.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              {photo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {user?.picture ? "Changer la photo" : "Ajouter une photo"}
            </button>
          </div>
        </Ligne>
        <Ligne titre="Nom">
          <Champ valeur={user?.full_name} placeholder="Prénom Nom" onEnregistrer={(v) => poserProfil({ full_name: v })} />
        </Ligne>
        <Ligne titre="Adresse e-mail" note="Celle de la connexion : elle ne se change pas ici.">
          <p className="m-0 text-[14px] text-craie">{user?.email}</p>
        </Ligne>
        <Ligne titre="Mot de passe">
          {mdp ? (
            <form className="flex max-w-[420px] flex-col gap-2" onSubmit={(e) => { e.preventDefault(); changerMdp.mutate(mdp); }}>
              <input type="password" autoComplete="current-password" placeholder="Mot de passe actuel" value={mdp.ancien} onChange={(e) => setMdp((x) => ({ ...x, ancien: e.target.value }))}
                className="rounded-[10px] border border-trait bg-surface-pleine px-3.5 py-2.5 text-[14px] text-encre outline-none focus:border-bord-vif" />
              <input type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={mdp.nouveau} onChange={(e) => setMdp((x) => ({ ...x, nouveau: e.target.value }))}
                className="rounded-[10px] border border-trait bg-surface-pleine px-3.5 py-2.5 text-[14px] text-encre outline-none focus:border-bord-vif" />
              <div className="flex gap-2">
                <button type="submit" disabled={changerMdp.isPending} className="rounded-full bg-menthe px-4 py-2 text-[13px] text-sur-menthe hover:bg-menthe-survol">Changer</button>
                <button type="button" onClick={() => setMdp(null)} className="rounded-full border border-bord-doux px-4 py-2 text-[13px] text-craie" style={{ background: "transparent" }}>Annuler</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setMdp({ ancien: "", nouveau: "" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              <KeyRound className="h-3.5 w-3.5" /> Changer le mot de passe
            </button>
          )}
        </Ligne>
      </section>
      )}

      {haut && !mandataire && user?.role === "admin" && <Disponibilite user={user} />}

      {haut && mandataire && (
        <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
          <p className={`${etiq} pt-4`}>Sur vos documents</p>
          <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-brume">Ce qui figure sur vos avis de valeur et vos mandats, sous votre nom.</p>
          <Ligne titre="Nom affiché" note="Si vide : votre nom de profil.">
            <Champ valeur={m.nom_avis} placeholder={user?.full_name || "Prénom Nom"} onEnregistrer={(v) => poserPro({ nom_avis: v })} />
          </Ligne>
          <Ligne titre="Téléphone professionnel">
            <Champ valeur={m.telephone} placeholder="06 12 34 56 78" type="tel" onEnregistrer={(v) => poserPro({ telephone: v })} />
          </Ligne>
          <Ligne titre="E-mail professionnel" note="Si vide : l'adresse de connexion.">
            <Champ valeur={m.email_avis} placeholder={user?.email} type="email" onEnregistrer={(v) => poserPro({ email_avis: v })} />
          </Ligne>
          <Ligne titre="Ville de signature" note="« Fait à … » en bas de vos avis.">
            <Champ valeur={m.ville_signature} placeholder="Mâcon" onEnregistrer={(v) => poserPro({ ville_signature: v })} />
          </Ligne>
          <Ligne titre="Signature" note="Une photo ou un scan de votre signature, sur fond blanc.">
            <div className="flex items-center gap-4">
              {m.signature_url && <img src={m.signature_url} alt="Votre signature" className="h-12 max-w-[180px] rounded-[6px] bg-white object-contain p-1" />}
              <input ref={fichierSignature} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) signature.mutate(f); e.target.value = ""; }} />
              <button type="button" onClick={() => fichierSignature.current?.click()} disabled={signature.isPending}
                className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                {signature.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                {m.signature_url ? "Changer la signature" : "Ajouter la signature"}
              </button>
            </div>
          </Ligne>
        </section>
      )}

      {droite && mandataire && (
        <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
          <p className={`${etiq} pt-4`}>Vos habilitations</p>
          {adminEnVue ? (
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-brume">
              Tenues par Klocka. Vous êtes admin : dans{" "}
              <Link to={createPageUrl("AdminMandataires")} className="text-menthe underline-offset-2 hover:underline">Mandataires</Link>, « Être aussi mandataire » vous inscrit parmi eux ; votre secteur et vos mentions s'y règlent comme pour les autres.
            </p>
          ) : (
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-brume">Tenues par Klocka : elles engagent l'agence. Une erreur ou un renouvellement ? Dites-le à l'équipe.</p>
          )}
          {(compte?.alertes || []).length > 0 && (
            <p className="m-0 mt-3 rounded-[10px] bg-ambre/15 px-3.5 py-2.5 text-[13px] text-ambre">{compte.alertes.join(" · ")}</p>
          )}
          <Ligne compacte={partie === "habilitations"} titre="Statut"><p className="m-0 text-[14px] text-craie">{k.qualite_avis}</p></Ligne>
          <Ligne compacte={partie === "habilitations"} titre="RSAC"><p className="m-0 text-[14px] text-craie">{k.rsac ? `${k.rsac}${k.ville_rsac ? ` · ${k.ville_rsac}` : ""}` : "Pas encore renseigné"}</p></Ligne>
          <Ligne compacte={partie === "habilitations"} titre="Attestation d'habilitation"><p className="m-0 text-[14px] text-craie">{k.carte_t || "Pas encore renseignée"}{k.attestation_expire_le ? ` · jusqu'au ${dateFr(k.attestation_expire_le)}` : ""}</p></Ligne>
          <Ligne compacte={partie === "habilitations"} titre="RC professionnelle"><p className="m-0 text-[14px] text-craie">{k.rc_pro_expire_le ? `Jusqu'au ${dateFr(k.rc_pro_expire_le)}` : "Pas encore renseignée"}</p></Ligne>
          <Ligne compacte={partie === "habilitations"} titre="Secteur"><p className="m-0 text-[14px] text-craie">{k.secteur || "Pas encore attribué"}</p></Ligne>
        </section>
      )}
    </div>
  );
}

/**
 * La disponibilité d'un analyste : son agenda Google (lu pour ses « Absent du
 * bureau »), ou une absence déclarée ici. Absent, ses dossiers mandataires
 * passent à un collègue présent, briefé par l'IA, et lui reviennent au retour.
 */
function Disponibilite({ user }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["agenda-etat"], queryFn: () => base44.request("GET", "/api/auth/agenda/etat") });
  const [date, setDate] = useState("");
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["agenda-etat"] }); queryClient.invalidateQueries({ queryKey: ["current-user"] }); };
  const absenter = useMutation({
    mutationFn: (jusqu) => base44.auth.updateMe({ absent_jusqu_au: jusqu }),
    onSuccess: () => { rafraichir(); toast.success("C'est noté"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const deconnecter = useMutation({
    mutationFn: () => base44.request("POST", "/api/auth/agenda/deconnecter"),
    onSuccess: rafraichir,
  });
  if (!data?.analyste) return null;
  const absence = data.absence;
  const jour = (d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="rounded-[16px] border border-trait k-grid px-5 py-2 md:px-6">
      <p className={`${etiq} pt-4`}>Disponibilité</p>
      <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-brume">Absent, vos dossiers mandataires passent à un collègue présent, avec un briefing ; ils vous reviennent à votre retour.</p>
      <Ligne titre="Agenda Google" note="Lu seulement pour vos « Absent du bureau » et vos congés.">
        {data.agenda ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14px] text-craie">Connecté · {data.agenda.email}</span>
            <button type="button" onClick={() => deconnecter.mutate()} className="text-[12.5px] text-brume hover:text-alerte" style={{ background: "transparent" }}>Déconnecter</button>
          </div>
        ) : (
          <a href="/api/auth/google/agenda" className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Connecter mon agenda</a>
        )}
      </Ligne>
      <Ligne titre="En ce moment">
        <p className="m-0 text-[14px] text-craie">
          {absence ? `Absent jusqu'au ${jour(absence.jusqu_au)} (${absence.source === "agenda" ? "d'après votre agenda" : "déclaré ici"})` : "Présent"}
        </p>
      </Ligne>
      <Ligne titre="Déclarer une absence" note="Si l'agenda ne le dit pas : vos dossiers passent la main jusqu'à cette date.">
        {user?.absent_jusqu_au && Date.parse(user.absent_jusqu_au) > Date.now() ? (
          <button type="button" onClick={() => absenter.mutate(null)} className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Je suis de retour</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)}
              className="rounded-[10px] border border-trait bg-surface-pleine px-3 py-2 text-[14px] text-encre outline-none focus:border-bord-vif" />
            <button type="button" disabled={!date || absenter.isPending} onClick={() => absenter.mutate(new Date(`${date}T20:00:00`).toISOString())}
              className="rounded-full bg-menthe px-3.5 py-1.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Absent jusqu'à cette date</button>
          </div>
        )}
      </Ligne>
    </section>
  );
}
