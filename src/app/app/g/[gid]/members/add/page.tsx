import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { getGroupContext } from "@/lib/group";
import { addMember, addMembersBulk } from "../../actions";
import { MemberFields } from "../MemberFields";
import { PasteMembers } from "./PasteMembers";

export default async function AddMembers({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { group, lang, t } = await getGroupContext(gid);
  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/members`} title={t.members.add} sub={group.name} />
      <main className="wrap stack">
        <ActionForm
          action={addMember.bind(null, gid)}
          errors={t.errors}
          submit={t.members.save}
          secondary={{ name: "again", value: "1", label: t.members.addAnother }}
          className="card stack"
        >
          <MemberFields t={t} />
        </ActionForm>
        <section id="paste" className="stack">
          <h2>{t.paste.title}</h2>
          <PasteMembers t={{ paste: t.paste, errors: t.errors, members: t.members }} action={addMembersBulk.bind(null, gid)} />
        </section>
      </main>
    </>
  );
}
