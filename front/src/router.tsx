import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import HomePage from './pages/HomePage';
import FilesPage from './pages/FilesPage';
import OrdersPage from './pages/OrdersPage';
import WorkersPage from './pages/WorkersPage';
import { AuthPage, LoginForm, RegisterForm } from './pages/Auth';
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
});

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orders',
  component: OrdersPage,
});

const workersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workers',
  component: WorkersPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  filesRoute,
  ordersRoute,
  workersRoute,
  authRoute.addChildren([ loginRoute, registerRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
