import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { ChefHat, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const initializeRecoverySession = async () => {
      try {
        // Attempt to get the session - Supabase client automatically handles
        // recovery tokens from the URL hash fragment
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          setSessionError('This reset link is invalid or expired. Please request a new one.');
          return;
        }

        if (!session) {
          // No session found - likely direct access or expired link
          setSessionError('This reset link is invalid or expired. Please request a new one.');
          return;
        }

        // Valid recovery session exists
        setSessionError(null);
      } catch (err) {
        console.error('Error initializing recovery session:', err);
        setSessionError('An error occurred. Please try again.');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeRecoverySession();

    // Listen for auth state changes (handles the SIGNED_IN event from recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Recovery session established
        setSessionError(null);
        setIsInitializing(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      passwordSchema.parse({ password, confirmPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: { password?: string; confirmPassword?: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0] === 'password') fieldErrors.password = e.message;
          if (e.path[0] === 'confirmPassword') fieldErrors.confirmPassword = e.message;
        });
        setErrors(fieldErrors);
      }
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Password updated successfully',
        description: 'Please log in with your new password.',
      });
      // Sign out and redirect to login
      await supabase.auth.signOut();
      navigate('/login');
    }
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />
        <Card className="w-full max-w-md relative z-10">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verifying reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state if session is invalid
  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />
        <Card className="w-full max-w-md relative z-10">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
            <CardDescription>{sessionError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Request New Reset Link
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background glow effect */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(30_100%_50%_/_0.08),_transparent_50%)] pointer-events-none" />

      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <ChefHat className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
            </div>
            <div>
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive mt-1">{errors.confirmPassword}</p>
              )}
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
