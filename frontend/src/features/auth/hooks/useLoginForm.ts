import { useCallback, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import { deriveOrgIdFromTableName, determineOrgId } from "../../../lib/org";
import { login } from "../transport/login";

type UseLoginFormResult = {
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
};

export const useLoginForm = (
  onLogin: (credentials: Credentials) => void,
): UseLoginFormResult => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const result = await login(username, password);
        if (result.ok) {
          const orgFromResponse =
            result.data?.user?.orgId ??
            result.data?.user?.org_id ??
            deriveOrgIdFromTableName(result.data?.user?.table_name);
          onLogin({
            username,
            password,
            orgId: orgFromResponse ?? determineOrgId({ username }),
          });
        } else if (result.status === 401) {
          setError("Invalid username or password");
        } else {
          setError("Connection error. Please try again.");
        }
      } catch (err) {
        setError("Unable to connect to server");
      } finally {
        setLoading(false);
      }
    },
    [onLogin, password, username],
  );

  return {
    username,
    password,
    error,
    loading,
    setUsername,
    setPassword,
    handleSubmit,
  };
};
