import React from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";

import { Layout } from "@/components/layout";
import { Home } from "@/pages/home";
import { Activity } from "@/pages/activity";
import { Transfer } from "@/pages/transfer";
import { Cards } from "@/pages/cards";
import { Profile } from "@/pages/profile";
import { Exchange } from "@/pages/exchange";
import { Notifications } from "@/pages/notifications";
import { Kyc } from "@/pages/kyc";
import { Support } from "@/pages/support";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#1a56db",
    colorBackground: "#0d1424",
    colorText: "#ffffff",
    colorTextSecondary: "#9ca3af",
    colorInputBackground: "#1e2d4d",
    colorInputText: "#ffffff",
    colorNeutral: "#6b7280",
    borderRadius: "0.75rem",
    fontSize: "15px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-full max-w-[440px]",
    card: "bg-[#111827] border border-[#253354] shadow-2xl",
    headerTitle: "text-white",
    headerSubtitle: "text-gray-400",
    socialButtonsBlockButton: "border-[#253354] bg-[#1e2d4d] text-white hover:bg-[#253354]",
    dividerLine: "bg-[#253354]",
    dividerText: "text-gray-400",
    formFieldLabel: "text-gray-300 font-medium",
    formFieldInput: "bg-[#1e2d4d] border-[#334d7a] text-white placeholder-gray-500 focus:border-blue-500",
    formButtonPrimary: "bg-[#1a56db] hover:bg-[#1e4bc4] text-white font-semibold",
    footerActionLink: "text-blue-400 hover:text-blue-300",
    identityPreviewText: "text-white",
    identityPreviewEditButton: "text-blue-400",
    otpCodeFieldInput: "!bg-[#1e2d4d] !border-[#334d7a] !border-2 !text-white !text-xl font-bold rounded-xl",
    otpCodeField: "gap-2",
    formResendCodeLink: "text-blue-400",
    alertText: "text-white",
    alert: "bg-red-500/10 border border-red-500/30",
    badge: "bg-[#1e2d4d] text-gray-300",
  },
};

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
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-destructive/20">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-white font-bold text-lg mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {this.state.error?.message ?? "An unexpected error occurred. Please reload the app."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/30">
            <span className="text-2xl font-black text-white">TC</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Trust Corp Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">Premium US Digital Banking</p>
        </div>
        {mode === "sign-in"
          ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
          : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/home" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <ErrorBoundary>
            <Component />
          </ErrorBoundary>
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-white text-center px-4">
          Clerk configuration missing.<br />
          Please add <code className="text-primary">VITE_CLERK_PUBLISHABLE_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={() => <AuthPage mode="sign-in" />} />
          <Route path="/sign-up/*?" component={() => <AuthPage mode="sign-up" />} />

          <Route path="/home"><ProtectedRoute component={Home} /></Route>
          <Route path="/activity"><ProtectedRoute component={Activity} /></Route>
          <Route path="/transfer"><ProtectedRoute component={Transfer} /></Route>
          <Route path="/cards"><ProtectedRoute component={Cards} /></Route>
          <Route path="/profile"><ProtectedRoute component={Profile} /></Route>
          <Route path="/exchange"><ProtectedRoute component={Exchange} /></Route>
          <Route path="/notifications"><ProtectedRoute component={Notifications} /></Route>
          <Route path="/kyc"><ProtectedRoute component={Kyc} /></Route>
          <Route path="/support"><ProtectedRoute component={Support} /></Route>

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
