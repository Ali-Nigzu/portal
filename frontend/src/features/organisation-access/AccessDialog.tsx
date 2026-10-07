import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./OrganisationAccess.css";
import "../settings/SettingsPages.css";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
};

export default function AccessDialog({
  title,
  description,
  children,
  onClose,
  busy = false,
}: Props) {
  const titleId = useId(),
    descriptionId = useId();
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose),
    submitting = useRef(busy);
  close.current = onClose;
  submitting.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && !element.contains(root.current),
    );
    const inert = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    const focusables = () =>
      [
        ...(root.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() =>
      (
        root.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        focusables()[0] ??
        root.current
      )?.focus(),
    );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!submitting.current) close.current();
      }
      if (event.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          root.current?.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !root.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node))
        (focusables()[0] ?? root.current)?.focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin);
      document.body.style.overflow = overflow;
      background.forEach((element, index) => {
        element.inert = inert[index];
      });
      if (previous?.isConnected) previous.focus();
      else
        document
          .querySelector<HTMLElement>(".authenticated-navigation__rail-trigger")
          ?.focus();
    };
  }, []);
  return createPortal(
    <div className="access-dialog-backdrop">
      <div
        ref={root}
        tabIndex={-1}
        className="vrm-card access-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy}
      >
        <div className="vrm-card-header">
          <h2 id={titleId} className="vrm-card-title">
            {title}
          </h2>
        </div>
        <div className="vrm-card-body access-dialog-body">
          {description && (
            <p id={descriptionId} className="access-description">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
