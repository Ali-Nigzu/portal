import React from "react";

import { COUNTRY_PHONE_OPTIONS } from "../countryPhoneData";

type AuthPhoneFieldProps = {
  idPrefix: string;
  countryCode: string;
  localNumber: string;
  onCountryCodeChange: (value: string) => void;
  onLocalNumberChange: (value: string) => void;
  inputClassName?: string;
};

const AuthPhoneField: React.FC<AuthPhoneFieldProps> = ({
  idPrefix,
  countryCode,
  localNumber,
  onCountryCodeChange,
  onLocalNumberChange,
  inputClassName = "vrm-input",
}) => (
  <div className="auth-phone-row">
    <select
      id={`${idPrefix}-country`}
      className={`vrm-input auth-phone-country-select`}
      value={countryCode}
      onChange={(event) => onCountryCodeChange(event.target.value)}
    >
      {COUNTRY_PHONE_OPTIONS.map((option) => (
        <option key={`${option.iso2}-${option.dialCode}`} value={option.dialCode}>{option.iso2} ({option.dialCode})</option>
      ))}
    </select>
    <input
      id={`${idPrefix}-local`}
      className={inputClassName}
      autoComplete="tel"
      inputMode="tel"
      placeholder="Phone number"
      value={localNumber}
      onChange={(event) => onLocalNumberChange(event.target.value.replace(/[^\d]/g, ""))}
    />
  </div>
);

export default AuthPhoneField;
