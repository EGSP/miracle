import { USER_ROLES } from "@miracle/types"
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router"
import { App } from "./App"
import { AccessRouteGuard } from "./contexts/access"
import { AuthPage, LoginForm, RegisterForm } from "./pages/Auth"
import AdminPage from "./pages/admin/AdminPage"
import FilesPage from "./pages/FilesPage"
import HomePage from "./pages/HomePage"
import OperationsPage from "./pages/OperationsPage"
import OrdersPage from "./pages/OrdersPage"
import ProductTypesPage from "./pages/ProductTypesPage"
import TechnicalConditionsPage from "./pages/TechnicalConditionsPage"

const rootRoute = createRootRoute({
  component: App,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: AuthPage,
})

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "login",
  component: LoginForm,
})

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "register",
  component: RegisterForm,
})

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/files",
  component: () => (
    <AccessRouteGuard roles={[USER_ROLES.ADMIN]}>
      <FilesPage />
    </AccessRouteGuard>
  ),
  validateSearch: (search: Record<string, unknown>) => ({
    fileId: typeof search.fileId === "string" ? search.fileId : undefined,
  }),
})

const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  component: OrdersPage,
  validateSearch: (search: Record<string, unknown>) => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
    positionId: typeof search.positionId === "string" ? search.positionId : undefined,
  }),
})

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  component: () => (
    <AccessRouteGuard roles={[USER_ROLES.ADMIN]}>
      <OperationsPage />
    </AccessRouteGuard>
  ),
  validateSearch: (search: Record<string, unknown>) => ({
    rootId: typeof search.rootId === "string" ? search.rootId : undefined,
    runId: typeof search.runId === "string" ? search.runId : undefined,
  }),
})

const productTypesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/product-types",
  component: ProductTypesPage,
})

const technicalConditionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/technical-conditions",
  component: () => (
    <AccessRouteGuard roles={[USER_ROLES.ADMIN]}>
      <TechnicalConditionsPage />
    </AccessRouteGuard>
  ),
  validateSearch: (search: Record<string, unknown>) => ({
    tcId: typeof search.tcId === "string" ? search.tcId : undefined,
  }),
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: () => (
    <AccessRouteGuard roles={[USER_ROLES.ADMIN]}>
      <AdminPage />
    </AccessRouteGuard>
  ),
  validateSearch: (search: Record<string, unknown>) => ({
    userId: typeof search.userId === "string" ? search.userId : undefined,
  }),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  filesRoute,
  ordersRoute,
  operationsRoute,
  productTypesRoute,
  technicalConditionsRoute,
  adminRoute,
  authRoute.addChildren([loginRoute, registerRoute]),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
