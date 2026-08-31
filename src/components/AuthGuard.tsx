import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AuthGuardProps {
  children: ReactNode;
}

/** After this long without a workspace we stop spinning and offer recovery. */
const SETUP_TIMEOUT_MS = 15000;

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, currentRestaurant, setupError, retrySetup, signOut } = useRestaurant();
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const waiting = !!user && !currentRestaurant;

  useEffect(() => {
    if (!waiting) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), SETUP_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  // Show loading state while checking auth
  if (isLoading && !setupError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if no user
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Setup failed (or is stuck): surface it instead of spinning forever
  if (!currentRestaurant && (setupError || timedOut)) {
    const handleRetry = async () => {
      setRetrying(true);
      setTimedOut(false);
      try {
        await retrySetup();
      } finally {
        setRetrying(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Workspace setup failed</h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t open a restaurant workspace for {user.email}. If you were invited,
              ask the owner to confirm the invitation is still pending for this email address.
            </p>
          </div>
          {setupError && (
            <p className="text-xs text-muted-foreground break-words rounded bg-muted p-2">
              {setupError}
            </p>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Try again
            </Button>
            <Button variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Wait for restaurant context to be ready
  if (!currentRestaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
