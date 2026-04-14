import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { z } from 'zod';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function IndexLanding() {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">helix flight deck</h1>
        <p className="mt-2 text-neutral-400">
          Open a project at <code className="font-mono">/p/&lt;projectId&gt;</code>.
        </p>
      </div>
    );
  },
});

// Search-param schema for /p/$projectId. Lives at module scope so the
// ProjectPage component can `route.useSearch()` with the parsed shape.
const ProjectSearchSchema = z.object({
  priority: z
    .union([
      z.literal('all'),
      z.coerce.number().int().min(0).max(4),
    ])
    .optional(),
  q: z.string().optional(),
});

export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId',
  validateSearch: (raw) => ProjectSearchSchema.parse(raw),
  component: lazyRouteComponent(() => import('./pages/ProjectPage'), 'ProjectPage'),
});

export const issueRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'i/$issueId',
  component: lazyRouteComponent(() => import('./pages/IssueRoute'), 'IssueRoute'),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([issueRoute]),
]);

export const router = createRouter({ routeTree });
