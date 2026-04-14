import type { ReactNode } from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

/**
 * Wraps `children` in a minimal TanStack Router so components that use `<Link>`
 * or `useNavigate` can render in isolation during unit tests.
 */
export function withRouter(children: ReactNode, initialUrl = '/p/test-proj'): ReactNode {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/p/$projectId',
    component: () => <>{children}</>,
  });
  const issueRoute = createRoute({
    getParentRoute: () => projectRoute,
    path: 'i/$issueId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute.addChildren([issueRoute])]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  return <RouterProvider router={router} />;
}
