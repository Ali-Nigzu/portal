import { type FormEvent, useMemo, useState } from 'react';
import { signupStart } from '../transport/signupStart';
import { classifyOptionalPhoneInput, inferIsoFromPhoneText, PHONE_OPTION_BY_ISO, replaceDialCodeInPhoneText, sanitizePhoneText } from '../countryPhoneData';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

type FieldName = 'username' | 'email' | 'phone' | 'password' | 'confirmPassword';

export const useCreateAccountForm = (onSuccess: (email: string) => void) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [selectedIso, setSelectedIso] = useState('GB');
  const [phoneText, setPhoneText] = useState('+44');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    username: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
  });

  const phoneState = useMemo(() => classifyOptionalPhoneInput(phoneText, selectedIso), [phoneText, selectedIso]);
  const phone = phoneState.effectivePhone;

  const validate = () => {
    const errors: Record<FieldName, string | undefined> = {
      username: undefined,
      email: undefined,
      phone: undefined,
      password: undefined,
      confirmPassword: undefined,
    };

    if (!username.trim()) errors.username = 'This field is required';

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) errors.email = 'This field is required';
    else if (!EMAIL_RE.test(normalizedEmail)) errors.email = 'Not a valid email address';

    if (!phoneState.isEffectivelyEmpty && !PHONE_RE.test(phone)) errors.phone = 'Not a valid phone number';

    if (!password) errors.password = 'This field is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters';

    if (!confirmPassword) errors.confirmPassword = 'This field is required';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';

    return errors;
  };

  const errors = useMemo(
    () => validate(),
    [username, email, phone, password, confirmPassword, phoneState.isEffectivelyEmpty],
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
    setTouched({ username: true, email: true, phone: true, password: true, confirmPassword: true });
    setFormError(null);

    if (Object.values(errors).some(Boolean)) return;

    setSubmitting(true);
    try {
      const result = await signupStart({
        name: username.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || undefined,
        password,
      });
      if (result.ok) {
        onSuccess(result.data.email);
      } else if (result.status === 409) {
        setFormError('Email already in use.');
      } else if (result.status === 503) {
        setFormError(result.message || 'Email service is not configured.');
      } else if (result.status === 502) {
        setFormError(result.message || 'Failed to send verification email. Please try again.');
      } else {
        setFormError(result.message || 'Unable to complete request. Please try again.');
      }
    } catch {
      setFormError('Unable to complete request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };


  const handleSelectedIsoChange = (iso2: string) => {
    const option = PHONE_OPTION_BY_ISO.get(iso2);
    if (!option) {
      return;
    }
    setSelectedIso(iso2);
    setPhoneText((prev) => replaceDialCodeInPhoneText(prev, option.dialCode));
  };

  const handlePhoneTextChange = (value: string) => {
    const normalized = sanitizePhoneText(value);
    setPhoneText(normalized);

    const inferredIso = inferIsoFromPhoneText(normalized);
    if (inferredIso) {
      setSelectedIso(inferredIso);
    }
  };

  return {
    username,
    email,
    selectedIso,
    phoneText,
    password,
    confirmPassword,
    submitting,
    formError,
    visibleErrors,
    canSubmit,
    setUsername,
    setEmail,
    setSelectedIso: handleSelectedIsoChange,
    setPhoneText: handlePhoneTextChange,
    setPassword,
    setConfirmPassword,
    markTouched,
    submit,
  };
};
