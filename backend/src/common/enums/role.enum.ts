/**
 * Application roles.
 *
 * A single-vendor store has exactly two: browsing customers and the store owner.
 * Values are stored in MongoDB, so they are lowercase strings and must never be
 * renamed without a data migration.
 */
export enum Role {
  Customer = 'customer',
  Admin = 'admin',
}
