"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
} from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed:
    "Le lien de confirmation est invalide ou expiré. Réessaie de te connecter.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithPassword, signUpWithPassword } = useAuth();

  const redirectTo = sanitizeInternalRedirectPath(searchParams.get("redirect"));
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    AUTH_ERROR_MESSAGES[searchParams.get("error") ?? ""] ?? null
  );
  const [notice, setNotice] = useState<string | null>(null);

  // Already authenticated (e.g. session restored) → leave the auth screen.
  useEffect(() => {
    if (user) router.replace(redirectTo);
  }, [user, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (isSignUp && password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { requiresEmailConfirmation } = await signUpWithPassword(
          email,
          password,
          { redirectAfter: redirectTo }
        );
        if (requiresEmailConfirmation) {
          setNotice(
            `On t'a envoyé un lien de confirmation à ${email}. Clique dessus pour activer ton compte.`
          );
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
          return;
        }
      } else {
        await signInWithPassword(email, password);
      }
      router.push(redirectTo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp((v) => !v);
    setError(null);
    setNotice(null);
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-tight">minddy</CardTitle>
        <CardDescription>
          {isSignUp ? "Crée ton compte pour commencer." : "Connecte-toi à ton compte."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Confirme le mot de passe
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {loading && <Spinner />}
            {isSignUp ? "Créer mon compte" : "Se connecter"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
          <button
            type="button"
            onClick={toggleMode}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {isSignUp ? "Se connecter" : "Créer un compte"}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner className="size-6" />}>
      <LoginForm />
    </Suspense>
  );
}
