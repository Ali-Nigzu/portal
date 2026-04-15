import { useCallback, useState } from "react";
import { registerInterest } from "../transport/registerInterest";

type RegisterInterestFormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
};

const defaultFormState: RegisterInterestFormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
};

type UseRegisterInterestFormResult = {
  formData: RegisterInterestFormState;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string;
  setFormData: (data: RegisterInterestFormState) => void;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  resetSubmissionState: () => void;
};

export const useRegisterInterestForm = (): UseRegisterInterestFormResult => {
  const [formData, setFormData] = useState<RegisterInterestFormState>(
    defaultFormState,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSubmitError("");

      if (
        !formData.name.trim() ||
        !formData.email.trim() ||
        !formData.company.trim()
      ) {
        setSubmitError("Please complete all required fields.");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        setSubmitError("Please enter a valid work email.");
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await registerInterest(formData);
        if (result.ok) {
          setSubmitSuccess(true);
          setFormData(defaultFormState);
        } else {
          setSubmitError("Unable to submit sign-up. Please try again.");
        }
      } catch {
        setSubmitError("Unable to submit sign-up. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData],
  );

  const resetSubmissionState = useCallback(() => {
    setSubmitSuccess(false);
    setSubmitError("");
  }, []);

  return {
    formData,
    isSubmitting,
    submitSuccess,
    submitError,
    setFormData,
    handleSubmit,
    resetSubmissionState,
  };
};
