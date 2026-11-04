"use client";
import { authDialog, hideAuth, inlineAuthHost } from "@/lib/bus";
import { useStore } from "@/lib/useStore";
import { Modal } from "@/components/ui/Modal";
import { AuthPanels } from "./AuthPanels";

export function AuthDialog() {
  const st = useStore(authDialog);
  const inline = useStore(inlineAuthHost);
  return (
    <Modal open={st.open && !inline} onClose={hideAuth} title="Account" hideTitle size={st.panel === "account" ? "lg" : "md"}>
      <div key={st.panel}><AuthPanels panel={st.panel} /></div>
    </Modal>
  );
}
