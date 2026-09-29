import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, Eye, EyeOff, KeyRound, Loader2, Mail, UserPlus } from "lucide-react";
import { LogoGoogle } from "@/components/mails/ConnexionGmail";

// Connexion en deux temps : on saisit son adresse, l'app reconnaît le compte,
// puis on saisit son mot de passe — ou on le choisit s'il s'agit de la première
// connexion (compte invité par l'équipe).
//
// On n'entre que sur invitation : un compte sans mot de passe s'ouvre avec
// son lien, jamais avec sa seule adresse. Une adresse inconnue est renvoyée
// vers son conseiller.

const ETAPES = {
  EMAIL: "email",
  MOT_DE_PASSE: "mot_de_passe",
  CREATION: "creation",
  INCONNU: "inconnu",
};

// La maquette « Connexion » : des champs pleins arrondis avec leur icône, des
// boutons en pilule de 44 px. Les couleurs passent par le thème.
const CHAMP = "h-11 w-full rounded-[14px] border border-trait bg-fond py-2 pl-9 pr-3 text-[14px] text-encre outline-none placeholder:text-brume";
const BOUTON = "flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Pas de compte : la demande passe par le formulaire d'inscription.
const CREER_COMPTE = "https://dpe3smipjxh.typeform.com/to/GD7sREFs";

// Panneau de connexion nu : porte toute la logique, sans Dialog. La page
// d'accueil l'affiche en colonne de droite ; ConnexionDialog reste disponible
// pour l'ouvrir en surimpression ailleurs.
/**
 * @param {{invitation?: {email, prenom, jeton}}} props - une invitation ouvre
 *   directement sur le choix du mot de passe : l'adresse vient du lien.
 */
export function ConnexionPanel({ invitation = null } = {}) {
  const [etape, setEtape] = useState(invitation ? ETAPES.CREATION : ETAPES.EMAIL);
  const [email, setEmail] = useState(invitation?.email || "");
  const [compte, setCompte] = useState(invitation ? { prenom: invitation.prenom, role: "user" } : null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // La connexion Google n'est proposée que si le serveur est configuré pour.
  const [googleDispo, setGoogleDispo] = useState(false);
  const champMotDePasse = useRef(null);
  // Cette fenêtre veut son propre compte : la session ira dans la fenêtre,
  // pas dans le cookie commun. L'autre compte reste connecté ailleurs.
  const enFenetre = base44.auth.fenetre.active();

  useEffect(() => {
    let vivant = true;
    base44
      .request("GET", "/api/health")
      .then((r) => vivant && setGoogleDispo(!!r?.google))
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    if (etape === ETAPES.MOT_DE_PASSE || etape === ETAPES.CREATION) setTimeout(() => champMotDePasse.current?.focus(), 50);
  }, [etape]);

  const reinitialiser = () => {
    setEtape(ETAPES.EMAIL);
    setCompte(null);
    setMotDePasse("");
    setConfirmation("");
    setErreur(null);
  };

  const verifierEmail = async (e) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/verifier-email", { body: { email } });
      if (!r.connu) {
        setEtape(ETAPES.INCONNU);
      } else {
        setCompte(r);
        setEtape(r.mot_de_passe_defini ? ETAPES.MOT_DE_PASSE : ETAPES.CREATION);
      }
    } catch (err) {
      setErreur(err?.message || "Vérification impossible.");
    } finally {
      setEnCours(false);
    }
  };

  const seConnecter = async (e) => {
    e?.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/connexion", { body: { email, mot_de_passe: motDePasse, fenetre: enFenetre } });
      if (r?.jeton_session) base44.auth.fenetre.poserJeton(r.jeton_session);
      // Rechargement complet : l'app rejoue son amorçage avec la session posée.
      window.location.href = "/TableauDeBord";
    } catch (err) {
      setErreur(err?.message || "Connexion impossible.");
      setMotDePasse("");
      setEnCours(false);
    }
  };

  const definirMotDePasse = async (e) => {
    e?.preventDefault();
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const r = await base44.request("POST", "/api/auth/definir-mot-de-passe", {
        body: { email, mot_de_passe: motDePasse, fenetre: enFenetre, ...(invitation?.jeton ? { jeton: invitation.jeton } : {}) },
      });
      if (r?.jeton_session) base44.auth.fenetre.poserJeton(r.jeton_session);
      window.location.href = "/TableauDeBord";
    } catch (err) {
      setErreur(err?.message || "Enregistrement impossible.");
      setEnCours(false);
    }
  };

  return (
    <div className="text-encre">
        {/* Étape 1 — adresse */}
        {etape === ETAPES.EMAIL && (
          <>
            <Bascule />
            <EnTete
              titre="Se connecter avec son email"
              sousTitre={enFenetre ? "Cette fenêtre est indépendante : votre autre compte reste connecté dans les autres." : "Saisissez l'adresse de votre invitation."}
            />
            <div className="flex flex-col gap-4 p-6">
              <form onSubmit={verifierEmail} className="m-0 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="connexion-email" className="text-[14px] font-medium leading-none">Email</label>
                  <ChampIcone icone={Mail} erreur={!!erreur}>
                    <input id="connexion-email" type="email" autoFocus autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErreur(null); }} placeholder="vous@exemple.fr" className={CHAMP} />
                  </ChampIcone>
                  {erreur && <Erreur texte={erreur} />}
                </div>
                <button type="submit" disabled={!email.trim() || enCours} className={`${BOUTON} border border-trait bg-fond text-encre hover:bg-encre/[0.06]`}>
                  {enCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Continuer
                </button>
              </form>
              {/* Google sous le bouton principal, s'il est configuré. */}
              {googleDispo && (
                <>
                  <Separateur />
                  <BoutonGoogle />
                </>
              )}
            </div>
          </>
        )}

        {/* Étape 2a — mot de passe existant */}
        {etape === ETAPES.MOT_DE_PASSE && (
          <>
            <EnTete
              retour={reinitialiser}
              titre="Saisissez votre mot de passe"
              badge={compte?.role === "admin" ? "Administrateur" : null}
              sousTitre={
                <span className="flex items-center gap-2">
                  <span className="text-encre [overflow-wrap:anywhere]">{email}</span>
                  <button type="button" onClick={reinitialiser} className="border-0 bg-transparent p-0 text-[14px] text-ardoise underline hover:text-encre" style={{ background: "transparent" }}>Modifier</button>
                </span>
              }
            />
            <form onSubmit={seConnecter} className="m-0 flex flex-col gap-4 p-6">
              <ChampMotDePasse id="connexion-mdp" libelle="Mot de passe" valeur={motDePasse} onChange={(v) => { setMotDePasse(v); setErreur(null); }} champRef={champMotDePasse} erreur={!!erreur} autoComplete="current-password" />
              {erreur && <Erreur texte={erreur} />}
              <button type="submit" disabled={!motDePasse || enCours} className={`${BOUTON} border-0 bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
                {enCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Se connecter
              </button>
              {googleDispo && (
                <>
                  <Separateur />
                  <BoutonGoogle />
                </>
              )}
            </form>
          </>
        )}

        {/* Étape 2b — première connexion d'un compte invité */}
        {etape === ETAPES.CREATION && (
          <>
            <EnTete
              retour={invitation ? null : reinitialiser}
              titre={compte?.prenom ? `Bienvenue ${compte.prenom}` : "Première connexion"}
              sousTitre={`${email} : choisissez votre mot de passe, il vous servira pour les prochaines fois.`}
              badge={compte?.role === "admin" ? "Administrateur" : null}
            />
            <form onSubmit={definirMotDePasse} className="m-0 flex flex-col gap-4 p-6">
              <ChampMotDePasse id="connexion-nouveau" libelle="Mot de passe (8 caractères minimum)" valeur={motDePasse} onChange={setMotDePasse} champRef={champMotDePasse} autoComplete="new-password" />
              <ChampMotDePasse id="connexion-confirmation" libelle="Confirmation" valeur={confirmation} onChange={setConfirmation} autoComplete="new-password" />
              {erreur && <Erreur texte={erreur} />}
              <button type="submit" disabled={!motDePasse || !confirmation || enCours} className={`${BOUTON} border-0 bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
                {enCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Enregistrer et entrer
              </button>
            </form>
          </>
        )}

        {/* Adresse non reconnue */}
        {etape === ETAPES.INCONNU && (
          <>
            <EnTete retour={reinitialiser} titre="Adresse non reconnue" sousTitre={email} />
            <div className="flex flex-col gap-4 p-6">
              <p className="m-0 text-[14px] leading-[1.6] text-ardoise">
                Cette adresse n'a pas d'accès Klocka. Les comptes se créent sur invitation : vérifiez la saisie, ou
                rapprochez-vous de votre conseiller, il vous enverra votre lien.
              </p>
              <a href={CREER_COMPTE} target="_blank" rel="noopener noreferrer" className={`${BOUTON} border border-menthe text-menthe hover:bg-menthe/[0.12]`}>
                <UserPlus className="h-4 w-4" />
                Créer votre compte
              </a>
              <button type="button" onClick={reinitialiser} className={`${BOUTON} border-0 text-ardoise hover:bg-encre/[0.06] hover:text-encre`} style={{ background: "transparent" }}>
                Essayer une autre adresse
              </button>
            </div>
          </>
        )}
    </div>
  );
}

/**
 * La carte de connexion (maquette « Connexion ») : un motif de grille estompé
 * sous le contenu, à 10 px du bord. Le voile reprend la couleur de la carte.
 */
export function CarteConnexion({ children }) {
  return (
    <div className="relative isolate w-full max-w-[448px] rounded-[20px] border border-trait bg-surface-pleine shadow-[0_20px_25px_-5px_rgba(0,0,0,0.3),0_8px_10px_-6px_rgba(0,0,0,0.3)]">
      <div
        aria-hidden="true"
        className="bg-grid-pattern pointer-events-none absolute inset-[10px] -z-10 rounded-[12px] bg-[length:30px_30px] bg-repeat"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10px] -z-10 rounded-[12px]"
        style={{ backgroundImage: "linear-gradient(to top right, rgb(var(--k-surface-pleine-rgb) / .9), rgb(var(--k-surface-pleine-rgb) / .4), rgb(var(--k-surface-pleine-rgb) / .1))" }}
      />
      {children}
    </div>
  );
}

// Enveloppe en surimpression, conservée pour un usage ponctuel.
export default function ConnexionDialog({ ouvert, onClose }) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[448px] border-0 bg-transparent p-0 shadow-none">
        <CarteConnexion><ConnexionPanel /></CarteConnexion>
      </DialogContent>
    </Dialog>
  );
}

// Redirection pleine page : c'est une connexion, il n'y a pas de saisie à
// préserver, et la session doit être posée avant que l'app ne s'amorce.
function BoutonGoogle() {
  return (
    <a
      href={`/api/auth/google/login?returnTo=%2FTableauDeBord${base44.auth.fenetre.active() ? "&fenetre=1" : ""}`}
      className={`${BOUTON} border border-trait bg-fond text-encre hover:bg-encre/[0.06]`}
    >
      <LogoGoogle />
      Continuer avec Google
    </a>
  );
}

/** En haut de la carte : la connexion, et la demande de compte à côté. */
function Bascule() {
  return (
    <div className="px-6 pt-6">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-trait bg-fond p-1">
        <span className="flex h-9 items-center justify-center rounded-full bg-encre/90 text-[14px] text-fond">Connexion</span>
        <a href={CREER_COMPTE} target="_blank" rel="noopener noreferrer"
          className="flex h-9 items-center justify-center rounded-full text-[14px] text-craie transition-colors hover:text-encre">
          Créer un compte
        </a>
      </div>
    </div>
  );
}

function Separateur() {
  return (
    <div className="relative flex justify-center">
      <span className="absolute inset-x-0 top-1/2 border-t border-trait" />
      <span className="relative bg-surface-pleine px-2.5 text-[12px] text-ardoise">ou</span>
    </div>
  );
}

function EnTete({ titre, sousTitre = null, badge = null, retour = null }) {
  return (
    <div className="flex flex-col gap-1.5 px-6 pt-6">
      {retour && (
        <button
          type="button"
          onClick={retour}
          className="-ml-1 mb-2 flex h-7 items-center gap-1.5 self-start rounded-full border-0 pl-1 pr-2 text-[13px] text-ardoise hover:bg-encre/[0.06] hover:text-encre"
          style={{ background: "transparent" }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />Retour
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 text-[24px] font-medium leading-[1.2] tracking-[-0.01em] text-encre">{titre}</h1>
        {badge && <span className="rounded-full border border-menthe/40 px-2 py-px text-[11px] text-menthe">{badge}</span>}
      </div>
      {sousTitre && <div className="m-0 text-[14px] leading-[1.5] text-ardoise">{sousTitre}</div>}
    </div>
  );
}

function Erreur({ texte }) {
  return <span className="text-[13px] text-alerte">{texte}</span>;
}

/** Un champ avec son icône à gauche ; le bord passe au rouge sur une erreur. */
function ChampIcone({ icone: Icone, erreur = false, children }) {
  return (
    <div className={`relative rounded-[14px] border ${erreur ? "border-alerte" : "border-transparent"}`}>
      <Icone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ardoise" />
      {children}
    </div>
  );
}

// Un mot de passe qu'on ne voit pas se tape deux fois de travers : l'œil le
// montre le temps de le relire.
function ChampMotDePasse({ id, valeur, onChange, libelle, champRef = undefined, erreur = false, autoComplete = undefined }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-medium leading-none">{libelle}</label>
      <ChampIcone icone={KeyRound} erreur={erreur}>
        <input
          id={id}
          ref={champRef}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className={`${CHAMP} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          title={visible ? "Masquer" : "Afficher"}
          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border-0 p-0 text-ardoise hover:bg-encre/[0.06]"
          style={{ background: "transparent" }}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </ChampIcone>
    </div>
  );
}
