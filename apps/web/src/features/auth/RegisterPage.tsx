import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorCode } from "@reactify/shared";
import { AuthApiError, registerAccount } from "./authApi";
import { AuthField, AuthForm, AuthHelpText } from "./AuthForm";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./useSession.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const { completeSignIn } = useSession();
  const passwordHelpId = useId();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 12) {
      setErrorMessage("Password must be at least 12 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerAccount({ email, password, displayName });
      completeSignIn(result.user, result.sessionExpiresAt ?? null);
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.code === ErrorCode.EMAIL_ALREADY_REGISTERED) {
        setErrorMessage("An account with this email already exists.");
      } else if (error instanceof AuthApiError && error.code === ErrorCode.INVALID_PASSWORD) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Registration failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Register to save and manage your generations.">
      <AuthForm submitLabel="Create account" onSubmit={() => handleSubmit()} errorMessage={errorMessage} isSubmitting={isSubmitting}>
        <AuthField id="displayName" label="Display name" value={displayName} onChange={setDisplayName} autoComplete="name" />
        <AuthField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          describedBy={passwordHelpId}
        />
        <AuthHelpText id={passwordHelpId}>Use at least 12 characters. Passphrases and password-manager strings are welcome.</AuthHelpText>
        <AuthField id="confirmPassword" label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
      </AuthForm>
      <p className="mt-4 text-center text-sm text-slate-300">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-medium text-indigo-300 hover:text-indigo-200">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
