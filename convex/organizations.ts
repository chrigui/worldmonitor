import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { DatabaseReader } from "./_generated/server";
import { requireCurrentUser } from "./lib/auth";
import { writeAudit } from "./lib/audit";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "org";
}

async function uniqueSlug(db: DatabaseReader, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Create an organization. The caller becomes its `owner`. Records an audit row.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Organization name is required");

    const slug = await uniqueSlug(ctx.db, name);
    const now = Date.now();

    const orgId = await ctx.db.insert("organizations", {
      name,
      slug,
      plan: "free",
      createdByUserId: user._id,
      createdAt: now,
    });

    await ctx.db.insert("memberships", {
      orgId,
      userId: user._id,
      role: "owner",
      createdAt: now,
    });

    await writeAudit(ctx, {
      orgId,
      actorUserId: user._id,
      action: "organization.create",
      targetType: "organization",
      targetId: orgId,
      metadata: { name, slug },
    });

    return { orgId, slug };
  },
});

/** Organizations the current user belongs to, with their role in each. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const results = [];
    for (const m of memberships) {
      if (m.deletedAt) continue;
      const org = await ctx.db.get(m.orgId);
      if (!org || org.deletedAt) continue;
      results.push({
        id: org._id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        role: m.role,
      });
    }
    return results;
  },
});
