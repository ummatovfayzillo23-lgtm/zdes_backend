import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthUserPayload } from '../../modules/auth/interfaces/auth-user-payload.interface';

export interface Scope {
  companyId?: string;
  branchId?: string;
}

export function getScope(actor: AuthUserPayload, requested: Scope = {}): Scope {
  if (actor.role === 'superadmin') {
    if (requested.companyId) {
      return requested;
    }
    if (actor.companyId) {
      return { companyId: actor.companyId, branchId: requested.branchId };
    }
    return requested;
  }

  if (!actor.companyId) {
    throw new ForbiddenException('Actor is not assigned to a company');
  }

  if (requested.companyId && requested.companyId !== actor.companyId) {
    throw new ForbiddenException("You cannot access another company's data");
  }

  if (actor.role === 'admin') {
    return { companyId: actor.companyId, branchId: requested.branchId };
  }

  if (!actor.branchId) {
    throw new ForbiddenException('Actor is not assigned to a branch');
  }

  if (requested.branchId && requested.branchId !== actor.branchId) {
    throw new ForbiddenException("You cannot access another branch's data");
  }

  return { companyId: actor.companyId, branchId: actor.branchId };
}

export function getCompanyId(
  actor: AuthUserPayload,
  providedCompanyId?: string,
): string {
  if (actor.role === 'superadmin') {
    if (providedCompanyId) {
      return providedCompanyId;
    }
    if (actor.companyId) {
      return actor.companyId;
    }
    throw new BadRequestException('companyId is required');
  }

  if (!actor.companyId) {
    throw new ForbiddenException('Actor is not assigned to a company');
  }

  if (providedCompanyId && providedCompanyId !== actor.companyId) {
    throw new ForbiddenException("You cannot access another company's data");
  }

  return actor.companyId;
}

export function checkAccess(
  actor: AuthUserPayload,
  target: { companyId?: string | null; branchId?: string | null },
): void {
  if (actor.role === 'superadmin') {
    return;
  }

  if (target.companyId && target.companyId !== actor.companyId) {
    throw new ForbiddenException("You cannot access another company's data");
  }

  if (
    actor.role === 'manager' &&
    target.branchId &&
    target.branchId !== actor.branchId
  ) {
    throw new ForbiddenException("You cannot access another branch's data");
  }
}
