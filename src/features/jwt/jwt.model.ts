export type UserTokenInfo = {
  username: string;
  loginType: 'EMAIL' | 'CONTACT_NO' | 'DRIVER';
  organizationId?: string;
  /** Set only for DRIVER tokens — the driver's row id, so driver-facing resolvers can identify who's calling without an admin `users` lookup. */
  driverId?: string;
}