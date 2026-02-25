import { type FormEvent, useMemo, useState } from 'react';
import { createAccount } from '../transport/createAccount';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

type FieldName = 'name' | 'email' | 'phone' | 'password' | 'confirmPassword';

export const useCreateAccountForm = (onSuccess: () => void) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+44');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
  });

  const phone = phoneLocal.trim() ? `${countryCode}${phoneLocal.trim().replace(/^0+/, '')}` : '';

  const validate = () => {
    const errors: Record<FieldName, string | undefined> = {
      name: undefined,
      email: undefined,
      phone: undefined,
      password: undefined,
      confirmPassword: undefined,
    };

    if (!name.trim()) errors.name = 'This field is required';

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) errors.email = 'This field is required';
    else if (!EMAIL_RE.test(normalizedEmail)) errors.email = 'Not a valid email address';

    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Not a valid phone number';

    if (!password) errors.password = 'This field is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters';

    if (!confirmPassword) errors.confirmPassword = 'This field is required';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';

    return errors;
  };

  const errors = useMemo(
    () => validate(),
    [name, email, phone, password, confirmPassword],
  );

  const visibleErrors = useMemo(() => {
    const output: Partial<Record<FieldName, string>> = {};
    (Object.keys(errors) as FieldName[]).forEach((key) => {
      if ((submitAttempted || touched[key]) && errors[key]) {
        output[key] = errors[key];
      }
    });
    return output;
  }, [errors, submitAttempted, touched]);

  const canSubmit = !Object.values(errors).some(Boolean) && !submitting;

  const markTouched = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setTouched({ name: true, email: true, phone: true, password: true, confirmPassword: true });
    setFormError(null);

    if (Object.values(errors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const result = await createAccount({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || undefined,
        password,
      });
      if (result.ok) {
        onSuccess();
      } else if (result.status === 409) {
        setFormError('Email already in use.');
      } else {
        setFormError('Unable to complete request. Please try again.');
      }
    } catch {
      setFormError('Unable to complete request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    name,
    email,
    countryCode,
    phoneLocal,
    password,
    confirmPassword,
    submitting,
    formError,
    visibleErrors,
    canSubmit,
    setName,
    setEmail,
    setCountryCode,
    setPhoneLocal,
    setPassword,
    setConfirmPassword,
    markTouched,
    submit,
  };
};
