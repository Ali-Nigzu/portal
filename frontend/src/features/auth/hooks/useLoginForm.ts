import { type FormEvent, useCallback, useState } from "react";
import { login } from "../transport/login";

type UseLoginFormResult = {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  handleSubmit: (event: FormEvent) => Promise<void>;
};

export const useLoginForm = (
  onLogin: () => void,
): UseLoginFormResult => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const result = await login(email, password);
        if (result.ok) {
          onLogin();
        } else if (result.status === 401) {
          setError("Invalid email or password");
        } else {
          setError("Unable to complete request. Please try again.");
        }
      } catch {
        setError("Unable to complete request. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, onLogin, password],
  );

  return {
    email,
    password,
    error,
    loading,
    setEmail,
    setPassword,
    handleSubmit,
  };
};
