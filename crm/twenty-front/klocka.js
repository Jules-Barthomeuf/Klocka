// Klocka dans Twenty (28 oct. 2026, Jules) : trois ajouts à l'écran, sans toucher au code de Twenty.
//   1. Les vues en onglets à droite du choix de vue (« All Clients | Clients signés | Clients en cours… »).
//   2. Un bandeau juste au-dessus des lignes cochées : nombre de fiches, Déplacer, Dupliquer, Supprimer, croix.
//   3. Un clic sur une adresse mail ouvre la fenêtre d’envoi, avec les modèles de Twenty CRM (29 oct.).
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

  let objets = null;
  let vues = null;
  let luLe = 0;
  // Vues et objets : par /metadata en GraphQL, le chemin de l'écran de Twenty lui-même (session par cookie).
  const LECTURE = '{ getViews { id name key type objectMetadataId position viewFilters { fieldMetadataId operand value } } objects(paging:{first:1000}) { edges { node { id namePlural nameSingular labelPlural fields(paging:{first:1000}) { edges { node { id name type isSystem isActive options } } } } } } }';
  async function charger() {
    if (objets && Date.now() - luLe < 60_000) return;
    const r = await fetch('/metadata', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: LECTURE }),
    });
    if (!r.ok) throw new Error(`Twenty ${r.status}`);
    const { data, errors } = await r.json();
    if (errors?.length || !data) throw new Error(errors?.[0]?.message || 'lecture des vues impossible');
    objets = data.objects.edges.map(({ node }) => ({ ...node, fields: node.fields.edges.map((e) => e.node) }));
    vues = data.getViews;
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

  // --- 1. Les vues épinglées, en onglets à droite du choix de vue ---
  // « Épingler » s'ajoute sous Éditer dans le menu « … » de chaque vue (liste du choix de vue). Les épingles sont
  // celles de la personne, gardées dans son navigateur (comme les favoris de Twenty, propres à chacun).
  // Repères stables de Twenty 2.51 : le bouton du choix de vue porte aria-controls="view-picker-<tableau>-options",
  // le menu « … » d'une vue a pour id "view-picker-options-<id de la vue>".
  const ONGLETS = 'klocka-onglets';
  const CLE_EPINGLES = 'klocka-vues-epinglees';

  function epingles() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE_EPINGLES) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  function basculerEpingle(idVue) {
    const l = epingles();
    const suite = l.includes(idVue) ? l.filter((x) => x !== idVue) : [...l, idVue];
    try {
      localStorage.setItem(CLE_EPINGLES, JSON.stringify(suite));
    } catch {
      annoncer('Épingle impossible : stockage du navigateur bloqué', true);
    }
    return suite.includes(idVue);
  }

  const boutonChoixDeVue = () => document.querySelector('[aria-controls^="view-picker-"]:not([aria-controls^="view-picker-options-"])');

  function poserOnglets() {
    const objet = objetCourant();
    const deja = document.getElementById(ONGLETS);
    const declencheur = objet ? boutonChoixDeVue() : null;
    const siennes = new Map((vues || []).filter((v) => objet && v.objectMetadataId === objet.id).map((v) => [v.id, v]));
    const lesVues = epingles().map((id) => siennes.get(id)).filter(Boolean);
    if (!declencheur || !lesVues.length) {
      deja?.remove();
      return objet && lesVues.length && !declencheur ? 'bouton du choix de vue introuvable' : null;
    }
    const index = [...siennes.values()].find((v) => v.key === 'INDEX');
    const idVue = new URLSearchParams(location.search).get('viewId') || index?.id;
    const signature = `${objet.id}|${idVue}|${lesVues.map((v) => v.id).join(',')}`;
    if (deja && deja.dataset.signature === signature && deja.previousElementSibling === declencheur) return null;
    deja?.remove();
    const { texte } = couleurs();
    const barre = document.createElement('div');
    barre.id = ONGLETS;
    barre.dataset.signature = signature;
    barre.style.cssText = 'display:flex;align-items:center;gap:2px;margin-left:4px;overflow-x:auto;scrollbar-width:none;min-width:0;align-self:stretch';
    for (const v of lesVues) {
      const actif = v.id === idVue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.name;
      b.title = v.name;
      b.style.cssText = `font:inherit;white-space:nowrap;height:100%;padding:0 10px;border:none;background:none;cursor:pointer;color:${texte};opacity:${actif ? 1 : 0.6};border-bottom:2px solid ${actif ? texte : 'transparent'};`;
      b.addEventListener('mouseenter', () => { if (!actif) b.style.opacity = '0.9'; });
      b.addEventListener('mouseleave', () => { if (!actif) b.style.opacity = '0.6'; });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!actif) aller(`/objects/${objet.namePlural}?viewId=${v.id}`);
      });
      barre.appendChild(b);
    }
    declencheur.after(barre);
    return null;
  }

  // « Épingler » / « Désépingler » sous Éditer, dans le menu « … » d'une vue de la liste du choix de vue.
  // Ce menu est un menu Base UI (id généré) : on part du bouton « … » ouvert (aria-expanded="true", dans
  // .hoverable-buttons), la ligne qui le porte donne le nom de la vue, aria-controls donne le menu.
  const PUNAISE = '<path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4"/><path d="M9 15l-4.5 4.5"/><path d="M14.5 4l5.5 5.5"/>';
  function vueDuNom(nom) {
    const objet = objetCourant();
    if (!objet || !vues) return null;
    const memes = vues.filter((v) => v.objectMetadataId === objet.id && v.name === nom);
    return memes.find((v) => v.key === 'INDEX') || memes[0] || null;
  }
  function poserEpingles() {
    for (const declencheur of document.querySelectorAll('.hoverable-buttons [aria-expanded="true"]')) {
      const ligneVue = declencheur.closest('.hoverable-buttons').parentElement;
      const vue = vueDuNom(ligneVue.textContent.trim());
      const id = declencheur.getAttribute('aria-controls');
      const menu = (id && document.getElementById(id)) || [...document.querySelectorAll('[role="menu"]')].pop();
      if (!vue || !menu || menu.querySelector('.klocka-epingle')) continue;
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const editer = items.find((l) => /^(Éditer|Editer|Modifier|Edit)$/i.test(l.textContent.trim()));
      const modele = editer || items[0];
      if (!modele) continue;
      const copie = modele.cloneNode(true);
      copie.classList.add('klocka-epingle');
      copie.removeAttribute('id');
      copie.removeAttribute('data-highlighted');
      const svg = copie.querySelector('svg');
      if (svg) {
        svg.innerHTML = PUNAISE;
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
      }
      // Le libellé : le dernier nœud de texte non vide de la ligne copiée.
      const marcheur = document.createTreeWalker(copie, NodeFilter.SHOW_TEXT);
      let libelle = null;
      while (marcheur.nextNode()) if (marcheur.currentNode.textContent.trim()) libelle = marcheur.currentNode;
      const txt = epingles().includes(vue.id) ? 'Désépingler' : 'Épingler';
      if (libelle) libelle.textContent = txt;
      else copie.append(txt);
      copie.addEventListener('mouseenter', () => { copie.style.background = 'rgba(127,127,127,.1)'; });
      copie.addEventListener('mouseleave', () => { copie.style.background = ''; });
      const agir = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const epinglee = basculerEpingle(vue.id);
        annoncer(`${vue.name} ${epinglee ? 'épinglée à droite du choix de vue' : 'désépinglée'}`);
        document.getElementById(ONGLETS)?.remove();
        declencheur.click();
        passe();
      };
      copie.addEventListener('pointerdown', (e) => e.stopPropagation());
      copie.addEventListener('click', agir);
      (editer || items[items.length - 1]).after(copie);
    }
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

  // Déplacer : d'abord vers un groupe du même tableau (Clients en cours, signés…, le champ « Groupe »), la fiche
  // change de vue et reste dans All Clients ; puis vers un autre tableau (« Déplacer vers », fait par Klocka).
  function ouvrirMenuDeplacer(bouton, objet, lignes) {
    fermerMenu();
    const groupe = (objet.fields || []).find((c) => c.name === 'groupe' && c.type === 'SELECT');
    const groupes = groupe?.options || [];
    const tableaux = (objet.fields || []).find((c) => c.name === 'deplacerVers')?.options || [];
    if (!groupes.length && !tableaux.length) return annoncer('Ce tableau ne se déplace pas', true);
    const { fond, texte } = couleurs();
    const m = document.createElement('div');
    m.id = 'klocka-menu';
    m.dataset.clickOutsideId = HORS_TABLEAU;
    const r = bouton.getBoundingClientRect();
    m.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${r.left}px;z-index:2147483647;max-height:60vh;overflow:auto;min-width:240px;padding:4px;border-radius:8px;background:${fond};color:${texte};box-shadow:0 8px 24px rgba(0,0,0,.18);border:1px solid rgba(127,127,127,.25);font-size:13px`;
    const titre = (t) => {
      const h = document.createElement('div');
      h.textContent = t;
      h.style.cssText = 'padding:8px 10px 4px;font-size:11px;opacity:.55';
      m.appendChild(h);
    };
    const ligne = (libelle, faire, succes) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = libelle;
      b.style.cssText = `display:block;width:100%;text-align:left;padding:7px 10px;border:none;border-radius:4px;background:none;color:${texte};font:inherit;cursor:pointer`;
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(127,127,127,.12)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
      b.addEventListener('click', async () => {
        fermerMenu();
        const ids = [...lignes.keys()];
        try {
          await faire(ids);
          decocher(lignes);
          annoncer(`${ids.length} fiche${ids.length > 1 ? 's' : ''} ${succes}`);
        } catch (e) {
          annoncer(`Déplacement impossible : ${e.message}`, true);
        }
      });
      m.appendChild(b);
    };
    const ordre = (l) => [...l].sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
    if (groupes.length) {
      titre(`Dans ${objet.labelPlural || 'ce tableau'}`);
      for (const o of ordre(groupes)) {
        ligne(o.label, (ids) => parQuatre(ids, (id) => api('PATCH', `/${objet.namePlural}/${id}`, { [groupe.name]: o.value })), `passée${lignes.size > 1 ? 's' : ''} dans ${o.label}`);
      }
    }
    if (tableaux.length) {
      if (groupes.length) titre('Vers un autre tableau');
      for (const o of ordre(tableaux)) ligne(o.label, (ids) => deplacer(objet, ids, o.value), `envoyée${lignes.size > 1 ? 's' : ''} vers ${o.label}`);
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
          if (!window.confirm(`Supprimer ${ids.length} fiche${ids.length > 1 ? 's' : ''} de toutes les vues ? ${ids.length > 1 ? 'Elles restent récupérables' : 'Elle reste récupérable'} dans les fiches supprimées.`)) return;
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

  // Ce que la dernière passe a vu de travers (lu par les messages d'erreur).
  const etat = { erreur: '', manque: '' };

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
      // Le menu « … » ne dépend pas de la lecture des vues : posé d'abord.
      try {
        poserEpingles();
      } catch (e) {
        etat.erreur = `épingle : ${e.message}`;
      }
      try {
        await charger();
        poserEpingles(); // à nouveau : à la première passe, les vues n'étaient pas encore lues
        const manque = poserOnglets();
        etat.manque = manque || '';
        // Après 5 s sans onglets alors que le tableau a plusieurs vues : le dire une fois, avec la raison.
        if (manque && performance.now() > 5000 && !window.__klockaErreur) {
          window.__klockaErreur = manque;
          annoncer(`Klocka : onglets non posés (${manque})`, true);
        }
        poserBandeau();
      } catch (e) {
        console.warn('[klocka]', e.message);
        etat.erreur = e.message;
        // Une fois par chargement : visible, pour que l'erreur remonte au lieu de rien afficher.
        if (!window.__klockaErreur) {
          window.__klockaErreur = e.message;
          annoncer(`Klocka : onglets indisponibles (${e.message})`, true);
        }
      }
    });
  }

  // --- 3. Un clic sur une adresse mail : la fenêtre d'envoi ---
  // Comme celle de Monday (Jules, 29 oct.) : une carte en bas à droite, De / À / Objet en lignes, le texte, puis une
  // barre d'outils (brouillon jeté, variables {}, Modèles de messages) et Envoyer.
  // Le mail ne part pas d'ici : la page crée un « Mail envoyé » (envoisMail) au nom de la personne connectée, Klocka
  // l'envoie depuis sa boîte Gmail (server/crm/mails.js) et marque Envoyé ou Erreur, que la fenêtre attend.
  // Les modèles sont ceux de l'objet « Modèles » (modelesMail) ; {prénom} et {nom} prennent le nom de la fiche.
  const ENVOI = 'klocka-envoi';
  const VARIABLES = [['{prénom}', 'Prénom'], ['{nom}', 'Nom complet']];
  const ICONES = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6l9-6"/>',
    agrandir: '<path d="M16 4h4v4"/><path d="M14 10l6-6"/><path d="M8 20H4v-4"/><path d="M4 20l6-6"/>',
    reduire: '<path d="M14 10h6"/><path d="M14 10V4"/><path d="M20 4l-6 6"/><path d="M10 14H4"/><path d="M10 14v6"/><path d="M4 20l6-6"/>',
    fermer: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    corbeille: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    variables: '<path d="M7 4a2 2 0 0 0-2 2v3a2 3 0 0 1-2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2"/><path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0-2 3v3a2 2 0 0 1-2 2"/>',
    modeles: '<path d="M8 4h8l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M15 4v4h4"/><path d="M10 12h6"/><path d="M10 16h4"/>',
  };
  let modeles = null;
  let moi = null;

  function icone(nom, taille = 18) {
    return `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[nom]}</svg>`;
  }
  function boutonIcone(nom, titre, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = titre;
    b.setAttribute('aria-label', titre);
    b.innerHTML = icone(nom);
    b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:6px;background:none;color:inherit;cursor:pointer;opacity:.8';
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(127,127,127,.14)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
    b.addEventListener('click', (e) => { e.stopPropagation(); action(b); });
    return b;
  }

  function ficheDuClic(cible) {
    const page = location.pathname.match(/^\/object\/([^/]+)\/([0-9a-f-]{36})/);
    if (page) {
      const o = (objets || []).find((x) => x.nameSingular === page[1]);
      return o ? { objet: o, id: page[2] } : null;
    }
    const o = objetCourant();
    const id = cible.closest('[data-selectable-id]')?.getAttribute('data-selectable-id');
    return o && id ? { objet: o, id } : null;
  }

  const remplir = (texte, nom) => {
    const prenom = String(nom || '').trim().split(/\s+/)[0] || '';
    return String(texte || '').replace(/\{pr[ée]nom\}/gi, prenom).replace(/\{nom\}|\{fiche\}/gi, String(nom || '').trim());
  };

  // Qui écrit : la personne connectée (sa boîte Gmail rattachée à Klocka enverra).
  async function lireMoi() {
    if (moi) return moi;
    try {
      const r = await fetch('/metadata', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ currentUser { email firstName lastName workspaceMember { avatarUrl name { firstName lastName } } } }' }) });
      const u = (await r.json())?.data?.currentUser;
      if (u) moi = { email: u.email, nom: [u.workspaceMember?.name?.firstName || u.firstName, u.workspaceMember?.name?.lastName || u.lastName].filter(Boolean).join(' '), photo: u.workspaceMember?.avatarUrl || '' };
    } catch {
      /* la ligne De reste générique */
    }
    return moi;
  }

  // Une petite liste flottante au-dessus d'un bouton (variables, modèles).
  function liste(ancre, panneau, elements, choisir, { recherche = false, vide = 'Rien ici' } = {}) {
    panneau.querySelector('.klocka-liste')?.remove();
    const { fond, texte } = couleurs();
    const l = document.createElement('div');
    l.className = 'klocka-liste';
    const r = ancre.getBoundingClientRect();
    const p = panneau.getBoundingClientRect();
    l.style.cssText = `position:absolute;left:${Math.max(8, r.left - p.left)}px;bottom:${p.bottom - r.top + 6}px;width:300px;max-height:320px;display:flex;flex-direction:column;padding:4px;border-radius:8px;background:${fond};color:${texte};box-shadow:0 8px 24px rgba(0,0,0,.18);border:1px solid rgba(127,127,127,.25);z-index:1`;
    const corps = document.createElement('div');
    corps.style.cssText = 'overflow:auto;display:flex;flex-direction:column';
    let champ = null;
    const dessiner = () => {
      corps.replaceChildren();
      const q = (champ?.value || '').toLowerCase();
      const vus = elements.filter((x) => !q || `${x.titre} ${x.sous || ''}`.toLowerCase().includes(q));
      if (!vus.length) {
        const v = document.createElement('div');
        v.textContent = vide;
        v.style.cssText = 'padding:10px;font-size:12px;opacity:.6';
        corps.appendChild(v);
      }
      for (const x of vus) {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = `display:flex;flex-direction:column;gap:2px;text-align:left;padding:8px 10px;border:none;border-radius:4px;background:none;color:${texte};font:inherit;font-size:13px;cursor:pointer`;
        const t = document.createElement('span');
        t.textContent = x.titre;
        b.appendChild(t);
        if (x.sous) {
          const s = document.createElement('span');
          s.textContent = x.sous;
          s.style.cssText = 'font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
          b.appendChild(s);
        }
        b.addEventListener('mouseenter', () => { b.style.background = 'rgba(127,127,127,.12)'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
        b.addEventListener('click', (e) => { e.stopPropagation(); l.remove(); choisir(x); });
        corps.appendChild(b);
      }
    };
    if (recherche) {
      champ = document.createElement('input');
      champ.placeholder = 'Rechercher un modèle';
      champ.style.cssText = 'margin:4px 4px 6px;padding:7px 9px;border:1px solid rgba(127,127,127,.3);border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:13px';
      champ.addEventListener('input', dessiner);
      l.appendChild(champ);
    }
    l.appendChild(corps);
    dessiner();
    panneau.appendChild(l);
    champ?.focus();
    return l;
  }

  async function ouvrirEnvoi(adresse, cible) {
    document.getElementById(ENVOI)?.remove();
    try {
      await charger();
    } catch {
      /* la fiche reste vide : l'envoi marche sans elle */
    }
    const fiche = ficheDuClic(cible);
    const { fond, texte } = couleurs();
    const trait = 'border-bottom:1px solid rgba(127,127,127,.2)';
    const nu = 'flex:1;min-width:0;border:none;outline:none;background:transparent;color:inherit;font:inherit;font-size:14px;padding:0';
    const p = document.createElement('div');
    p.id = ENVOI;
    p.dataset.clickOutsideId = HORS_TABLEAU;
    let grand = false;
    const placer = () => {
      p.style.cssText = `position:fixed;z-index:2147483647;display:flex;flex-direction:column;border-radius:10px;overflow:visible;background:${fond};color:${texte};box-shadow:0 12px 40px rgba(0,0,0,.25);border:1px solid rgba(127,127,127,.25);font-size:14px;`
        + (grand ? 'top:5vh;left:50%;transform:translateX(-50%);width:min(960px,calc(100vw - 32px));height:90vh' : 'right:16px;bottom:16px;width:min(720px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px))');
    };
    placer();
    // Les raccourcis de Twenty ne doivent pas lire ce qu'on tape ici.
    for (const t of ['keydown', 'keyup', 'keypress']) p.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') p.remove(); });
    p.addEventListener('click', (e) => { if (!e.target.closest('.klocka-liste')) p.querySelector('.klocka-liste')?.remove(); });

    // En-tête : « E-mail », agrandir, fermer.
    const tete = document.createElement('div');
    tete.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:10px 10px 0 0;background:rgba(127,127,127,.07);${trait}`;
    const pastille = document.createElement('span');
    pastille.innerHTML = icone('mail', 16);
    pastille.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:#5b8def;color:#fff';
    const titre = document.createElement('strong');
    titre.textContent = 'E-mail';
    titre.style.cssText = 'flex:1;font-size:14px';
    const agrandir = boutonIcone('agrandir', 'Agrandir', () => { grand = !grand; placer(); agrandir.innerHTML = icone(grand ? 'reduire' : 'agrandir'); });
    tete.append(pastille, titre, agrandir, boutonIcone('fermer', 'Fermer', () => p.remove()));

    // Les lignes De, À, Objet.
    const ligne = (libelle, contenu, apres = null) => {
      const l = document.createElement('div');
      l.style.cssText = `display:flex;align-items:center;gap:12px;margin:0 12px;padding:12px 4px;${trait}`;
      if (libelle) {
        const s = document.createElement('span');
        s.textContent = libelle;
        s.style.cssText = 'opacity:.6;min-width:20px';
        l.appendChild(s);
      }
      l.appendChild(contenu);
      if (apres) l.appendChild(apres);
      return l;
    };
    const de = document.createElement('span');
    de.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
    de.textContent = 'Votre boîte Gmail connectée à Klocka';
    lireMoi().then((m) => {
      if (!m) return;
      de.replaceChildren();
      const ph = document.createElement(m.photo ? 'img' : 'span');
      ph.style.cssText = 'width:22px;height:22px;border-radius:50%;flex:none;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;font-size:11px;background:rgba(127,127,127,.2)';
      if (m.photo) ph.src = m.photo;
      else ph.textContent = (m.nom || m.email)[0].toUpperCase();
      const n = document.createElement('span');
      n.textContent = m.nom || m.email;
      const e = document.createElement('span');
      e.textContent = `(${m.email})`;
      e.style.opacity = '.6';
      de.append(ph, n, e);
    });
    const a = document.createElement('input');
    a.value = adresse;
    a.style.cssText = nu;
    const objet = document.createElement('input');
    objet.placeholder = 'Objet';
    objet.style.cssText = nu;
    const corps = document.createElement('textarea');
    corps.style.cssText = `${nu};flex:1;resize:none;line-height:1.5;padding:14px 16px`;
    corps.placeholder = 'Votre message';
    let dernierChamp = corps;
    for (const c of [objet, corps]) c.addEventListener('focus', () => { dernierChamp = c; });
    const inserer = (v) => {
      const c = dernierChamp;
      const [d, f] = [c.selectionStart ?? c.value.length, c.selectionEnd ?? c.value.length];
      c.value = c.value.slice(0, d) + v + c.value.slice(f);
      c.focus();
      c.setSelectionRange(d + v.length, d + v.length);
      majEnvoyer();
    };
    const variablesObjet = boutonIcone('variables', 'Variables', (b) => liste(b, p, VARIABLES.map(([v, t]) => ({ titre: t, sous: v, v })), (x) => { dernierChamp = objet; inserer(x.v); }));

    // La barre d'outils.
    const pied = document.createElement('div');
    pied.style.cssText = 'display:flex;align-items:center;gap:4px;padding:10px 12px;border-top:1px solid rgba(127,127,127,.2)';
    const separe = () => {
      const s = document.createElement('span');
      s.style.cssText = 'width:1px;height:22px;margin:0 6px;background:rgba(127,127,127,.3)';
      return s;
    };
    let modeleChoisi = null;
    let nom = '';
    const jeter = boutonIcone('corbeille', 'Supprimer le brouillon', () => {
      if ((objet.value || corps.value) && !window.confirm('Supprimer ce brouillon ?')) return;
      p.remove();
    });
    const variables = boutonIcone('variables', 'Variables', (b) => liste(b, p, VARIABLES.map(([v, t]) => ({ titre: t, sous: v, v })), (x) => inserer(x.v)));
    const boutonModeles = boutonIcone('modeles', 'Modèles de messages', async (b) => {
      try {
        modeles ||= (await api('GET', '/modelesMail?limit=200&order_by=name[AscNullsLast]'))?.data?.modelesMail || [];
      } catch {
        modeles = [];
      }
      liste(b, p, modeles.map((m) => ({ titre: m.name || m.objet || 'Sans nom', sous: m.objet, m })), ({ m }) => {
        if ((objet.value || corps.value) && !window.confirm('Remplacer l’objet et le texte par ce modèle ?')) return;
        modeleChoisi = m;
        objet.value = remplir(m.objet, nom);
        corps.value = remplir(m.corps, nom);
        majEnvoyer();
      }, { recherche: true, vide: 'Aucun modèle : ajoutez-en dans Modèles' });
    });
    const etatEnvoi = document.createElement('span');
    etatEnvoi.style.cssText = 'flex:1;text-align:right;font-size:12px;opacity:.7;padding:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const envoyer = document.createElement('button');
    envoyer.type = 'button';
    envoyer.textContent = 'Envoyer';
    const majEnvoyer = () => {
      const pret = !!(a.value.trim() && objet.value.trim()) && !parti;
      envoyer.disabled = !pret;
      envoyer.style.cssText = `font:inherit;font-size:14px;padding:7px 16px;border:none;border-radius:6px;cursor:${pret ? 'pointer' : 'default'};background:${pret ? '#0073ea' : 'rgba(127,127,127,.15)'};color:${pret ? '#fff' : 'rgba(127,127,127,.8)'}`;
    };
    for (const c of [a, objet, corps]) c.addEventListener('input', majEnvoyer);
    envoyer.addEventListener('click', (e) => { e.stopPropagation(); partir(); });
    pied.append(jeter, separe(), variables, boutonModeles, etatEnvoi, envoyer);

    p.append(tete, ligne('De', de), ligne('À', a), ligne('', objet, variablesObjet), corps, pied);
    document.body.appendChild(p);
    let parti = false;
    majEnvoyer();
    (adresse ? objet : a).focus();

    if (fiche) {
      api('GET', `/${fiche.objet.namePlural}/${fiche.id}?depth=0`).then((r) => {
        const f = r?.data?.[fiche.objet.nameSingular] || Object.values(r?.data || {})[0] || {};
        nom = typeof f.name === 'string' ? f.name : [f.name?.firstName, f.name?.lastName].filter(Boolean).join(' ');
        if (nom) titre.textContent = `E-mail à ${nom}`;
      }).catch(() => {});
    }

    async function partir() {
      if (parti || envoyer.disabled) return;
      parti = true;
      majEnvoyer();
      etatEnvoi.textContent = 'Envoi…';
      try {
        const r = await api('POST', '/envoisMail', {
          name: objet.value.trim().slice(0, 200),
          a: a.value.trim(),
          objet: objet.value.trim(),
          corps: corps.value,
          modele: modeleChoisi?.name || null,
          statut: 'A_ENVOYER',
          ficheObjet: fiche?.objet.nameSingular || null,
          ficheId: fiche?.id || null,
        });
        const id = r?.data?.createEnvoiMail?.id || Object.values(r?.data || {})[0]?.id;
        for (let i = 0; i < 40 && id; i++) {
          await new Promise((ok) => setTimeout(ok, 1500));
          const e = (await api('GET', `/envoisMail/${id}?depth=0`))?.data?.envoiMail;
          if (e?.statut === 'ENVOYE') {
            p.remove();
            return annoncer(`Mail envoyé depuis ${e.expediteur || 'votre boîte'}`);
          }
          if (e?.statut === 'ERREUR') throw new Error(e.erreur || 'envoi refusé');
        }
        throw new Error('pas de réponse de Klocka, voir Mails envoyés');
      } catch (e) {
        parti = false;
        majEnvoyer();
        etatEnvoi.textContent = `Non envoyé : ${e.message}`;
        etatEnvoi.title = e.message;
      }
    }
  }

  // Avant Twenty (phase de capture sur window) : son propre clic ouvrirait la messagerie de l'ordinateur.
  function surClicAdresse(e) {
    const lien = e.target.closest?.('a[href^="mailto:"]');
    if (!lien || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const adresse = decodeURIComponent(lien.getAttribute('href').slice(7).split('?')[0]);
    ouvrirEnvoi(adresse, lien);
  }

  // Le script est dans <head> : on démarre une fois la page lue.
  function demarrer() {
    window.addEventListener('click', surClicAdresse, true);
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
