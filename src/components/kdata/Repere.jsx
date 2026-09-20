import React from "react";

// « Est-ce beaucoup ? » est la question qu'un chiffre brut ne résout pas. On y
// répond par une comparaison explicite, jamais par un score : le lecteur voit
// à quoi on compare, et juge lui-même. Le même bloc sert à K-Transactions et à
// K-Vacance.

const CARTE = "rounded-[18px] border border-trait bg-surface";

export default function Repere({ titre, phrase, detail, reserve, className = "mb-3", children }) {
  return (
    <div className={`${CARTE} p-4 ${className}`}>
      <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">{titre}</p>
      <p className="m-0 mt-1 text-[14.5px] leading-[1.45] text-encre">{phrase}</p>
      {detail && <p className="m-0 mt-1.5 text-[11.5px] leading-[1.6] text-ardoise">{detail}</p>}
      {children}
      {reserve && <p className="m-0 mt-1 text-[11px] leading-[1.6] text-brume">{reserve}</p>}
    </div>
  );
}
