// Le lien d'une fiche du CRM (27 oct. 2026) : Twenty pour un id Twenty, Monday pour un ancien id Monday.
const CRM_URL = String(import.meta.env.VITE_CRM_URL || "").trim().replace(/\/+$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Les tableaux Monday ouverts depuis l'écran et leur objet Twenty (crm/schema.json).
const OBJETS = { 2110621762: "proprietes", 2110621760: "clients" };

export function lienCrm(tableau, id) {
  if (!id) return null;
  if (UUID.test(String(id)) && CRM_URL && OBJETS[tableau]) return `${CRM_URL}/object/${OBJETS[tableau]}/${id}`;
  // Un ancien id Monday : le serveur ouvre la fiche Twenty qui le porte, ou Monday tant que Klocka y lit encore.
  return `/api/crm/fiche/${tableau}/${id}`;
}
