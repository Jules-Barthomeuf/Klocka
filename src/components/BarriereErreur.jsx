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

    return (
      <div className="min-h-screen bg-fond flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="w-10 h-0.5 bg-menthe mx-auto mb-8" />
          <h1 className="m-0 text-[24px] font-light tracking-[-.02em] text-encre">
            Cet écran n’a pas pu s’afficher
          </h1>
          <p className="m-0 mt-4 text-[14px] leading-[1.7] text-ardoise">
            Le reste de l’application fonctionne. Revenez en arrière, ou
            rechargez cette page — si cela se reproduit, signalez-le nous.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => this.setState({ erreur: null })}
              className="px-5 py-2.5 border border-menthe/50 text-[11px] tracking-[.16em] uppercase text-menthe hover:bg-menthe/[0.08] transition-colors"
            >
              Réessayer
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 border border-[#2a2d35] text-[11px] tracking-[.16em] uppercase text-ardoise hover:bg-white/[0.04] transition-colors"
            >
              Recharger
            </button>
          </div>
          {/* Le détail technique reste à portée de main sans encombrer l'écran :
              c'est ce qu'on demandera de copier en cas de signalement. */}
          <details className="mt-8 text-left">
            <summary className="cursor-pointer text-[11px] tracking-[.16em] uppercase text-[#5b616e] hover:text-ardoise">
              Détail technique
            </summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.6] text-[#5b616e]">
              {String(this.state.erreur?.stack || this.state.erreur)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
