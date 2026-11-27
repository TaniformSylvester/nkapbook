// English is the source dictionary. fr.ts and pcm.ts must have the same keys.
// Placeholders look like {name}.
const en = {
  meta: {
    tagline: "Clear njangi records. No palaver.",
    description: "NkapBook keeps clear, shared records for your njangi: contributions, turns, fines, loans and meetings.",
  },
  lang: { en: "English", fr: "Français", pcm: "Pidgin", label: "Language" },
  common: {
    continue: "Continue",
    back: "Back",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading…",
    signOut: "Sign out",
    offline: "You are offline. We will save on this phone and sync later.",
    online: "Back online",
    tryAgain: "Try again",
  },
  home: {
    headline: "Your njangi records, clear for everybody.",
    lead: "Record contributions, turns, fines and loans at the meeting, even with weak network. Every member sees their own record on a private link.",
    neverHold: "NkapBook only keeps the records. Money still goes to your treasurer, by cash, MoMo or bank.",
    cta: "Sign in as an official",
    forMembers: "Members don’t need an account. Your secretary will send you your private link on WhatsApp.",
  },
  login: {
    title: "Sign in",
    phoneLabel: "Your phone number",
    phoneHint: "Cameroon number, e.g. 6 70 12 34 56",
    sendCode: "Send me a code",
    codeTitle: "Enter the code",
    codeSent: "We sent a 6-digit code by SMS to {phone}.",
    codeLabel: "6-digit code",
    verify: "Sign in",
    changeNumber: "Use another number",
    resend: "Send the code again",
    errors: {
      phone: "That doesn’t look like a Cameroon phone number. Check it and try again.",
      code: "That code is not right or has expired. Try again.",
      tooMany: "Too many tries. Please wait a few minutes and try again.",
      generic: "Something went wrong. Please try again.",
    },
  },
  app: {
    myGroups: "My groups",
    noGroups: "You are not an official of any group yet.",
    noGroupsHint: "Create your njangi, or ask your president to invite your phone number.",
    createGroup: "Create a group",
    signedInAs: "Signed in as {phone}",
  },
  offlinePage: {
    title: "No network",
    body: "This page is not saved on your phone yet. When you are back online, it will load.",
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dict = Widen<typeof en>;
export default en as Dict;
