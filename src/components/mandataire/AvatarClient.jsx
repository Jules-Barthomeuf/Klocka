import React from "react";

// Une icône par client, toujours la même : tirée de son identifiant, parmi les 24 de public/avatars. Un visage dessiné,
// jamais le vrai client. Partagé par la page Clients et « Pour mes clients » (24 oct. 2026, Jules : les mêmes têtes).
const NB_AVATARS = 24;

export const avatarDe = (d) => {
  let h = 0;
  for (const c of String(d.id || d.reference || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/avatars/client-${String((h % NB_AVATARS) + 1).padStart(2, "0")}.png`;
};

export const Avatar = ({ d, taille = "h-[38px] w-[38px]", className = "" }) => (
  <img src={avatarDe(d)} alt="" aria-hidden="true" className={`block flex-none rounded-full ${taille} ${className}`} />
);
