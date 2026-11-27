import type { Dict } from "./en";

const fr: Dict = {
  meta: {
    tagline: "Des comptes de njangi clairs. Sans palabre.",
    description: "NkapBook tient des registres clairs et partagés pour votre njangi : cotisations, tours, amendes, prêts et réunions.",
  },
  lang: { en: "English", fr: "Français", pcm: "Pidgin", label: "Langue" },
  common: {
    continue: "Continuer",
    back: "Retour",
    save: "Enregistrer",
    cancel: "Annuler",
    loading: "Chargement…",
    signOut: "Se déconnecter",
    offline: "Vous êtes hors ligne. Nous enregistrons sur ce téléphone et synchroniserons plus tard.",
    online: "De nouveau en ligne",
    tryAgain: "Réessayer",
  },
  home: {
    headline: "Les comptes de votre njangi, clairs pour tout le monde.",
    lead: "Enregistrez cotisations, tours, amendes et prêts pendant la réunion, même avec un réseau faible. Chaque membre voit son propre compte sur un lien privé.",
    neverHold: "NkapBook garde seulement les registres. L’argent va toujours au trésorier, en espèces, MoMo ou banque.",
    cta: "Connexion des responsables",
    forMembers: "Les membres n’ont pas besoin de compte. Votre secrétaire vous enverra votre lien privé sur WhatsApp.",
  },
  login: {
    title: "Connexion",
    phoneLabel: "Votre numéro de téléphone",
    phoneHint: "Numéro camerounais, ex. 6 70 12 34 56",
    sendCode: "Recevoir un code",
    codeTitle: "Entrez le code",
    codeSent: "Nous avons envoyé un code à 6 chiffres par SMS au {phone}.",
    codeLabel: "Code à 6 chiffres",
    verify: "Se connecter",
    changeNumber: "Utiliser un autre numéro",
    resend: "Renvoyer le code",
    errors: {
      phone: "Ce numéro ne ressemble pas à un numéro camerounais. Vérifiez et réessayez.",
      code: "Ce code est incorrect ou a expiré. Réessayez.",
      tooMany: "Trop d’essais. Patientez quelques minutes puis réessayez.",
      generic: "Une erreur s’est produite. Veuillez réessayer.",
    },
  },
  app: {
    myGroups: "Mes groupes",
    noGroups: "Vous n’êtes encore responsable d’aucun groupe.",
    noGroupsHint: "Créez votre njangi, ou demandez à votre président d’inviter votre numéro.",
    createGroup: "Créer un groupe",
    signedInAs: "Connecté avec le {phone}",
  },
  offlinePage: {
    title: "Pas de réseau",
    body: "Cette page n’est pas encore enregistrée sur votre téléphone. Elle se chargera quand le réseau reviendra.",
  },
};
export default fr;
