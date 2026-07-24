import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ErrorCode } from "@reactify/shared";
import { AuthApiError, signInAccount } from "./authApi";
import { AuthField, AuthForm } from "./AuthForm";
import { AuthLayout } from "./AuthLayout";
import { useAuthStore } from "./authStore";

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit() {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await signInAccount({ email, password });
      setUser(result.user, result.sessionExpiresAt ?? null);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === ErrorCode.INVALID_CREDENTIALS) {
        setErrorMessage("Invalid email or password.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Access your Reactify projects securely.">
      <AuthForm submitLabel="Sign in" onSubmit={() => handleSubmit()} errorMessage={errorMessage} isSubmitting={isSubmitting}>
        <AuthField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      </AuthForm>
      <p className="mt-4 text-center text-sm text-slate-300">
        Need an account?{" "}
        <Link to="/register" className="font-medium text-indigo-300 hover:text-indigo-200">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
