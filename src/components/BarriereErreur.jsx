import React from "react";

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

    // Fond noir, un titre, une phrase, un bouton (12 nov. 2026, Jules : « un truc simple, sombre, sans l'icône, sans le
    // détail technique »). Le même noir quel que soit le thème du compte ; la pile reste dans la console.
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-white">
        <div className="w-full max-w-[440px] text-center">
          <h1 className="m-0 text-[24px] font-normal leading-[1.2] tracking-[-0.02em]">Cet écran n’a pas pu s’afficher</h1>
          <p className="m-0 mt-3 text-[15px] leading-[1.6] text-white/60">Rechargez la page pour reprendre.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 h-11 rounded-full bg-white px-7 text-[15px] text-black transition-opacity hover:opacity-90"
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
