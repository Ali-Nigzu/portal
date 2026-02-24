import { type FormEvent, useMemo, useState } from 'react';
import { createAccount } from '../transport/createAccount';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export const useCreateAccountForm = (onSuccess: () => void) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+44');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const phone = phoneLocal.trim() ? `${countryCode}${phoneLocal.trim().replace(/^0+/, '')}` : '';

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Enter your name.';
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) errors.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(normalizedEmail)) errors.email = 'Enter a valid email address.';
    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a valid phone number.';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  };

  const errors = useMemo(() => validate(), [name, email, phone, password, confirmPassword]);
  const canSubmit = Object.keys(errors).length === 0 && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

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
    fieldErrors,
    formError,
    canSubmit,
    setName,
    setEmail,
    setCountryCode,
    setPhoneLocal,
    setPassword,
    setConfirmPassword,
    submit,
  };
};
