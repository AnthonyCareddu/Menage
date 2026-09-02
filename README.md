# Ménage — PWA + Apps Script

Une application de tâches ménagères partagée à deux, gratuite, sans compte à créer.
Le téléphone affiche une page hébergée sur GitHub Pages ; les données vivent dans un
Google Sheet piloté par Apps Script, qui envoie aussi les mails et les notifications.

## 1. Le backend

### Première installation

1. Allez sur https://script.google.com et créez un nouveau projet.
2. Remplacez le contenu de `Code.gs` par le fichier `Code.gs` de ce dossier.
3. Lancez la fonction `setup()` une fois. Autorisez l'accès quand Google le demande.
   L'écran « Cette application n'est pas validée » est normal : passez par
   « Paramètres avancés » puis « Accéder au projet ».
   `setup()` crée le Sheet, les quatre onglets, cinq tâches d'exemple, une paire de
   clés VAPID (pour les notifications) et les déclencheurs.
4. Déployer → Nouveau déploiement → Type : application web.
   - Exécuter en tant que : **moi**
   - Qui a accès : **tout le monde**

   Copiez l'URL en `/exec`.

Le « tout le monde » ne donne accès qu'à cette page, pas à votre Drive.

### Mettre à jour une installation existante

Quand une nouvelle version de `Code.gs` est disponible :

1. Collez le nouveau `Code.gs` dans l'éditeur.
2. Lancez **`migrer()`** une fois — c'est sans danger, ça ne recrée pas la base.
   (Ajoute les nouveaux onglets/réglages, génère les clés VAPID, réinstalle les
   déclencheurs.)
3. (facultatif) Lancez **`testCryptoPush()`** : doit afficher `OK` dans les logs —
   c'est la vérification que la signature des notifications fonctionne.
4. Déployer → **Gérer les déploiements** → crayon ✏️ sur le déploiement existant →
   Version : « Nouvelle version » → Déployer. **L'URL ne change pas.**

## 2. Le frontend

Poussez tout le dossier (`index.html`, `manifest.json`, `sw.js`, `.nojekyll`,
les icônes) à la racine d'un dépôt GitHub, puis activez Pages dans
Settings → Pages (source : branche `main`, dossier `/`).

Sur le téléphone : ouvrez l'URL obtenue → **Réglages** (roue crantée) → collez
l'URL `/exec` → Enregistrer. Puis menu du navigateur → **Ajouter à l'écran d'accueil**.
Chacun choisit son prénom dans Réglages → « Je suis ».

Pour publier une modif : `git push`, GitHub Pages se met à jour tout seul en ~1 min.
L'app affiche un bandeau « Nouvelle version — appuyer pour recharger » quand c'est prêt.

## 3. Les notifications

Un rappel **le matin** (tâches du jour) et **le soir** (fait / reste), affiché par
l'app elle-même — aucune application tierce à installer.

À faire **une fois par téléphone** : Réglages → Notifications → **Activer les
notifications** → accepter la demande du navigateur. Un bouton « Envoyer un test »
permet de vérifier.

- Les heures d'envoi se règlent dans Réglages → Notifications.
- **iPhone** : la PWA doit d'abord être « ajoutée à l'écran d'accueil » et ouverte
  depuis son icône (iOS 16.4+). Dans un simple onglet Safari, ça ne marche pas.
- Le mode vacances suspend aussi les notifications.

Techniquement : Apps Script signe un jeton VAPID (ECDSA P-256, implémenté à la main
faute de primitive native) et envoie un push vide ; le service worker va chercher
le contenu via `?action=digest`.

## 4. Le Sheet

Quatre onglets, éditables à la main si besoin.

**Taches** — `id`, `nom`, `zone`, `qui`, `duree`, `mode`, `regle`, `actif`

| mode | regle | signification |
|---|---|---|
| `jours` | `lun,jeu` | ces jours de la semaine |
| `mois` | `1` | ce jour du mois (ramené au dernier jour si le mois est plus court) |
| `intervalle` | `14` | 14 jours après la dernière fois cochée |
| `date` | `2026-09-15` | une seule fois, à cette date (réapparaît si non faite) |

`qui` vide = tâche libre : celui qui coche est crédité.
`actif` à `FAUX` = tâche mise de côté (invisible dans les vues, modifiable dans
Réglages → Tâches).

**Journal** — une ligne par tâche cochée. Décocher supprime la ligne.

**Config** — `personnes`, `destinataires`, `mail_quotidien`, `mail_soir`,
`mail_hebdo`, `mail_mensuel`, `vacances`, `heure_matin`, `heure_soir`. Les booléens
et les heures se pilotent depuis l'app.

**Push** — un abonnement aux notifications par appareil. Géré automatiquement
(les endpoints morts sont purgés à l'envoi).

## 5. Les thèmes

Réglages → Thème : **Foyer**, **Sauge**, **Ardoise**, **Nuit**. Propre à chaque
appareil. Les trois premiers suivent le mode clair/sombre du téléphone ; Nuit est
toujours sombre.

## Limites connues

- Hors ligne, les cochages sont mis en file d'attente et synchronisés au retour du
  réseau (ou à la réouverture de l'app). Un bandeau indique le nombre en attente.
- Les tâches à intervalle sont projetées à titre indicatif dans le Planning : leur
  vraie date dépend du moment où elles sont cochées.
- Après un `Déployer`, choisissez toujours « Gérer les déploiements » puis modifiez
  le déploiement existant. Un nouveau déploiement change l'URL et casse le raccourci.
- Si le navigateur bloque les appels pour cause de CORS, vérifiez que l'accès est
  réglé sur « tout le monde ».
- Les notifications s'appuient sur le service worker : elles ne fonctionnent que
  sur la PWA installée (pas dans un onglet), et sur iPhone en iOS 16.4+.
