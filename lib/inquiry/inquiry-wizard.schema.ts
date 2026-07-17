import { z } from 'zod';
import {
  customerNameMin2,
  isPhoneLengthValidForCountry,
  optionalEmail,
  phoneLengthErrorMessage
} from '@/lib/form/common-fields';

export const inquiryWizardStep1Schema = z
  .object({
    customerName: customerNameMin2,
    phone: z.string(),
    phoneCountry: z.string(),
    email: optionalEmail,
    leadSource: z.string().trim().min(1, 'Select a lead source.'),
    leadSourceOther: z.string(),
    brokerId: z.string()
  })
  .superRefine((data, ctx) => {
    if (!isPhoneLengthValidForCountry(data.phone, data.phoneCountry)) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: phoneLengthErrorMessage(data.phoneCountry)
      });
    }
    if (data.leadSource === 'Broker' && !data.brokerId.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['brokerId'],
        message: 'Select a broker for broker-sourced leads.'
      });
    }
    if (data.leadSource === 'Other' && !data.leadSourceOther.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['leadSourceOther'],
        message: 'Enter the lead source.'
      });
    }
  });

export const inquiryWizardStep2Schema = z.object({
  selectedUnitId: z.string().trim().min(1, 'Select an available unit to qualify.')
});

export type InquiryWizardStep1Values = z.infer<typeof inquiryWizardStep1Schema>;
export type InquiryWizardStep2Values = z.infer<typeof inquiryWizardStep2Schema>;

export const inquirySiteVisitSchema = z.object({
  visitInterest: z
    .string()
    .trim()
    .min(1, 'Select visit interest.')
    .refine((v) => v === 'Interested' || v === 'Not Interested', {
      message: 'Select visit interest (Interested or Not Interested).'
    })
});

export type InquirySiteVisitValues = z.infer<typeof inquirySiteVisitSchema>;
