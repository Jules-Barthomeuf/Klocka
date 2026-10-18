import React from "react";
import FondHalo from "@/components/projet/FondHalo";

/**
 * La barrière d'erreur de l'application.
 *
 * Sans elle, une exception pendant le rendu démonte tout l'arbre React et
 * laisse une page noire, sans message : l'utilisateur voit son écran
 * disparaître et n'a aucune idée de ce qu'il faut faire. Une seule donnée
 * inattendue dans un projet suffisait.
 *
 * Ce que cette barrière garantit : le reste de l'application continue de
 * fonctionner, l'incident est visible dans la console pour le diagnostic, et
 * l'utilisateur a un chemin de sortie plutôt qu'un cul-de-sac.
 */
export default class BarriereErreur extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    // La console reste le premier endroit où on regarde. On garde la pile du
    // composant : elle dit quel écran a cédé, ce que le message seul ne dit pas.
    console.error("[écran en erreur]", erreur, info?.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;

    // L'écran prend le fond et les réglages du compte (18 oct. 2026, Jules) : le même Halo que les pages, les jetons de
    // l'interface, des pilules. Hors de Layout et du fournisseur de préférences, mais le thème, le fond et les boutons
    // sont posés sur <html> dès le chargement.
    return (
      <div className="relative min-h-screen bg-fond text-encre">
        <FondHalo />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-[520px] text-center">
            <img src="/avatars/ak.png" alt="" draggable={false} className="mx-auto mb-7 h-12 w-12 rounded-full object-cover" />
            <h1 className="m-0 text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-encre max-md:text-[24px]">
              Cet écran n’a pas pu s’afficher
            </h1>
            <p className="m-0 mt-4 text-[15px] leading-[1.6] text-ardoise">
              Le reste de l’application fonctionne. Revenez en arrière, ou rechargez cette page. Si cela se reproduit,
              signalez-le nous.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3 max-md:flex-wrap">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-12 rounded-full bg-encre px-7 text-[15px] text-fond transition-opacity hover:opacity-90"
              >
                Recharger
              </button>
              <button
                type="button"
                onClick={() => this.setState({ erreur: null })}
                className="h-12 rounded-full border border-trait px-7 text-[15px] text-craie transition-colors hover:border-bord-vif hover:text-encre"
                style={{ background: "transparent" }}
              >
                Réessayer
              </button>
            </div>
            {/* Le détail technique reste à portée de main sans encombrer l'écran :
                c'est ce qu'on demandera de copier en cas de signalement. */}
            <details className="mt-8 rounded-[16px] border border-trait bg-rail px-5 py-3 text-left">
              <summary className="cursor-pointer text-[13px] text-ardoise hover:text-encre">
                Détail technique
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-brume">
                {String(this.state.erreur?.stack || this.state.erreur)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
