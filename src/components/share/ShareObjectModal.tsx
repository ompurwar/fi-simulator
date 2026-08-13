"use client";

import { useState } from "react";
import { ModalUi } from "@/components/ui/ModalUi";
import { Button } from "@/components/ui/Button";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { Track, EVENT_TYPES } from "@/lib/tracker";
import { FireNotification } from "@/store/notifications";

/** Port of share_object/ShareObject.vue — create a sharable template link. */
export function ShareObjectModal() {
  const share_data = useFiPlanStore((s) => s.share_data);
  const setShareData = useFiPlanStore((s) => s.set_share_data);
  const profile = useFiPlanStore((s) => s.profile);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const onClose = () => setShareData({ modal_state: "closed" });

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.CreateShareObject({
        title,
        description,
        type: "template",
        category: share_data.category || "t-i",
        promotional_links: [],
        creator_name: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(),
        img_url: "",
        plan_ids: share_data.ids || [],
      });
      const share_id = result.share_object?._id;
      const appLink = window.location.origin;
      const shareLink = `${appLink}/link_page?sid=${share_id}`;
      setLink(shareLink);
      Track(
        EVENT_TYPES.TEMPLATE_SHARED.id,
        { category: share_data.category, Template_ids: share_data.ids, share_id, title, desc: description },
        { inc: { template_shared_count: 1 } }
      );
    } catch (e: any) {
      FireNotification({ title: "Sharing failed", desc: e.message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      FireNotification({ title: "Link copied!", variant: "success" });
    } catch {
      window.prompt("Copy link:", link);
    }
  }

  return (
    <ModalUi show title="Share your plan" onClose={onClose}>
      {!link ? (
        <div className="flex flex-col gap-3">
          <input className="input-filed" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="input-filed"
            placeholder="Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button onClick={handleShare} disabled={busy || !title}>
            {busy ? "Sharing..." : "Create shareable link"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-dark-500">Your template is live. Share this link:</p>
          <div className="rounded-lg bg-dark-50 p-3 text-xs break-all text-primary-600">{link}</div>
          <div className="flex gap-2">
            <Button onClick={copyLink}>Copy Link</Button>
            <Button variant="neutral" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </ModalUi>
  );
}
