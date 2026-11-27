import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { GroupFields } from "@/components/GroupFields";
import { getT } from "@/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { createGroup } from "./actions";

export const metadata = { title: "Create a group" };

export default async function NewGroup() {
  if (!(await getUser())) redirect("/login");
  const { lang, t } = await getT();
  return (
    <>
      <AppHeader lang={lang} t={t} back="/app" title={t.groupForm.createTitle} sub={t.groupForm.createLead} />
      <main className="wrap">
        <ActionForm action={createGroup} errors={t.errors} submit={t.groupForm.create} className="card stack">
          <GroupFields t={t} withYourName />
        </ActionForm>
      </main>
    </>
  );
}
