import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import HomePage from './pages/HomePage';
import FilesPage from './pages/FilesPage';
import OrdersPage from './pages/OrdersPage';
import WorkersPage from './pages/WorkersPage';
import WorkerPromptPage from './pages/WorkerPromptPage';
import ProductTypesPage from './pages/ProductTypesPage';
import TechnicalConditionsPage from './pages/TechnicalConditionsPage';
import { AuthPage, LoginForm, RegisterForm } from './pages/Auth';
import AdminPage from './pages/admin/AdminPage';
import { App } from './App';

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: AuthPage,
});

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: 'login',
  component: LoginForm,
});

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: 'register',
  component: RegisterForm,
});

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/files',
  component: FilesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    fileId: typeof search.fileId === 'string' ? search.fileId : undefined,
  }),
});

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: OrdersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: typeof search.orderId === 'string' ? search.orderId : undefined,
  }),
});

const workersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workers',
  component: WorkersPage,
});

const workerPromptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worker-prompt',
  component: WorkerPromptPage,
  validateSearch: (search: Record<string, unknown>) => ({
    workerId: typeof search.workerId === 'string' ? search.workerId : undefined,
  }),
});

const productTypesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/product-types',
  component: ProductTypesPage,
});

const technicalConditionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/technical-conditions',
  component: TechnicalConditionsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tcId: typeof search.tcId === 'string' ? search.tcId : undefined,
  }),
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  filesRoute,
  ordersRoute,
  workersRoute,
  workerPromptRoute,
  productTypesRoute,
  technicalConditionsRoute,
  adminRoute,
  authRoute.addChildren([ loginRoute, registerRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
