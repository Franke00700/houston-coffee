import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "./db";

export async function audit(input: { actorId?: string; actorRole?: StaffRole; action: string; entity: string; entityId?: string; success?: boolean; before?: unknown; after?: unknown; requestId?: string }) {
  await db.auditEvent.create({ data: {
    actorId: input.actorId, actorRole: input.actorRole, action: input.action, entity: input.entity, entityId: input.entityId,
    success: input.success ?? true, requestId: input.requestId,
    before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
    after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
  }});
}
