import React, { useEffect, useRef } from 'react';

interface ModalShellProps {
  children: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onClose?: () => void;
  dismissible?: boolean;
  variant?: 'center' | 'drawer';
  backdropClassName?: string;
  zIndexClassName?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Shared accessible dialog wrapper:
 * - Declares role="dialog" + aria-modal="true"
 * - Captures initial focus and traps Tab / Shift+Tab inside the overlay
 * - Restores focus to the triggering element on unmount
 * - Handles Escape & optional backdrop dismissal cleanly
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  children,
  ariaLabel,
  ariaLabelledBy,
  onClose,
  dismissible = true,
  variant = 'center',
  backdropClassName,
  zIndexClassName = 'z-40',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root = containerRef.current;
    if (root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      } else {
        root.focus({ preventScroll: true });
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible && onCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const container = containerRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !container.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [dismissible]);

  const layoutClass =
    variant === 'drawer'
      ? `fixed inset-0 ${zIndexClassName} flex justify-end ${backdropClassName ?? 'bg-[#080605]/58'}`
      : `fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 ${backdropClassName ?? 'bg-[#080605]/68'}`;

  return (
    <div
      className={layoutClass}
      onMouseDown={(e) => {
        if (dismissible && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={
          variant === 'drawer'
            ? 'w-full max-w-lg h-full outline-none flex justify-end'
            : 'w-full flex items-center justify-center outline-none pointer-events-none [&>*]:pointer-events-auto'
        }
      >
        {children}
      </div>
    </div>
  );
};
