// Klocka dans Twenty (28 oct. 2026, Jules) : deux ajouts à l'écran des tableaux, sans toucher au code de Twenty.
//   1. Les vues en onglets à droite du choix de vue (« All Clients | Clients signés | Clients en cours… »).
//   2. Un bandeau juste au-dessus des lignes cochées : nombre de fiches, Déplacer, Dupliquer, Supprimer, croix.
// Chargé par la page d'accueil de Twenty (index.html de ce dossier, servi par le site statique et désigné par
// FRONTEND_INDEX_URL). Les appels passent par l'API de Twenty avec le cookie de la personne connectée : mêmes droits
// qu'elle. Déplacer remplit « Déplacer vers » (Klocka déplace par webhook, server/crm/deplacer.js).
// Repères de Twenty 2.51 : lignes [data-selectable-id], case cochée [role=checkbox][aria-checked=true], adresse
// /objects/<pluriel>?viewId=<id>. À revérifier à chaque mise à jour de Twenty.
(() => {
  if (window.__klocka) return;
  window.__klocka = true;

  // Un clic hors du tableau y décoche tout, sauf sur un élément marqué comme les boutons d'action de Twenty.
  const HORS_TABLEAU = 'page-action-container';
  const SYSTEME = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector', 'deplacerVers', 'mondayId', 'mondayCreeLe']);
  const LIENS = new Set(['RELATION', 'MORPH_RELATION', 'TS_VECTOR', 'ACTOR', 'POSITION']);

  // --- L'API de Twenty, au nom de la personne connectée ---
  async function api(methode, chemin, corps) {
    const r = await fetch(`/rest${chemin}`, {
      method: methode,
      credentials: 'include',
      headers: corps ? { 'Content-Type': 'application/json' } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    });
    if (!r.ok) throw new Error(`Twenty ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  const liste = (r, cle) => (Array.isArray(r?.data) ? r.data : r?.data?.[cle] || []);

  let objets = null;
  let vues = null;
  let luLe = 0;
  async function charger() {
    if (objets && Date.now() - luLe < 60_000) return;
    const o = await api('GET', '/metadata/objects?limit=1000');
    const v = [];
    let apres = null;
    for (let i = 0; i < 20; i++) {
      const r = await api('GET', `/metadata/views?limit=200${apres ? `&starting_after=${apres}` : ''}`);
      v.push(...liste(r, 'views'));
      if (!r?.pageInfo?.hasNextPage) break;
      apres = r.pageInfo.endCursor;
    }
    objets = liste(o, 'objects');
    vues = v;
    luLe = Date.now();
  }

  const pluriel = () => (location.pathname.match(/^\/objects\/([^/?#]+)/) || [])[1] || null;
  const objetCourant = () => (objets || []).find((o) => o.namePlural === pluriel()) || null;

  function aller(url) {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // --- Couleurs : celles de la page, clair ou sombre ---
  function couleurs() {
    const fond = getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
    const texte = getComputedStyle(document.body).color || 'rgb(51,51,51)';
    return { fond, texte };
  }

  // --- 1. Les vues en onglets ---
  const ONGLETS = 'klocka-onglets';

  function vuesDe(objet) {
    return (vues || [])
      .filter((v) => v.objectMetadataId === objet.id && (v.type === 'TABLE' || v.type === 'KANBAN') && v.isActive !== false)
      // L'import du 27 oct. a laissé une seconde vue « All … » sans colonnes : on ne garde que la principale.
      .filter((v) => v.key === 'INDEX' || !/^All /.test(v.name))
      .sort((a, b) => (a.key === 'INDEX' ? -1 : b.key === 'INDEX' ? 1 : Number(a.position || 0) - Number(b.position || 0)));
  }

  // Le bouton du choix de vue : l'élément de la barre du haut dont le texte est le nom d'une vue de l'objet.
  function choixDeVue(noms) {
    const candidats = document.querySelectorAll('span, div');
    for (const el of candidats) {
      if (el.childElementCount || !noms.has(el.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (r.top > 0 && r.top < 140 && r.width > 0 && !el.closest(`#${ONGLETS}, #klocka-bandeau`)) return el;
    }
    return null;
  }

  function poserOnglets() {
    const objet = objetCourant();
    const deja = document.getElementById(ONGLETS);
    if (!objet) {
      deja?.remove();
      return;
    }
    const lesVues = vuesDe(objet);
    if (lesVues.length < 2) {
      deja?.remove();
      return;
    }
    const nomDe = new Map(lesVues.map((v) => [v.name, v]));
    const ancre = choixDeVue(new Set(nomDe.keys()));
    if (!ancre) return;
    const idVue = new URLSearchParams(location.search).get('viewId') || nomDe.get(ancre.textContent.trim())?.id;
    // Le bloc du choix de vue : on remonte tant que le parent n'a que lui pour enfant.
    let bloc = ancre;
    while (bloc.parentElement && bloc.parentElement.childElementCount === 1 && bloc.parentElement !== document.body) bloc = bloc.parentElement;
    const signature = `${objet.id}|${idVue}|${lesVues.map((v) => v.id).join(',')}`;
    if (deja && deja.dataset.signature === signature && deja.previousElementSibling === bloc) return;
    deja?.remove();
    const { texte } = couleurs();
    const barre = document.createElement('div');
    barre.id = ONGLETS;
    barre.dataset.signature = signature;
    barre.style.cssText = 'display:flex;align-items:stretch;gap:2px;margin-left:8px;overflow-x:auto;scrollbar-width:none;min-width:0;align-self:stretch';
    for (const v of lesVues) {
      const actif = v.id === idVue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.name;
      b.title = v.name;
      b.style.cssText = `font:inherit;font-size:13px;white-space:nowrap;padding:0 10px;border:none;background:none;cursor:pointer;color:${texte};opacity:${actif ? 1 : 0.55};font-weight:${actif ? 600 : 400};border-bottom:2px solid ${actif ? texte : 'transparent'};`;
      b.addEventListener('mouseenter', () => { if (!actif) b.style.opacity = '0.85'; });
      b.addEventListener('mouseleave', () => { if (!actif) b.style.opacity = '0.55'; });
      b.addEventListener('click', () => aller(`/objects/${objet.namePlural}?viewId=${v.id}`));
      barre.appendChild(b);
    }
    bloc.after(barre);
  }

  // --- 2. Le bandeau au-dessus des lignes cochées ---
  const BANDEAU = 'klocka-bandeau';

  function lignesCochees() {
    const vus = new Map();
    for (const tr of document.querySelectorAll('[data-selectable-id]')) {
      const id = tr.getAttribute('data-selectable-id');
      if (vus.has(id)) continue;
      if (tr.querySelector('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked')) vus.set(id, tr);
    }
    return vus;
  }

  function decocher(lignes) {
    for (const tr of lignes.values()) tr.querySelector('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked')?.click();
  }

  function annoncer(message, erreur = false) {
    const t = document.createElement('div');
    t.textContent = message;
    t.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:8px;font-size:13px;color:#fff;background:${erreur ? '#c0392b' : '#333'};box-shadow:0 4px 16px rgba(0,0,0,.2)`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  async function parQuatre(ids, fn) {
    for (let k = 0; k < ids.length; k += 4) await Promise.all(ids.slice(k, k + 4).map(fn));
  }

  async function dupliquer(objet, ids) {
    const champs = (objet.fields || []).filter((f) => !f.isSystem && f.isActive !== false && !SYSTEME.has(f.name) && !LIENS.has(f.type));
    await parQuatre(ids, async (id) => {
      const r = await api('GET', `/${objet.namePlural}/${id}?depth=0`);
      const fiche = r?.data?.[objet.nameSingular] || Object.values(r?.data || {})[0] || {};
      const copie = {};
      for (const f of champs) if (fiche[f.name] != null && fiche[f.name] !== '') copie[f.name] = fiche[f.name];
      copie.name = `${fiche.name || 'Sans nom'} (copie)`;
      await api('POST', `/${objet.namePlural}`, copie);
    });
  }

  async function supprimer(objet, ids) {
    await parQuatre(ids, (id) => api('DELETE', `/${objet.namePlural}/${id}?soft_delete=true`));
  }

  async function deplacer(objet, ids, option) {
    await parQuatre(ids, (id) => api('PATCH', `/${objet.namePlural}/${id}`, { deplacerVers: option }));
  }

  let menuOuvert = null;
  function fermerMenu() {
    menuOuvert?.remove();
    menuOuvert = null;
  }

  function ouvrirMenuDeplacer(bouton, objet, lignes) {
    fermerMenu();
    const champ = (objet.fields || []).find((f) => f.name === 'deplacerVers');
    const options = champ?.options || [];
    if (!options.length) return annoncer('Ce tableau ne se déplace pas', true);
    const { fond, texte } = couleurs();
    const m = document.createElement('div');
    m.id = 'klocka-menu';
    m.dataset.clickOutsideId = HORS_TABLEAU;
    const r = bouton.getBoundingClientRect();
    m.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${r.left}px;z-index:2147483647;max-height:60vh;overflow:auto;min-width:220px;padding:4px;border-radius:8px;background:${fond};color:${texte};box-shadow:0 8px 24px rgba(0,0,0,.18);border:1px solid rgba(127,127,127,.25);font-size:13px`;
    for (const o of [...options].sort((a, b) => Number(a.position || 0) - Number(b.position || 0))) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.label;
      b.style.cssText = `display:block;width:100%;text-align:left;padding:7px 10px;border:none;border-radius:4px;background:none;color:${texte};font:inherit;cursor:pointer`;
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(127,127,127,.12)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
      b.addEventListener('click', async () => {
        fermerMenu();
        const ids = [...lignes.keys()];
        try {
          await deplacer(objet, ids, o.value);
          decocher(lignes);
          annoncer(`${ids.length} fiche${ids.length > 1 ? 's' : ''} envoyée${ids.length > 1 ? 's' : ''} vers ${o.label}`);
        } catch (e) {
          annoncer(`Déplacement impossible : ${e.message}`, true);
        }
      });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    menuOuvert = m;
  }

  function bouton(libelle, texte, action, danger = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = libelle;
    b.style.cssText = `font:inherit;font-size:13px;padding:6px 10px;border:none;border-radius:6px;background:none;cursor:pointer;color:${danger ? '#c0392b' : texte};white-space:nowrap`;
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(127,127,127,.12)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      action(b);
    });
    return b;
  }

  function poserBandeau() {
    const objet = objetCourant();
    const lignes = objet ? lignesCochees() : new Map();
    let bandeau = document.getElementById(BANDEAU);
    if (!lignes.size) {
      bandeau?.remove();
      fermerMenu();
      return;
    }
    const { fond, texte } = couleurs();
    if (!bandeau) {
      bandeau = document.createElement('div');
      bandeau.id = BANDEAU;
      bandeau.dataset.clickOutsideId = HORS_TABLEAU;
      document.body.appendChild(bandeau);
    }
    const signature = `${objet.id}|${[...lignes.keys()].join(',')}`;
    if (bandeau.dataset.signature !== signature) {
      bandeau.dataset.signature = signature;
      bandeau.replaceChildren();
      bandeau.style.cssText = `position:fixed;z-index:2147483646;display:flex;align-items:center;gap:2px;padding:4px 4px 4px 12px;border-radius:8px;background:${fond};color:${texte};box-shadow:0 6px 20px rgba(0,0,0,.16);border:1px solid rgba(127,127,127,.25);font-size:13px`;
      const n = lignes.size;
      const compte = document.createElement('span');
      compte.textContent = `${n} sélectionnée${n > 1 ? 's' : ''}`;
      compte.style.cssText = 'font-weight:600;margin-right:8px;white-space:nowrap';
      const separateur = document.createElement('span');
      separateur.style.cssText = 'width:1px;align-self:stretch;margin:4px 4px;background:rgba(127,127,127,.3)';
      bandeau.append(
        compte,
        bouton('Déplacer', texte, (b) => (menuOuvert ? fermerMenu() : ouvrirMenuDeplacer(b, objet, lignes))),
        bouton('Dupliquer', texte, async () => {
          const ids = [...lignes.keys()];
          try {
            await dupliquer(objet, ids);
            decocher(lignes);
            annoncer(`${ids.length} fiche${ids.length > 1 ? 's' : ''} dupliquée${ids.length > 1 ? 's' : ''}`);
          } catch (e) {
            annoncer(`Duplication impossible : ${e.message}`, true);
          }
        }),
        bouton('Supprimer', texte, async () => {
          const ids = [...lignes.keys()];
          if (!window.confirm(`Supprimer ${ids.length} fiche${ids.length > 1 ? 's' : ''} ? Elles restent récupérables dans les fiches supprimées.`)) return;
          try {
            await supprimer(objet, ids);
            decocher(lignes);
            annoncer(`${ids.length} fiche${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`);
          } catch (e) {
            annoncer(`Suppression impossible : ${e.message}`, true);
          }
        }, true),
        separateur,
        bouton('✕', texte, () => {
          fermerMenu();
          decocher(lignes);
        }),
      );
    }
    // Juste au-dessus de la première ligne cochée, sinon juste en dessous de la dernière si la place manque.
    const premiere = [...lignes.values()].map((tr) => tr.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const haut = premiere[0];
    const bas = premiere[premiere.length - 1];
    const h = bandeau.offsetHeight || 40;
    let top = haut.top - h - 6;
    if (top < 110) top = bas.bottom + 6;
    bandeau.style.top = `${Math.max(8, Math.min(top, window.innerHeight - h - 8))}px`;
    bandeau.style.left = `${Math.max(8, haut.left + 36)}px`;
  }

  // --- La boucle : à chaque changement de la page, sans plus d'une passe par image ---
  let prevu = false;
  function passe() {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(async () => {
      prevu = false;
      if (!pluriel()) {
        document.getElementById(ONGLETS)?.remove();
        document.getElementById(BANDEAU)?.remove();
        fermerMenu();
        return;
      }
      try {
        await charger();
        poserOnglets();
        poserBandeau();
      } catch (e) {
        console.warn('[klocka]', e.message);
      }
    });
  }

  // Le script est dans <head> : on démarre une fois la page lue.
  function demarrer() {
    new MutationObserver(passe).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked', 'data-selectable-id'] });
    window.addEventListener('scroll', passe, true);
    window.addEventListener('resize', passe);
    window.addEventListener('popstate', () => { luLe = 0; passe(); });
    document.addEventListener('click', (e) => { if (menuOuvert && !menuOuvert.contains(e.target) && !e.target.closest?.(`#${BANDEAU}`)) fermerMenu(); }, true);
    passe();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
