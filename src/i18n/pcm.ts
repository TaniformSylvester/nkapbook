// Cameroon Pidgin. PCM-REVIEW: every string here needs a native speaker's check.
// When you approve a key, add it to `reviewed` below (e.g. "login.sendCode").
// `npm run pidgin:review` writes docs/pidgin-review.md with English and Pidgin side by side.
import type { Dict } from "./en";

export const reviewed: string[] = [];

const pcm: Dict = {
  meta: {
    tagline: "Njangi book weh e clear. No palaver.",
    description: "NkapBook di keep njangi record clear for everybody: contribution, turn, fine, loan and meeting.",
  },
  lang: { en: "English", fr: "Français", pcm: "Pidgin", label: "Language" },
  common: {
    continue: "Continue",
    back: "Go back",
    save: "Save am",
    cancel: "Cancel",
    loading: "E di load…",
    signOut: "Comot",
    offline: "Network no dey. We go save am for this phone, then send am when network come back.",
    online: "Network don come back",
    tryAgain: "Try again",
  },
  home: {
    headline: "Your njangi record, clear for everybody.",
    lead: "Write contribution, turn, fine and loan for meeting, even when network weak. Every member go see ein own record for ein private link.",
    neverHold: "NkapBook na only record e di keep. Money still di go for treasurer hand, cash, MoMo or bank.",
    cta: "Sign in as official",
    forMembers: "Member no need account. Your secretary go send you your private link for WhatsApp.",
  },
  login: {
    title: "Sign in",
    phoneLabel: "Your phone number",
    phoneHint: "Cameroon number, like 6 70 12 34 56",
    sendCode: "Send me code",
    codeTitle: "Put the code",
    codeSent: "We don send 6-number code for SMS to {phone}.",
    codeLabel: "6-number code",
    verify: "Sign in",
    changeNumber: "Use another number",
    resend: "Send the code again",
    errors: {
      phone: "That number no be like Cameroon number. Check am and try again.",
      code: "That code no correct or e don expire. Try again.",
      tooMany: "You don try too much. Wait small, then try again.",
      generic: "Something no go well. Try again.",
    },
  },
  app: {
    myGroups: "My groups",
    noGroups: "You never be official for any group yet.",
    noGroupsHint: "Create your njangi, or tell your president make e invite your number.",
    createGroup: "Create group",
    signedInAs: "You don sign in with {phone}",
  },
  offlinePage: {
    title: "Network no dey",
    body: "This page never save for your phone yet. When network come back, e go load.",
  },
};
export default pcm;
