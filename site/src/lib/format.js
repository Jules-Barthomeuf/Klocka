export const eur = (v) => `${Math.round(v).toLocaleString("fr-FR")} €`;

// Prendre un appel avec un fondateur : le même lien sur klocka.immo et sur le site K Partners.
export const INVEST_URL = "https://dpe3smipjxh.typeform.com/to/GD7sREFs";
export const LOGIN_URL = "https://app.klocka.immo/";

// Le site vit sous /klocka.immo/ (vite.config.js, base) : les images y sont aussi, sur les deux adresses.
export const IMG = import.meta.env.BASE_URL + "img/";
