# Ménage — PWA + Apps Script

Une application de tâches ménagères partagée à deux, gratuite, sans compte à créer.
Le téléphone affiche une page hébergée sur GitHub Pages ; les données vivent dans un
Google Sheet piloté par Apps Script, qui envoie aussi les mails.

## 1. Le backend (10 minutes)

1. Allez sur https://script.google.com et créez un nouveau projet.
2. Remplacez le contenu de `Code.gs` par le fichier `Code.gs` de ce dossier.
3. Lancez la fonction `setup()` une fois. Autorisez l'accès quand Google le demande.
   L'écran d'avertissement « Cette application n'est pas validée » est normal :
   passez par « Paramètres avancés » puis « Accéder au projet ».
   `setup()` crée le Sheet, les trois onglets, cinq tâches d'exemple et les
   déclencheurs des mails.
4. Déployer → Nouveau déploiement → Type : application web.
   - Exécuter en tant que : **moi**
   - Qui a accès : **tout le monde**
   
   Copiez l'URL en `/exec`.

Le « tout le monde » ne donne accès qu'à cette page, pas à votre Drive. C'est ce qui
permet à votre femme d'utiliser l'app sans compte ni partage du Sheet.

## 2. Le frontend

Poussez `index.html`, `manifest.json`, `sw.js`, `icon-192.png` et `icon-512.png`
à la racine d'un dépôt GitHub, puis activez Pages dans Settings → Pages
(source : branche `main`, dossier `/`).

Ouvrez l'URL obtenue sur le téléphone, allez dans Réglages, collez l'URL `/exec`,
enregistrez. Puis menu du navigateur → « Ajouter à l'écran d'accueil ».

## 3. Le Sheet

Trois onglets, que vous pouvez éditer à la main si besoin.

**Taches** — `id`, `nom`, `zone`, `qui`, `duree`, `mode`, `regle`, `actif`

| mode | regle | signification |
|---|---|---|
| `jours` | `lun,jeu` | ces jours de la semaine |
| `mois` | `1` | ce jour du mois (ramené au dernier jour si le mois est plus court) |
| `intervalle` | `14` | 14 jours après la dernière fois cochée |

`qui` vide = tâche libre : celui qui coche est crédité.

**Journal** — une ligne par tâche cochée. Décocher supprime la ligne.

**Config** — `personnes`, `destinataires`, `mail_quotidien`, `mail_hebdo`,
`mail_mensuel`, `vacances`, `heure_envoi`. Les quatre booléens se pilotent
depuis l'app.

## Limites connues

- Les écritures ont besoin du réseau. Hors ligne, l'app affiche les dernières
  données connues et prévient qu'un cochage n'a pas été enregistré.
- Pas de notification push en v1.
- Après un `Déployer`, choisissez toujours « Gérer les déploiements » puis
  modifiez le déploiement existant. Un nouveau déploiement change l'URL et casse
  le raccourci sur l'écran d'accueil.
- Si le navigateur bloque les appels pour cause de CORS, vérifiez que l'accès
  est bien réglé sur « tout le monde » : c'est la cause dans la quasi-totalité
  des cas.
- Après modification de `heure_envoi`, relancez `installerDeclencheurs()`.
