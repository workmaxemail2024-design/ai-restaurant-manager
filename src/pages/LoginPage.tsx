import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { ChefHat, Loader2 } from 'lucide-react';

const authSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const validate = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0] === 'email') fieldErrors.email = e.message;
          if (e.path[0] === 'password') fieldErrors.password = e.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSignIn = async () => {
    if (!validate()) return;
    setIsLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
    } else {
      // Call ensure_user_restaurant after successful login
      const { error: ensureError } = await supabase.rpc('ensure_user_restaurant');
      if (ensureError) {
        console.error('Error ensuring user restaurant:', ensureError);
      }
      
      toast({ title: 'Welcome back!' });
      navigate('/');
    }
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setIsLoading(true);
    
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl }
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          title: 'Account exists',
          description: 'This email is already registered. Please sign in.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Sign up failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Check your email',
        description: 'We sent you a confirmation link. You may want to disable "Confirm email" in Supabase settings for faster testing.',
      });
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: 'signin' | 'signup') => {
    if (e.key === 'Enter') {
      if (action === 'signin') handleSignIn();
      else handleSignUp();
    }
  };

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
          <CardTitle className="text-2xl">RestaurantAI Manager</CardTitle>
          <CardDescription>Sign in to manage your restaurant operations</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin" className="space-y-4 mt-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'signin')}
                  placeholder="you@example.com"
                  disabled={isLoading}
                />
                {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'signin')}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-muted-foreground hover:text-primary mt-1 inline-block"
                >
                  Forgot Password?
                </Link>
              </div>
              <Button onClick={handleSignIn} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </TabsContent>
            
            <TabsContent value="signup" className="space-y-4 mt-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'signup')}
                  placeholder="you@example.com"
                  disabled={isLoading}
                />
                {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'signup')}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
              </div>
              <Button onClick={handleSignUp} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
