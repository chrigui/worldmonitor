// Role-based access control for the SentinelIQ enterprise tier.
// Roles are totally ordered: viewer < analyst < admin < owner.

export type Role = "owner" | "admin" | "analyst" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  analyst: 1,
  admin: 2,
  owner: 3,
};

/** True when `role` is at least as privileged as `minimum`. */
export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** All roles, ordered least → most privileged. */
export const ROLES: Role[] = ["viewer", "analyst", "admin", "owner"];
