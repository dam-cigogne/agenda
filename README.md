# AgenDam

**Pourquoi AgenDam ?** Gratuite, sans publicité, sans compte, aucune donnée collectée (aucun serveur). Un mois lisible d'un coup d'œil (titres entiers, emoji, jour J), des rotations de travail sur mesure, import Outlook / Excel / CSV, envoi vers le calendrier Outlook et la catégorie de son choix, impression A4 d'une page.

AgenDam : agenda et emploi du temps simple et lisible, installable sur iPhone et Android (PWA).
Jour, semaine, mois en gros caractères. Gratuit, sans publicité, **aucune donnée collectée** : tout reste sur l'appareil.

- Appli : https://dam-cigogne.github.io/agenda/
- Démo (données d'exemple) : https://dam-cigogne.github.io/agenda/?demo=1
- Fiche de présentation et installation : https://dam-cigogne.github.io/agenda/presentation.html

## Fonctions

- Vues Jour, Semaine, 2 semaines, Mois (mois avec titres, bandeaux multi-jours, numéros de semaine) ; écran de démarrage au choix ; colonnes et panneau latéral sur tablette / ordinateur
- Événements : emoji au choix, titre, début / fin, lieu, note, catégorie colorée (modifiable), journée entière, plusieurs jours
- Répétitions : jours, semaines (jours au choix), mois, années, rotation simple travail / repos
- Rotations de travail sur mesure (étapes, jours, heures, emoji, poste de nuit, modèles) dans Réglages (roue crantée ⚙ en haut à droite)
- Impression d'une page A4 par vue (Jour, Semaine, 2 semaines, Mois)
- Envoi vers le calendrier du téléphone : choix précis des événements (période, catégorie, cases), choix du calendrier par le téléphone, « Mettre à jour » après modification (réglable)
- Rappels « à venir aujourd'hui » à l'ouverture, notifications selon la plateforme
- Sauvegarde / restauration `agenda-sauvegarde.json` (nom fixe), import / export `.ics`, bouton « Ajouter à mon agenda » (Apple, Outlook, Google : envoi unique, pas de synchronisation)
- Apparence à ta couleur : couleur de l’appli, fond teinté, couleur des week-ends, jours fériés en rouge, dates plus lisibles
- Aide à l’adresse facultative (France, service public, désactivée par défaut) : adresses complètes proposées, ton texte gardé si elle est introuvable
- Modèles d’événements (on ne change que la date) et garde alternée (un week-end ou une semaine sur 2, début et fin au choix)
- Mode plein écran (œil), jour J mis en valeur, vue 2 semaines lisible (mots coupés avec tiret)
- Sélecteur d'emojis intégré (catégories, recherche en français, récents) + emoji par défaut par catégorie
- Import d'autres calendriers : depuis Outlook (lecture de ses autres calendriers, sens Outlook → appli) et depuis un fichier Excel / CSV / ODS (SheetJS, Apache-2.0, `lib/xlsx.core.min.js`, chargé uniquement à l'import) avec reconnaissance automatique des colonnes
- Connexion facultative à Outlook / Microsoft : envoi vers le calendrier Outlook choisi pour chaque événement (ou « Agenda (appli) »), catégorie Outlook au choix, anti-doublons (marque propriétaire sur chaque événement), nettoyage des doublons ; directement vers le compte de l'utilisateur, aucun serveur intermédiaire
- Mode sombre, recherche, mode démo, aide « ? » intégrée avec historique des versions

## Limites à connaître

- **Pas de synchronisation automatique** entre appareils : sauvegarder (.json) puis restaurer sur l'autre.
- Appli fermée, les rappels ne sont pas garantis (surtout sur iPhone). Pour des alarmes fiables : export `.ics` vers l'agenda natif.
- Sur iPhone, Safari peut effacer les données d'un site non installé après environ 7 jours sans visite : installer l'appli sur l'écran d'accueil et sauvegarder.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | L'appli entière (HTML + CSS + JavaScript pur) |
| `manifest.json` | Manifeste PWA |
| `sw.js` | Service worker (hors connexion), cache `agd-cache-v<version>` |
| `icons/` | Icônes (192, 512, maskable, apple-touch, svg) |
| `presentation.html` | Fiche publique, tutoriel d'installation, confidentialité |
| `apercu.png` | Carte d'aperçu pour le partage du lien (1200 × 630) |
| `screenshots/` | Captures avec données d'exemple uniquement |

## Nouvelle version

1. Changer `APP_VERSION` dans `index.html` **et** `VERSION` dans `sw.js` (même numéro).
2. Ajouter une entrée au `CHANGELOG` dans `index.html` (visible dans l'aide « ? »).
3. Publier, puis vérifier en ligne le nom du cache dans `sw.js` et l'ouverture de la page.

Toutes les clés de stockage et noms de cache commencent par `agd-` (les autres applis du même domaine utilisent d'autres préfixes).

## Préparer le Play Store (plus tard)

Le manifeste (id, icônes 192 / 512 / maskable, captures, raccourcis) et le service worker sont prêts pour une application Android par TWA (PWABuilder ou Bubblewrap). À prévoir à ce moment-là : le fichier `.well-known/assetlinks.json` doit être servi à la **racine du domaine** (pour `github.io`, cela demande un dépôt `dam-cigogne.github.io` ou un domaine personnalisé), une politique de confidentialité (voir `presentation.html#confidentialite`) et un compte développeur Google Play.

- Fiche à partager : affiches (`affiches/`) + carte d’aperçu, guide et installation dans Réglages
- Lieu d’un rendez-vous : itinéraire en un geste (Plans, Google Maps, Waze)
- Fenêtre « Nouveautés » après chaque mise à jour, historique complet et outils développeur dans Réglages
- Affichage adapté au téléphone, à la tablette, à l’ordinateur et au grand écran ; impression en PDF sur iPhone/iPad (bibliothèque html2canvas, licence MIT, incluse dans `lib/`)
- Affiches à partager avec QR code
