// Entrée envoie le message à l'ordinateur ; au téléphone, elle va à la ligne et seul le bouton envoie
// (8 nov. 2026, Jules : « quand on écrit sur mobile le retour à la ligne envoie le message »).
// Un clavier tactile n'a pas de Maj + Entrée : on lit le pointeur, pas la largeur de l'écran.
export function entreeEnvoie(e) {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return false;
  try { if (window.matchMedia("(pointer: coarse)").matches) return false; } catch { /* sans matchMedia */ }
  return true;
}
