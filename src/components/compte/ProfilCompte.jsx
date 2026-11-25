import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, KeyRound, Loader2, PenLine } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { vueDe } from "@/lib/vue";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { VERRE } from "@/lib/verre";
import { BOUTON_LIGNE, Groupe, Rangee } from "./Reglages";

// Le haut de la page Compte : qui vous êtes. Pour tout le monde, la photo
// (l'avatar en bas à gauche), le nom, le téléphone, le mot de passe. Pour un
// mandataire, en plus : comment il se présente sur ses documents (nom, e-mail
// et téléphone pro, ville de signature, signature), et, en lecture, ce que
// Klocka tient pour lui (RSAC, carte, assurances) — ça engage l'agence.

/** Un champ texte qui s'enregistre en quittant le champ (ou sur Entrée). `grand` : le nom, en tête, qui se lit comme un titre. */
function Champ({ valeur, onEnregistrer, placeholder = "", type = "text", grand = false, label = undefined }) {
  const [v, setV] = useState(valeur || "");
  const [fait, setFait] = useState(false);
  useEffect(() => { setV(valeur || ""); }, [valeur]);
  const enregistrer = async () => {
    if ((v || "") === (valeur || "")) return;
    try { await onEnregistrer(v.trim()); setFait(true); setTimeout(() => setFait(false), 1600); } catch { setV(valeur || ""); }
  };
  return (
    <div className={`flex items-center gap-2 ${grand ? "" : "md:justify-end"}`}>
      <input type={type} value={v} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={enregistrer}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={grand
          ? "-ml-2 w-full max-w-[360px] rounded-champ border border-transparent bg-transparent px-2 py-1 text-[20px] text-encre outline-none transition-colors placeholder:text-brume hover:border-trait focus:border-bord-vif max-md:text-[18px]"
          : "h-9 w-[300px] rounded-champ border border-trait bg-transparent px-3 text-[14px] text-encre outline-none transition-colors placeholder:text-brume focus:border-bord-vif max-md:w-full max-md:text-[16px]"}
        style={{ background: "transparent" }} />
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
  const champMdp = "h-9 rounded-champ border border-trait bg-transparent px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]";
  return (
    // Deux colonnes, comme Mails (25 nov. 2026, Jules : « Mon profil, comme dans Mails en termes de layout ») : les groupes
    // se rangent deux par deux, chacun avec son titre pour que les deux colonnes partent à la même hauteur.
    <div className={partie === "habilitations" ? "flex flex-col gap-8" : "grid items-start gap-8 lg:grid-cols-2"}>
      {haut && (
        <>
          {/* Qui vous êtes : la photo (un clic la change), le nom qui s'écrit sur place, l'adresse de connexion. */}
          <Groupe nu titre="Identité" note="Votre photo et votre nom, tels que l'équipe les voit.">
          <div className={`${VERRE} flex items-center gap-5 px-5 py-5 max-md:gap-4`}>
            <input ref={fichierPhoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fichierPhoto.current?.click()} disabled={photo.isPending} aria-label={user?.picture ? "Changer la photo" : "Ajouter une photo"} title={user?.picture ? "Changer la photo" : "Ajouter une photo"}
              className="group relative h-[72px] w-[72px] flex-none rounded-full" style={{ background: "transparent" }}>
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-rail-actif text-[24px] text-encre">
                {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initiale}
              </span>
              <span className="absolute inset-0 grid place-items-center rounded-full bg-fond/55 text-encre opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {photo.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" strokeWidth={1.7} />}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border border-trait bg-surface-pleine text-craie">
                <Camera className="h-3 w-3" strokeWidth={2} />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <Champ grand label="Votre nom" valeur={user?.full_name} placeholder="Prénom Nom" onEnregistrer={(v) => poserProfil({ full_name: v })} />
              <p className="m-0 mt-0.5 truncate text-[13.5px] text-ardoise">{user?.email}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-brume">{mandataire ? "Votre photo figure aussi en première page de vos avis de valeur." : "L'adresse de connexion ne se change pas ici."}</p>
            </div>
          </div>
          </Groupe>

          <Groupe titre="Connexion" note="Le mot de passe de votre compte Klocka.">
            <Rangee titre="Mot de passe" note={mdp ? null : "Pour vous connecter avec votre adresse."} pile={!!mdp}>
              {mdp ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); changerMdp.mutate(mdp); }}>
                  <input type="password" autoComplete="current-password" placeholder="Mot de passe actuel" value={mdp.ancien} onChange={(e) => setMdp((x) => ({ ...x, ancien: e.target.value }))} className={`${champMdp} w-[220px] max-md:w-full`} style={{ background: "transparent" }} />
                  <input type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={mdp.nouveau} onChange={(e) => setMdp((x) => ({ ...x, nouveau: e.target.value }))} className={`${champMdp} w-[220px] max-md:w-full`} style={{ background: "transparent" }} />
                  <button type="submit" disabled={changerMdp.isPending || !mdp.ancien || !mdp.nouveau} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                    {changerMdp.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Changer
                  </button>
                  <button type="button" onClick={() => setMdp(null)} className="h-9 px-2 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
                </form>
              ) : (
                <button type="button" onClick={() => setMdp({ ancien: "", nouveau: "" })} className={BOUTON_LIGNE} style={{ background: "transparent" }}>
                  <KeyRound className="h-3.5 w-3.5" />Changer
                </button>
              )}
            </Rangee>
          </Groupe>
        </>
      )}

      {haut && !mandataire && user?.role === "admin" && <Disponibilite user={user} />}

      {haut && mandataire && (
        <Groupe titre="Sur vos documents" note="Ce qui figure sur vos avis de valeur et vos mandats, sous votre nom.">
          <Rangee titre="Nom affiché" note="Si vide : votre nom de profil.">
            <Champ valeur={m.nom_avis} placeholder={user?.full_name || "Prénom Nom"} onEnregistrer={(v) => poserPro({ nom_avis: v })} />
          </Rangee>
          <Rangee titre="Téléphone professionnel">
            <Champ valeur={m.telephone} placeholder="06 12 34 56 78" type="tel" onEnregistrer={(v) => poserPro({ telephone: v })} />
          </Rangee>
          <Rangee titre="E-mail professionnel" note="Si vide : l'adresse de connexion.">
            <Champ valeur={m.email_avis} placeholder={user?.email} type="email" onEnregistrer={(v) => poserPro({ email_avis: v })} />
          </Rangee>
          <Rangee titre="Ville de signature" note="« Fait à … » en bas de vos avis.">
            <Champ valeur={m.ville_signature} placeholder="Mâcon" onEnregistrer={(v) => poserPro({ ville_signature: v })} />
          </Rangee>
          <Rangee titre="Signature" note="Une photo ou un scan de votre signature, sur fond blanc.">
            {m.signature_url && <img src={m.signature_url} alt="Votre signature" className="h-10 max-w-[160px] rounded-[6px] bg-white object-contain p-1" />}
            <input ref={fichierSignature} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) signature.mutate(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fichierSignature.current?.click()} disabled={signature.isPending} className={BOUTON_LIGNE} style={{ background: "transparent" }}>
              {signature.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
              {m.signature_url ? "Changer" : "Ajouter"}
            </button>
          </Rangee>
        </Groupe>
      )}

      {droite && mandataire && (
        <Groupe titre="Vos habilitations" note={adminEnVue ? null : "Tenues par Klocka : elles engagent l'agence. Une erreur ou un renouvellement ? Dites-le à l'équipe."}>
          {adminEnVue && (
            <p className="m-0 px-5 py-3.5 text-[13px] leading-[1.55] text-ardoise">
              Vous êtes admin : dans{" "}
              <Link to={createPageUrl("AdminMandataires")} className="text-menthe underline-offset-2 hover:underline">Mandataires</Link>, « Être aussi mandataire » vous inscrit parmi eux ; votre secteur et vos mentions s'y règlent comme pour les autres.
            </p>
          )}
          {(compte?.alertes || []).length > 0 && (
            <p className="m-0 bg-ambre/10 px-5 py-3 text-[13px] text-ambre">{compte.alertes.join(" · ")}</p>
          )}
          {[
            ["Statut", k.qualite_avis || "Pas encore renseigné"],
            ["RSAC", k.rsac ? `${k.rsac}${k.ville_rsac ? ` · ${k.ville_rsac}` : ""}` : "Pas encore renseigné"],
            ["Attestation d'habilitation", `${k.carte_t || "Pas encore renseignée"}${k.attestation_expire_le ? ` · jusqu'au ${dateFr(k.attestation_expire_le)}` : ""}`],
            ["RC professionnelle", k.rc_pro_expire_le ? `Jusqu'au ${dateFr(k.rc_pro_expire_le)}` : "Pas encore renseignée"],
            ["Secteur", k.secteur || "Pas encore attribué"],
          ].map(([t, v]) => (
            <Rangee key={t} titre={t}><span className="text-right text-[14px] text-craie max-md:text-left">{v}</span></Rangee>
          ))}
        </Groupe>
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
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["agenda-etat"] }); queryClient.invalidateQueries({ queryKey: ["current-user"] }); };
  const deconnecter = useMutation({
    mutationFn: () => base44.request("POST", "/api/auth/agenda/deconnecter"),
    onSuccess: rafraichir,
  });
  if (!data?.analyste) return null;
  return (
    <Groupe titre="Disponibilité" note="Absent, vos dossiers mandataires passent à un collègue présent, avec un briefing ; ils vous reviennent à votre retour.">
      <Rangee titre="Agenda Google" note={data.agenda ? `Connecté · ${data.agenda.email}` : "Lu seulement pour vos « Absent du bureau » et vos congés."}>
        {data.agenda ? (
          <button type="button" onClick={() => deconnecter.mutate()} disabled={deconnecter.isPending} className={`${BOUTON_LIGNE} hover:!border-alerte/60 hover:!text-alerte`} style={{ background: "transparent" }}>Déconnecter</button>
        ) : (
          <a href="/api/auth/google/agenda" className="inline-flex h-8 items-center rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Connecter</a>
        )}
      </Rangee>
      {/* « En ce moment » et « Déclarer une absence » retirés (25 nov. 2026, Jules) : l'agenda Google seul dit l'absence. */}
    </Groupe>
  );
}
