/**
 * Customer account status.
 *
 * `users.isActive` (the original boolean) is kept as a **derived mirror** of
 * `status === 'active'` so every existing auth check keeps working, while admins
 * get a richer, auditable state.
 *
 * Transitions:
 *
 *   active ──suspend──→ suspended ──reactivate──→ active
 *      │                    │
 *      └──deactivate────────┴──→ deactivated ──reactivate──→ active
 */
export type CustomerStatus = 'active' | 'suspended' | 'deactivated';

export const CUSTOMER_STATUSES: CustomerStatus[] = [
  'active',
  'suspended',
  'deactivated',
];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

/** What an admin may do from each state. */
export const CUSTOMER_STATUS_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  active: ['suspended', 'deactivated'],
  suspended: ['active', 'deactivated'],
  deactivated: ['active'],
};

export function isCustomerStatus(value: unknown): value is CustomerStatus {
  return typeof value === 'string' && CUSTOMER_STATUSES.includes(value as CustomerStatus);
}

export function canChangeStatus(from: CustomerStatus, to: CustomerStatus): boolean {
  return from !== to && (CUSTOMER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** Only an active account may sign in, refresh a session or place an order. */
export function isAccountUsable(status: CustomerStatus): boolean {
  return status === 'active';
}

/** Message shown to the account holder / returned by the API. */
export function unusableAccountMessage(status: CustomerStatus): string {
  return status === 'suspended'
    ? 'This account is suspended. Contact support if you believe this is a mistake.'
    : 'This account has been deactivated.';
}

/** Legacy documents only have `isActive`; derive a status for them on read. */
export function resolveStatus(input: {
  status?: CustomerStatus | null;
  isActive?: boolean;
}): CustomerStatus {
  if (input.status && isCustomerStatus(input.status)) {
    return input.status;
  }

  return input.isActive === false ? 'deactivated' : 'active';
}
