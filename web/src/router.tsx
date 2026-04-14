import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';

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

// Project route is filled in during phase 7 (routing).
// Placeholder kept so the router compiles during earlier phases.
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId',
  component: function ProjectPlaceholder() {
    return <div className="p-8 text-neutral-500">project route — pending</div>;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

export const router = createRouter({ routeTree });
