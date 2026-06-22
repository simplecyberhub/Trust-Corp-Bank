import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, SignUp, Show } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

import { Layout } from "@/components/layout";
import { Home } from "@/pages/home";
import { Activity } from "@/pages/activity";
import { Transfer } from "@/pages/transfer";
import { Cards } from "@/pages/cards";
import { Profile } from "@/pages/profile";
import { Exchange } from "@/pages/exchange";
import { Notifications } from "@/pages/notifications";
import { Kyc } from "@/pages/kyc";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
    colorInputBackground: "#1a2236",
    colorInputText: "#ffffff",
    colorNeutral: "#6b7280",
    borderRadius: "0.75rem",
    fontSize: "15px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-full max-w-[440px]",
    card: "bg-[#111827] border border-[#1f2d4a] shadow-2xl",
    headerTitle: "text-white",
    headerSubtitle: "text-gray-400",
    socialButtonsBlockButton: "border-[#1f2d4a] bg-[#1a2236] text-white hover:bg-[#1f2d4a]",
    dividerLine: "bg-[#1f2d4a]",
    formFieldLabel: "text-gray-300",
    formFieldInput: "bg-[#1a2236] border-[#1f2d4a] text-white",
    footerActionLink: "text-blue-400",
  },
};

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
          <Component />
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
        <p className="text-white text-center px-4">Clerk configuration missing.<br />Please add <code className="text-primary">VITE_CLERK_PUBLISHABLE_KEY</code>.</p>
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
