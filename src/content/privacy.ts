// The privacy policy, in English and French. Pidgin readers see the English version.
// Keep this in line with what the app really does: if you add a service provider or collect
// something new, update it here and change UPDATED.
import { SUPPORT_EMAIL } from "@/lib/site";

export const UPDATED = "2026-11-28";

export type Section = { h: string; p?: string[]; ul?: string[] };
export type Policy = { title: string; updated: string; intro: string[]; sections: Section[] };

const en: Policy = {
  title: "Privacy policy",
  updated: "Last updated:",
  intro: [
    "NkapBook (“we”) is a record book for njangi and tontine groups. This page explains what information NkapBook keeps, why, who can see it, and what you can ask us to do with it.",
    "NkapBook only keeps records. We never hold, move or lend your group’s money.",
  ],
  sections: [
    {
      h: "What we keep",
      ul: [
        "Officials (president, secretary, treasurer): your phone number, used to sign in with a code sent by SMS.",
        "Members: the name your group enters, and only if the group adds them, a phone number and whether the member agreed to WhatsApp reminders. Members don’t need an account.",
        "Group records: contributions, turn order and payouts, attendance, fines, loans, collections for events, meeting notes, and the MoMo transaction references your treasurer types in.",
        "A history of changes: who recorded or corrected what, and when. Records are never silently edited; a correction is added as a new entry.",
        "Subscription payments your group makes to NkapBook: amount, months, method and reference. Card payments are handled by Stripe; we never see card numbers.",
        "Security data: connection (IP) addresses and phone numbers used to limit sign-in attempts and protect private links. This is deleted after one day.",
      ],
    },
    {
      h: "Why we keep it",
      ul: [
        "To give your group clear, shared records and show each member their own record.",
        "To let officials sign in securely.",
        "To prevent abuse, such as someone guessing sign-in codes or private links.",
        "To manage your group’s NkapBook subscription.",
      ],
      p: ["We don’t sell your information, we don’t show ads, and we don’t use tracking or advertising cookies."],
    },
    {
      h: "Who can see it",
      ul: [
        "Your group’s officials see the group’s records and members’ phone numbers.",
        "Each member sees only their own record and the group’s basic details, through a private link. Anyone who has that link can open it, so keep it private. Your secretary can replace a link at any time, and the old one stops working.",
        "The NkapBook admin sees each group’s name, town, counts of members and meetings, and subscription status, but not members’ names, phone numbers or payments.",
      ],
    },
    {
      h: "Services we use",
      p: ["We use a few companies to run NkapBook. They only process information to provide their service to us:"],
      ul: [
        "Supabase: database and sign-in. Data is stored in the European Union (Paris).",
        "Vercel: hosts the website. Pages may be served from servers in other countries.",
        "Twilio: sends sign-in codes by SMS.",
        "Stripe: card payments for the NkapBook subscription, if you pay by card.",
        "Zoho: our email, if you write to us.",
      ],
    },
    {
      h: "Cookies",
      p: [
        "We only use cookies NkapBook needs to work: one that keeps you signed in, one that remembers your language, and a short-lived one (15 minutes) that remembers your number while you type the sign-in code.",
      ],
    },
    {
      h: "On your phone",
      p: [
        "So that meetings work without network, NkapBook saves meeting records on the official’s phone until they are sent, and keeps a copy of the open meeting there. Clearing the browser’s data for nkapbook.com removes it (send any unsent records first). Members’ private links don’t store their record on the phone.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "Group records are kept while the group uses NkapBook, because they are the group’s history. When a group stops, its president can ask us to delete the group and all its records. We do this within 30 days. Security data is deleted after one day.",
      ],
    },
    {
      h: "Your choices",
      ul: [
        "Members: to see your record, open your private link. To correct something, ask your group’s secretary. To have your phone number removed or to stop WhatsApp reminders, ask your secretary or write to us.",
        "Officials: you can export your group’s records at any time from the app.",
        `Anyone can ask us what we keep about them, or ask us to correct or delete it, by writing to ${SUPPORT_EMAIL}. We reply within 30 days. Some financial records may need to stay so the group’s accounts remain correct; if so, we’ll explain why.`,
      ],
    },
    {
      h: "For group officials",
      p: [
        "When you add members, you are sharing their names and, if you choose, their phone numbers with NkapBook. Please only add people who are in your group, and tell them NkapBook keeps the group’s records.",
      ],
    },
    {
      h: "Children",
      p: ["NkapBook is meant for adults managing their group. Officials must be 18 or older."],
    },
    {
      h: "Changes",
      p: ["If we change this policy, we’ll update the date at the top. If a change is important, officials will see a notice in the app."],
    },
    {
      h: "Contact",
      p: [`Questions about privacy: ${SUPPORT_EMAIL}.`],
    },
  ],
};

const fr: Policy = {
  title: "Politique de confidentialité",
  updated: "Dernière mise à jour :",
  intro: [
    "NkapBook (« nous ») est un registre pour les njangis et tontines. Cette page explique quelles informations NkapBook conserve, pourquoi, qui peut les voir et ce que vous pouvez nous demander d’en faire.",
    "NkapBook ne fait que tenir les registres. Nous ne détenons, ne transférons et ne prêtons jamais l’argent de votre groupe.",
  ],
  sections: [
    {
      h: "Ce que nous conservons",
      ul: [
        "Responsables (président, secrétaire, trésorier) : votre numéro de téléphone, pour vous connecter avec un code reçu par SMS.",
        "Membres : le nom saisi par votre groupe et, seulement si le groupe l’ajoute, un numéro de téléphone et l’accord du membre pour les rappels WhatsApp. Les membres n’ont pas besoin de compte.",
        "Registres du groupe : cotisations, ordre de passage et versements, présences, amendes, prêts, collectes pour les événements, comptes rendus de réunion, et les références MoMo saisies par votre trésorier.",
        "Un historique des modifications : qui a enregistré ou corrigé quoi, et quand. Rien n’est modifié en silence : une correction est ajoutée comme nouvelle écriture.",
        "Les paiements d’abonnement de votre groupe à NkapBook : montant, durée, moyen et référence. Les paiements par carte sont traités par Stripe ; nous ne voyons jamais les numéros de carte.",
        "Données de sécurité : adresses de connexion (IP) et numéros utilisés pour limiter les tentatives de connexion et protéger les liens privés. Elles sont supprimées après un jour.",
      ],
    },
    {
      h: "Pourquoi nous les conservons",
      ul: [
        "Pour donner à votre groupe des registres clairs et partagés, et montrer à chaque membre son propre relevé.",
        "Pour permettre aux responsables de se connecter en toute sécurité.",
        "Pour empêcher les abus, comme deviner des codes de connexion ou des liens privés.",
        "Pour gérer l’abonnement NkapBook de votre groupe.",
      ],
      p: ["Nous ne vendons pas vos informations, nous n’affichons pas de publicité et n’utilisons pas de cookies de suivi ou publicitaires."],
    },
    {
      h: "Qui peut les voir",
      ul: [
        "Les responsables de votre groupe voient les registres du groupe et les numéros des membres.",
        "Chaque membre ne voit que son propre relevé et les informations de base du groupe, grâce à un lien privé. Toute personne qui a ce lien peut l’ouvrir : gardez-le pour vous. Votre secrétaire peut remplacer un lien à tout moment ; l’ancien ne fonctionne plus.",
        "L’administrateur de NkapBook voit le nom de chaque groupe, sa ville, le nombre de membres et de réunions, et l’état de l’abonnement, mais pas les noms, numéros ni paiements des membres.",
      ],
    },
    {
      h: "Les services que nous utilisons",
      p: ["Quelques entreprises nous aident à faire fonctionner NkapBook. Elles ne traitent les informations que pour nous fournir leur service :"],
      ul: [
        "Supabase : base de données et connexion. Les données sont stockées dans l’Union européenne (Paris).",
        "Vercel : héberge le site. Les pages peuvent être servies depuis des serveurs dans d’autres pays.",
        "Twilio : envoie les codes de connexion par SMS.",
        "Stripe : paiements par carte de l’abonnement NkapBook, si vous payez par carte.",
        "Zoho : notre messagerie, si vous nous écrivez.",
      ],
    },
    {
      h: "Cookies",
      p: [
        "Nous n’utilisons que les cookies nécessaires au fonctionnement de NkapBook : un pour rester connecté, un pour se souvenir de votre langue, et un temporaire (15 minutes) qui retient votre numéro pendant que vous saisissez le code.",
      ],
    },
    {
      h: "Sur votre téléphone",
      p: [
        "Pour que les réunions fonctionnent sans réseau, NkapBook garde les enregistrements de réunion sur le téléphone du responsable jusqu’à leur envoi, ainsi qu’une copie de la réunion ouverte. Effacer les données du navigateur pour nkapbook.com les supprime (envoyez d’abord ce qui n’a pas été envoyé). Les liens privés des membres n’enregistrent pas leur relevé sur le téléphone.",
      ],
    },
    {
      h: "Durée de conservation",
      p: [
        "Les registres sont conservés tant que le groupe utilise NkapBook, car ils sont l’historique du groupe. Quand un groupe arrête, son président peut nous demander de supprimer le groupe et tous ses registres. Nous le faisons sous 30 jours. Les données de sécurité sont supprimées après un jour.",
      ],
    },
    {
      h: "Vos choix",
      ul: [
        "Membres : pour voir votre relevé, ouvrez votre lien privé. Pour corriger une erreur, demandez au secrétaire de votre groupe. Pour retirer votre numéro ou arrêter les rappels WhatsApp, demandez à votre secrétaire ou écrivez-nous.",
        "Responsables : vous pouvez exporter les registres de votre groupe à tout moment depuis l’application.",
        `Toute personne peut nous demander ce que nous conservons à son sujet, ou nous demander de le corriger ou de le supprimer, en écrivant à ${SUPPORT_EMAIL}. Nous répondons sous 30 jours. Certains registres financiers peuvent devoir être gardés pour que les comptes du groupe restent justes ; dans ce cas, nous vous expliquerons pourquoi.`,
      ],
    },
    {
      h: "Pour les responsables de groupe",
      p: [
        "En ajoutant des membres, vous partagez leurs noms et, si vous le choisissez, leurs numéros avec NkapBook. N’ajoutez que des personnes de votre groupe et informez-les que NkapBook tient les registres du groupe.",
      ],
    },
    {
      h: "Enfants",
      p: ["NkapBook s’adresse aux adultes qui gèrent leur groupe. Les responsables doivent avoir 18 ans ou plus."],
    },
    {
      h: "Modifications",
      p: ["Si nous modifions cette politique, nous mettrons à jour la date en haut. Si le changement est important, les responsables verront un avis dans l’application."],
    },
    {
      h: "Contact",
      p: [`Questions sur la confidentialité : ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const privacyPolicy = (lang: string): Policy => (lang === "fr" ? fr : en);
