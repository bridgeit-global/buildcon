import { z } from 'zod';
import { nonNegativeNumberString } from '@/lib/form/common-fields';
import { isReadyProjectType } from '@/lib/project/project-fy';
import {
  isProjectNameTaken,
  PROJECT_NAME_DUPLICATE_ERROR,
  type ProjectNameRow
} from './project-name';

export const projectDetailsSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required.'),
    location: z.string(),
    type: z.string().trim().min(1, 'Select a project type.'),
    status: z.string().trim().min(1, 'Select a status.'),
    fy: z.string(),
    rera_no: z.string(),
    base_rate: nonNegativeNumberString
  })
  .superRefine((data, ctx) => {
    if (isReadyProjectType(data.type) && !data.rera_no.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'RERA number is required for Ready projects.',
        path: ['rera_no']
      });
    }
  });

export function projectDetailsSchemaWithExisting(
  existingProjects: Iterable<ProjectNameRow>,
  excludeProjectId?: string
) {
  return projectDetailsSchema.superRefine((data, ctx) => {
    if (isProjectNameTaken(data.name, existingProjects, excludeProjectId)) {
      ctx.addIssue({
        code: 'custom',
        message: PROJECT_NAME_DUPLICATE_ERROR,
        path: ['name']
      });
    }
  });
}

export const projectPricingSchema = z.object({
  gstPct: nonNegativeNumberString,
  stampPct: nonNegativeNumberString,
  regFee: nonNegativeNumberString
});

export type ProjectDetailsValues = z.infer<typeof projectDetailsSchema>;
export type ProjectPricingValues = z.infer<typeof projectPricingSchema>;
