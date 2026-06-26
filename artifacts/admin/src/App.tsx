import React from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, useUser } from "@clerk/react";
import { Dashboard } from "@/pages/dashboard";
import { Users } from "@/pages/users";
import { Transactions } from "@/pages/transactions";
import { Accounts } from "@/pages/accounts";
import { Sms } from "@/pages/sms";
import { Support } from "@/pages/support";
import { Sidebar } from "@/components/sidebar";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Admin ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-white font-bold text-lg mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-6">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
      {...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {})}
      signInUrl={`${basePath}/sign-in`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/">
            <AppLayout><ErrorBoundary><Dashboard /></ErrorBoundary></AppLayout>
          </Route>
          <Route path="/users">
            <AppLayout><ErrorBoundary><Users /></ErrorBoundary></AppLayout>
          </Route>
          <Route path="/transactions">
            <AppLayout><ErrorBoundary><Transactions /></ErrorBoundary></AppLayout>
          </Route>
          <Route path="/accounts">
            <AppLayout><ErrorBoundary><Accounts /></ErrorBoundary></AppLayout>
          </Route>
          <Route path="/sms">
            <AppLayout><ErrorBoundary><Sms /></ErrorBoundary></AppLayout>
          </Route>
          <Route path="/support">
            <AppLayout><ErrorBoundary><Support /></ErrorBoundary></AppLayout>
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
        <ErrorBoundary>
          <ClerkProviderWithRoutes />
        </ErrorBoundary>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
