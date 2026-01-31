import { useCallback, useState } from "react";
import { registerInterest } from "../transport/registerInterest";

type RegisterInterestFormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
  business_type: string;
  message: string;
};

const defaultFormState: RegisterInterestFormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  business_type: "",
  message: "",
};

type UseRegisterInterestFormResult = {
  formData: RegisterInterestFormState;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string;
  setFormData: (data: RegisterInterestFormState) => void;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
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
        setSubmitError("Please fill in all required fields.");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setSubmitError("Please enter a valid email address.");
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await registerInterest(formData);
        if (result.ok) {
          setSubmitSuccess(true);
          setFormData(defaultFormState);
        } else {
          setSubmitError("Unable to submit form. Please try again.");
        }
      } catch (err) {
        setSubmitError("Connection error. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData],
  );

  return {
    formData,
    isSubmitting,
    submitSuccess,
    submitError,
    setFormData,
    handleSubmit,
  };
};
