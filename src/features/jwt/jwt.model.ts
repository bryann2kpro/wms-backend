export type UserTokenInfo = {
  username: string;
  loginType: 'EMAIL' | 'CONTACT_NO' | 'DRIVER' | 'DRIVER_REGISTRATION';
  organizationId?: string;
  /** Set only for DRIVER tokens — the driver's row id, so driver-facing resolvers can identify who's calling without an admin `users` lookup. */
  driverId?: string;
  /** Set only for DRIVER_REGISTRATION tokens — the OTP-verified phone number, proven ownership pending a name to finish self-registration. */
  phone?: string;
}