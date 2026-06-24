import { z } from 'zod';
import { optionalUuid, requiredEmail } from '@/lib/form/common-fields';

export const userInviteSchema = z.object({
  email: requiredEmail,
  name: z.string().trim().min(1, 'Name is required.'),
  profileRole: z.string().trim().min(1, 'Select a profile role.'),
  projectMemberRole: z.string().trim().min(1, 'Select a project member role.'),
  projectIds: z
    .array(z.string())
    .min(1, 'Select at least one project for this user.')
});

export type UserInviteValues = z.infer<typeof userInviteSchema>;

export const portalLinksSchema = z.object({
  portalUserId: z.string().trim().min(1, 'Select a staff user.'),
  portalCustomerId: optionalUuid,
  portalBrokerId: optionalUuid
});

export type PortalLinksValues = z.infer<typeof portalLinksSchema>;
