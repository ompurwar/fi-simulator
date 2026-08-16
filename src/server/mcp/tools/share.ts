/** MCP tools for share objects (doc §8.6). */

import { z } from "zod";
import type { Container } from "../../di/container";
import { InvalidOperationError } from "../../domain/errors";
import { callUseCase, fail, requireFields, isRecord } from "./envelope";
import type { ToolDefinition } from "../types";

export function makeShareTools(container: Container): ToolDefinition[] {
  const { app, user_list, share_object_list } = container;

  return [
    {
      name: "list_share_objects",
      title: "List the user's share objects",
      description:
        "Returns all public share objects (templated plans) created by the current user. Each entry includes the forked plan_ids that were cloned from the user's plans.",
      inputSchema: {},
      async handler(ctx) {
        return callUseCase(() =>
          app.GetShareObjects({ creator_id: ctx.user_id, filter_by: "creator_id" })
        );
      },
    },
    {
      name: "create_share_object",
      title: "Create a share object from plans",
      description:
        "Publishes a share object that forks the given plan_ids into a public template. Requires plan_ids and title; the current user becomes the creator and the forked plans stay owned by them.",
      inputSchema: {
        plan_ids: z.array(z.string()),
        title: z.string(),
        description: z.string().optional(),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["plan_ids", "title"]);
        if (missing) return missing;
        if (!Array.isArray(args.plan_ids) || args.plan_ids.length === 0)
          return fail("VALIDATION_FAILED", "plan_ids must be a non-empty array");
        return callUseCase(async () => {
          const user: any = await user_list.FindById(ctx.user_id);
          const creator_name =
            `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() ||
            user?.email ||
            "user";
          return app.AddShareObject({
            title: args.title,
            description: args.description ?? "",
            type: "template",
            category: "t-i",
            creator_id: ctx.user_id,
            creator_name,
            promotional_links: [],
            plan_ids: args.plan_ids,
          });
        });
      },
    },
    {
      name: "update_share_object",
      title: "Update a share object",
      description:
        "Patches the share object with share_id. changes may include title, description or plan_ids; omitted fields keep their current values. Only the creator may update it.",
      inputSchema: {
        share_id: z.string(),
        changes: z.record(z.string(), z.any()),
      },
      async handler(ctx, args) {
        const missing = requireFields(args, ["share_id", "changes"]);
        if (missing) return missing;
        if (!isRecord(args.changes))
          return fail("VALIDATION_FAILED", "changes must be an object");
        return callUseCase(async () => {
          const existing: any = await share_object_list.FindById({
            share_ids: [args.share_id],
          });
          if (!existing)
            throw new InvalidOperationError(`share object not found: ${args.share_id}`);
          if (String(existing.creator_id) !== ctx.user_id)
            throw new InvalidOperationError("Un authorized access to the share_object");
          const merged: Record<string, any> = { ...existing, ...args.changes };
          return app.UpdateShareObject({
            _id: args.share_id,
            user_id: ctx.user_id,
            title: merged.title,
            description: merged.description,
            type: merged.type,
            category: merged.category,
            promotional_links: merged.promotional_links,
            creator_name: merged.creator_name,
            img_url: merged.img_url,
            plan_ids: merged.plan_ids,
            state: merged.state,
            onboard_count: merged.onboard_count,
          });
        });
      },
    },
    {
      name: "delete_share_object",
      title: "Delete a share object",
      description:
        "Soft-deletes the share object with share_id. Only the creator may delete it; other users get an error.",
      inputSchema: { share_id: z.string() },
      async handler(ctx, args) {
        const missing = requireFields(args, ["share_id"]);
        if (missing) return missing;
        return callUseCase(async () => {
          const existing: any = await share_object_list.FindById({
            share_ids: [args.share_id],
          });
          if (!existing)
            throw new InvalidOperationError(`share object not found: ${args.share_id}`);
          if (String(existing.creator_id) !== ctx.user_id)
            throw new InvalidOperationError("Un authorized access to the share_object");
          return app.DeleteShareObject({ id: args.share_id, user_id: ctx.user_id });
        });
      },
    },
  ];
}
