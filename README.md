# AgenDam

**L’organisateur de la famille, comme un carnet.** Agenda, tâches, courses, repas, anniversaires et voyages, partagés en direct avec sa famille, ses amis ou ses collègues. Gratuit, sans publicité, sans compte. Installable sur iPhone, Android, tablette et ordinateur (PWA).

- Appli : https://dam-cigogne.github.io/agenda/
- Démo (données fictives dans tous les onglets) : https://dam-cigogne.github.io/agenda/?demo=1
- Fiche de présentation et installation : https://dam-cigogne.github.io/agenda/presentation.html

## Ce qu’il y a dedans (v2.12)

- Apparence « carnet » : un intercalaire de couleur par onglet. Onglets en bas (ou sur le côté sur tablette / ordinateur) : 📅 Agenda · ☑ Tâches · 🛒 Courses · 🍽 Repas · 🎂 Anniversaires · 🧳 Voyages (onglets visibles au choix)
- Listes de Tâches et de Courses en intercalaires sur le côté ou en boutons en haut (réglage)
- Tâches : listes, une ou plusieurs personnes par tâche (la première qui la fait la coche), tâches qui reviennent avec historique, « fait par … le … » et notes, onglet 📜 Suivi (filtre liste / personne, export CSV), archivage et suppression définitive
- Courses : plusieurs listes, « À acheter » rangé par rayon, « Ma liste type » A → Z / par rayon / les plus achetés avec index latéral, paquets, « refaire mes dernières courses » ; deux colonnes sur grand écran
- Repas : menu de la semaine, recettes, ingrédients vers les courses, import d’une recette avec son lien (le Worker lit les données schema.org Recipe), mode cuisine plein écran avec réglages Thermomix surlignés
- Anniversaires : rappels, idées cadeaux protégées, import Word / Excel / .ics / .vcf, sélection pour envoyer ou partager, cartes (8 décors, titre au choix, photo en rond / cœur / carré / polaroïd / plein écran, effets)
- Voyages : listes à cocher, programme, repas du séjour, infos pratiques
- Groupes connectés (Famille, Amis… en parallèle) : invitation par code de 8 caractères (la clé du groupe est déposée 7 jours chiffrée par une clé dérivée du code, PBKDF2) ; chaque appareil a sa paire de clés ECDH P-256, ce qu’on partage avec une personne est chiffré avec la clé de la paire (AES-GCM) ; partage choisi personne par personne (listes de courses, tâches aucune / les siennes / toutes, repas, anniversaires tous / certains, voyages) ; origine de chaque élément suivie (rien n’est retransmis d’un groupe à l’autre) ; retirer / supprimer une personne ; plusieurs appareils d’une même personne
- Serveur : Cloudflare Worker + KV (`worker/worker.js`) — boîte aux lettres chiffrée, codes d’invitation, lecture des recettes ; il ne peut pas lire les listes
- Partage par lien sans groupe (SMS, WhatsApp, mail) : données dans le fragment `#p=`, fusion par identifiant sans doublon
- Mode démo complet (données fictives, rien n’est enregistré)
- Synchronisation Outlook en pause (code conservé, `OL_ON`)

## Fonctions

- Vues Jour, Semaine, 2 semaines, Mois (mois avec titres, bandeaux multi-jours, numéros de semaine) ; écran de démarrage au choix ; colonnes et panneau latéral sur tablette / ordinateur
- Événements : emoji au choix, titre, début / fin, lieu, note, catégorie colorée (modifiable), journée entière, plusieurs jours
- Répétitions : jours, semaines (jours au choix), mois, années, rotation simple travail / repos
- Rotations de travail sur mesure (étapes, jours, heures, emoji, poste de nuit, modèles) dans Réglages (roue crantée ⚙ en haut à droite)
- Anniversaires à part (Réglages) : liste dédiée (nom, jour, mois, année facultative, note), 🎂 sur le jour, rappel à l’ouverture (J, veille, 3 jours, 1 semaine), conversion des événements « anniversaire » existants, import `.vcf` des contacts (BDAY), idées cadeaux en liste à cocher, protection des idées cadeaux par personne (case « Protéger »), par code ou Face ID / empreinte (WebAuthn local) (code : hash SHA-256 salé, simple verrou d’affichage, pas un chiffrement), PDF A4 par mois écrit directement en texte (plusieurs pages), export `.ics` annuel avec alarmes (veille 18 h, jour 9 h) pour iPhone, Android et ordinateur ; stockage local dans les réglages (clé `agd-settings`, champ `bd`)
- Vue Jour : trois affichages (Heures, Jour entier, Liste), déplacement d’un bloc par appui long, avertissement en cas de chevauchement
- Impression d'une page A4 par vue (Jour, Semaine, 2 semaines, Mois)
- Envoi vers le calendrier du téléphone : choix précis des événements (période, catégorie, cases), choix du calendrier par le téléphone, « Mettre à jour » après modification (réglable)
- Rappels « à venir aujourd'hui » à l'ouverture, notifications selon la plateforme
- Sauvegarde / restauration `agenda-sauvegarde.json` (nom fixe), import / export `.ics`, bouton « Ajouter à mon agenda » (Apple, Outlook, Google : envoi unique, pas de synchronisation)
- Apparence à ta couleur : couleur de l’appli, fond teinté, couleur des week-ends, jours fériés en rouge, dates plus lisibles
- Vacances scolaires (zones A, B, C) : liseré coloré (couleur au choix) sur les jours de vacances ; calendrier officiel facultatif (data.education.gouv.fr, seule la zone est envoyée, cache `agd-vac`) et/ou périodes saisies à la main
- Mois : mots longs coupés par syllabes, taille du texte des événements au choix (Petit, Normal, Grand)
- Réglages simples : sauvegarde en haut (partage direct vers « Fichiers » sur iPhone/Android), boutons compacts, options rares dans « Options complémentaires » (repliable)
- Écran large : panneau latéral (mini-calendrier et journée) masquable pour agrandir le mois
- Couleurs Outlook : couleur de chaque calendrier lue depuis Outlook, couleurs de catégories modifiables
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
