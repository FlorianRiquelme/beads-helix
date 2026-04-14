import { z } from 'zod';

export const REGISTRY_SCHEMA_VERSION = 1 as const;

export const ProjectStatusSchema = z.enum(['active', 'missing', 'moved']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  added_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  status: ProjectStatusSchema.default('active'),
});
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

export const RegistrySchema = z.object({
  version: z.literal(REGISTRY_SCHEMA_VERSION),
  projects: z.array(ProjectEntrySchema),
});
export type Registry = z.infer<typeof RegistrySchema>;

export const RegistryMutationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert'),
    entry: ProjectEntrySchema,
  }),
  z.object({
    action: z.literal('remove'),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal('undo'),
    id: z.string().min(1),
  }),
]);
export type RegistryMutation = z.infer<typeof RegistryMutationSchema>;

export function emptyRegistry(): Registry {
  return { version: REGISTRY_SCHEMA_VERSION, projects: [] };
}
