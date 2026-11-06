// src/services/store/address.service.ts

import { apiClient, requestData } from "@/lib/api/client";
import type { Address, AddressInput } from "@/types/address";

/**
 * The customer's address book (`/api/addresses`).
 *
 * Owner-scoped on the server: another customer's id is a 404, so these calls can
 * never read or edit somebody else's address. The first address saved becomes the
 * default automatically — the server decides that, not this client.
 */
export const addressService = {
  list(signal?: AbortSignal) {
    return requestData<Address[]>(apiClient.get("/addresses", { signal }));
  },

  create(input: AddressInput) {
    return requestData<Address>(apiClient.post("/addresses", input));
  },

  update(id: string, input: Partial<AddressInput>) {
    return requestData<Address>(apiClient.patch(`/addresses/${id}`, input));
  },

  remove(id: string) {
    return requestData<{ deleted: true }>(apiClient.delete(`/addresses/${id}`));
  },
};
