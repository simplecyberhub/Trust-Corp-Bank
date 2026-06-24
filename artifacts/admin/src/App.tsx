import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, useUser, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Dashboard } from "@/pages/dashboard";
import { Users } from "@/pages/users";
import { Transactions } from "@/pages/transactions";
import { Accounts } from "@/pages/accounts";
import { Sidebar } from "@/components/sidebar";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-xl font-black text-white">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Trust Corp Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Internal administration panel</p>
        </div>
        <SignIn routing="path" path={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <div className="flex min-h-screen bg-gray-950">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </AdminGate>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-white text-center px-4">
          Clerk configuration missing.<br />
          Please add <code className="text-blue-400">VITE_CLERK_PUBLISHABLE_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl={`${basePath}/sign-in`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/">
            <AppLayout><Dashboard /></AppLayout>
          </Route>
          <Route path="/users">
            <AppLayout><Users /></AppLayout>
          </Route>
          <Route path="/transactions">
            <AppLayout><Transactions /></AppLayout>
          </Route>
          <Route path="/accounts">
            <AppLayout><Accounts /></AppLayout>
          </Route>
          <Route><Redirect to="/" /></Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
