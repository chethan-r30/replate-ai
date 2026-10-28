// Strict domain inputs reject extra fields and impossible food pickup windows.
import { z } from 'zod';
import { pagination } from '../middleware/auth.js';
export const categories = ['cooked', 'bakery', 'produce', 'packaged', 'dairy'];
export const dietary = ['veg', 'vegan', 'halal', 'contains-nuts'];
export const pointSchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  })
  .strict();
const date = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
export const listingFields = z
  .object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().max(2000).default(''),
    category: z.enum(categories),
    dietary: z.array(z.enum(dietary)).max(4).default([]),
    quantity: z.number().positive().max(100000),
    unit: z.enum(['kg', 'boxes', 'items', 'litres', 'portions']),
    servings: z.number().int().min(1).max(100000),
    photos: z.array(z.string().url().max(1000)).max(5).default([]),
    preparedAt: date,
    bestBefore: date,
    pickupWindow: z.object({ start: date, end: date }).strict(),
    location: pointSchema,
  })
  .strict();
export const listingSchema = listingFields.superRefine((v, c) => {
  if (v.bestBefore <= new Date())
    c.addIssue({
      code: 'custom',
      path: ['bestBefore'],
      message: 'Deadline must be in the future',
    });
  if (v.preparedAt > new Date())
    c.addIssue({
      code: 'custom',
      path: ['preparedAt'],
      message: 'Prepared time cannot be in the future',
    });
  if (v.preparedAt >= v.bestBefore)
    c.addIssue({
      code: 'custom',
      path: ['bestBefore'],
      message: 'Deadline must follow preparation',
    });
  if (
    v.pickupWindow.start >= v.pickupWindow.end ||
    v.pickupWindow.end > v.bestBefore
  )
    c.addIssue({
      code: 'custom',
      path: ['pickupWindow'],
      message: 'Pickup must end after its start and before the food deadline',
    });
});
export const searchSchema = pagination
  .extend({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius: z.coerce.number().min(0.1).max(100).default(10),
    category: z.enum(categories).optional(),
    dietary: z.enum(dietary).optional(),
    pickupBefore: date.optional(),
  })
  .strict()
  .refine(
    (v) => (v.lat === undefined) === (v.lng === undefined),
    'Latitude and longitude are both required',
  );
