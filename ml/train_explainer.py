# L'entraînement : XGBoost sur le dataset gelé, SHAP pour l'expliquer.
#
# Ce script ne touche à aucune source : il lit ml/data/dataset.csv, produit
# par server/alx/dataset-ml.js avec ses variables gelées un an avant chaque
# vente, et il en sort trois fichiers JSON que l'application affiche :
#
#   ml/sortie/metrics.json               la validation temporelle, sans fard
#   ml/sortie/model_global_weights.json  le poids global de chaque variable
#   ml/sortie/dvf_explanations.json      chaque vente passée, expliquée
#
# La validation est TEMPORELLE : les plis respectent l'ordre des dates, le
# modèle n'est jamais évalué sur un passé qu'il aurait appris dans le futur.
# Les métriques viennent de cette validation ; les explications SHAP viennent
# du modèle final réentraîné sur tout — c'est de l'explication d'historique,
# pas une promesse de performance, et le JSON le dit.
#
#   ml/.venv/bin/python ml/train_explainer.py

import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBClassifier

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
DATASET = os.path.join(ICI, "data", "dataset.csv")
META = os.path.join(ICI, "data", "dataset-meta.json")
SORTIE = os.path.join(ICI, "sortie")
POUR_APP = os.path.join(RACINE, "server", "alx", "data", "ml")

# Les libellés français des variables : l'écran les affiche tels quels.
LIBELLES = {
    "surface_bati": "Surface bâtie (m²)",
    "mois_depuis_mutation": "Mois depuis la dernière mutation",
    "deja_mute": "Déjà muté depuis 2021",
    "dernier_prix": "Prix de la dernière mutation",
    "achete_en_bloc": "Acheté en bloc",
    "est_personne_morale": "Propriétaire personne morale",
    "forme_sci": "Le propriétaire est une SCI",
    "taille_portefeuille": "Parcelles au portefeuille",
    "nb_locaux_proprio_parcelle": "Locaux du propriétaire sur la parcelle",
    "rez_de_chaussee_pm": "Rez-de-chaussée au fichier DGFiP",
    "detention_min_annees": "Années de détention (minimum observé)",
    "detention_censuree": "Détention plus vieille que les fichiers",
    "nb_ventes_autres_24m": "Ventes d'autres biens sur 24 mois",
    "a_vendu_ailleurs_24m": "A vendu ailleurs sur 24 mois",
    "vitrines_rue": "Vitrines de la rue (OSM)",
    "rang_rue_part": "Rang de la rue dans la ville",
    "procedures_rue_18m": "Procédures collectives dans la rue (18 mois)",
}

PARAMS = dict(
    n_estimators=400, max_depth=4, learning_rate=0.05,
    subsample=0.9, colsample_bytree=0.9, min_child_weight=20,
    objective="binary:logistic", eval_metric="aucpr",
    tree_method="hist", random_state=42, n_jobs=4,
)


def principal():
    meta = json.load(open(META))
    df = pd.read_csv(DATASET)
    features = meta["colonnes"]
    # L'ordre temporel décide des plis : on trie une fois, tout en dépend.
    df = df.sort_values("t_reference").reset_index(drop=True)
    X = df[features].astype(float)
    y = df["y"].astype(int)
    prevalence = float(y.mean())

    # --- La validation temporelle : cinq plis, le passé prédit l'avenir -----
    plis = []
    for i, (idx_train, idx_test) in enumerate(TimeSeriesSplit(n_splits=5).split(X)):
        Xa, ya = X.iloc[idx_train], y.iloc[idx_train]
        Xb, yb = X.iloc[idx_test], y.iloc[idx_test]
        if yb.nunique() < 2:
            continue
        m = XGBClassifier(**PARAMS)
        m.fit(Xa, ya, verbose=False)
        p = m.predict_proba(Xb)[:, 1]
        plis.append({
            "pli": i + 1,
            "train": int(len(ya)), "test": int(len(yb)),
            "periode_test": [str(df["t_reference"].iloc[idx_test[0]]), str(df["t_reference"].iloc[idx_test[-1]])],
            "roc_auc": round(float(roc_auc_score(yb, p)), 4),
            "pr_auc": round(float(average_precision_score(yb, p)), 4),
            "prevalence_test": round(float(yb.mean()), 4),
        })

    # --- Le repli final : les 20 % les plus récents, jamais vus -------------
    coupe = int(len(df) * 0.8)
    m_final_eval = XGBClassifier(**PARAMS)
    m_final_eval.fit(X.iloc[:coupe], y.iloc[:coupe], verbose=False)
    p_holdout = m_final_eval.predict_proba(X.iloc[coupe:])[:, 1]
    yb = y.iloc[coupe:]
    # Le lift en tête de liste : ce que donnerait « appeler les 10 % les plus
    # probables » — la seule lecture qui parle le langage de la prospection.
    ordre = np.argsort(-p_holdout)
    lifts = {}
    for part in (0.05, 0.10, 0.20):
        k = max(1, int(len(ordre) * part))
        taux = float(yb.iloc[ordre[:k]].mean())
        lifts[f"top_{int(part * 100)}"] = {
            "n": k, "taux_vente": round(taux, 4),
            "lift": round(taux / float(yb.mean()), 2) if yb.mean() else None,
        }
    holdout = {
        "n": int(len(yb)), "positifs": int(yb.sum()),
        "periode": [str(df["t_reference"].iloc[coupe]), str(df["t_reference"].iloc[-1])],
        "roc_auc": round(float(roc_auc_score(yb, p_holdout)), 4),
        "pr_auc": round(float(average_precision_score(yb, p_holdout)), 4),
        "prevalence": round(float(yb.mean()), 4),
        "lift_en_tete": lifts,
    }

    # --- Le modèle final et SHAP : l'historique, expliqué -------------------
    modele = XGBClassifier(**PARAMS)
    modele.fit(X, y, verbose=False)
    expliqueur = shap.TreeExplainer(modele)
    valeurs = expliqueur.shap_values(X)  # (n, features), en log-odds

    abs_moyen = np.abs(valeurs).mean(axis=0)
    total = float(abs_moyen.sum()) or 1.0
    # Le sens : la corrélation entre la valeur de la variable et sa poussée.
    poids = []
    for j, f in enumerate(features):
        colonne = X[f]
        masque = colonne.notna().values
        sens = 0.0
        if masque.sum() > 30 and colonne[masque].nunique() > 1:
            sens = float(np.corrcoef(colonne[masque], valeurs[masque, j])[0, 1])
        poids.append({
            "feature": f,
            "libelle": LIBELLES.get(f, f),
            "poids_pct": round(float(abs_moyen[j]) / total * 100, 2),
            "mean_abs_shap": round(float(abs_moyen[j]), 5),
            "sens": "hausse" if sens > 0.05 else "baisse" if sens < -0.05 else "mixte",
            "taux_renseigne": round(float(colonne.notna().mean()), 3),
        })
    poids.sort(key=lambda p: -p["poids_pct"])

    # Chaque vente passée, expliquée : la probabilité du modèle et la part de
    # chaque variable, en pourcents de la poussée totale de la ligne.
    proba = modele.predict_proba(X)[:, 1]
    ventes = []
    for i in df.index[df["y"] == 1]:
        ligne = valeurs[i]
        somme = float(np.abs(ligne).sum()) or 1.0
        contributions = sorted(
            ({
                "feature": f, "libelle": LIBELLES.get(f, f),
                "valeur": None if pd.isna(X.iloc[i][f]) else round(float(X.iloc[i][f]), 2),
                "shap": round(float(ligne[j]), 4),
                "part_pct": round(abs(float(ligne[j])) / somme * 100, 1),
            } for j, f in enumerate(features)),
            key=lambda c: -abs(c["shap"]),
        )
        ventes.append({
            "ville": df.iloc[i]["ville"], "rue": df.iloc[i]["rue"],
            "parcelle": df.iloc[i]["parcelle"], "date_vente": df.iloc[i]["date_vente"],
            "t_reference": df.iloc[i]["t_reference"],
            "proba": round(float(proba[i]), 4),
            "contributions": contributions,
        })
    ventes.sort(key=lambda v: str(v["date_vente"]), reverse=True)

    avertissement = (
        "Métriques issues de la validation temporelle ; explications SHAP du modèle final "
        "réentraîné sur tout l'historique. L'univers est DVF : des locaux ayant muté au moins "
        "une fois depuis 2021 — la prévalence du dataset n'est pas celle du marché."
    )
    metrics = {
        "le": datetime.now(timezone.utc).isoformat(),
        "dataset": {"lignes": int(len(df)), "positifs": int(y.sum()), "prevalence": round(prevalence, 4),
                    "villes": meta.get("villes", []), "fenetre_horizon_mois": meta.get("horizon_mois"),
                    "recul_jours": meta.get("recul_jours"), "seed": meta.get("seed")},
        "modele": {"type": "XGBClassifier", **{k: v for k, v in PARAMS.items() if k not in ("n_jobs",)}},
        "validation_temporelle": plis,
        "moyenne_plis": {
            "roc_auc": round(float(np.mean([p["roc_auc"] for p in plis])), 4) if plis else None,
            "pr_auc": round(float(np.mean([p["pr_auc"] for p in plis])), 4) if plis else None,
        },
        "holdout_final": holdout,
        "avertissement": avertissement,
    }

    os.makedirs(SORTIE, exist_ok=True)
    os.makedirs(POUR_APP, exist_ok=True)
    json.dump(metrics, open(os.path.join(SORTIE, "metrics.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(poids, open(os.path.join(SORTIE, "model_global_weights.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(ventes, open(os.path.join(SORTIE, "dvf_explanations.json"), "w"), ensure_ascii=False, indent=2)

    # La version pour l'application : les mêmes chiffres, les contributions
    # limitées aux huit qui comptent, et les quatre cents ventes les plus
    # récentes — ce fichier se committe, il doit rester léger. L'intégralité
    # vit dans ml/sortie/dvf_explanations.json, qui ne se committe pas.
    json.dump({
        "metrics": metrics,
        "poids": poids,
        "ventes_total": len(ventes),
        "ventes": [{**v, "contributions": v["contributions"][:8]} for v in ventes[:400]],
    }, open(os.path.join(POUR_APP, "resultats.json"), "w"), ensure_ascii=False)

    print(f"Dataset : {len(df)} lignes, {int(y.sum())} ventes ({prevalence:.0%}).")
    for p in plis:
        print(f"  pli {p['pli']} : ROC-AUC {p['roc_auc']:.3f} · PR-AUC {p['pr_auc']:.3f} (test {p['test']})")
    print(f"Repli final : ROC-AUC {holdout['roc_auc']:.3f} · PR-AUC {holdout['pr_auc']:.3f} "
          f"(prévalence {holdout['prevalence']:.0%})")
    for cle, l in holdout["lift_en_tete"].items():
        print(f"  {cle} : taux {l['taux_vente']:.0%} · lift ×{l['lift']}")
    print("Poids globaux :", ", ".join(f"{p['libelle']} {p['poids_pct']:.0f}%" for p in poids[:5]))
    print(f"Écrit : ml/sortie/*.json et server/alx/data/ml/resultats.json ({len(ventes)} ventes expliquées).")


if __name__ == "__main__":
    principal()
