import { forwardRef, type ComponentPropsWithoutRef } from "react";

type ProviderIconProps = ComponentPropsWithoutRef<"svg">;

/**
 * Brand marks for the supported git forges.
 *
 * Lucide v1 intentionally removed brand icons, so these stay local instead of
 * pretending that a generic source-control symbol identifies either service.
 */
export const Github = forwardRef<SVGSVGElement, ProviderIconProps>(
  function Github({ children, ...props }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        {...props}
      >
        {children}
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.82-.26.82-.577v-2.234c-3.338.726-4.033-1.417-4.033-1.417-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.605-2.665-.304-5.467-1.334-5.467-5.93 0-1.31.468-2.38 1.235-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.49 11.49 0 0 1 12 5.6c1.02.005 2.045.138 3.003.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.233 1.91 1.233 3.22 0 4.607-2.807 5.623-5.48 5.92.43.37.823 1.096.823 2.21v3.277c0 .32.216.694.825.576C20.565 21.796 24 17.3 24 12c0-6.627-5.373-12-12-12Z" />
      </svg>
    );
  },
);

export const Gitlab = forwardRef<SVGSVGElement, ProviderIconProps>(
  function Gitlab({ children, ...props }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        aria-hidden="true"
        {...props}
      >
        {children}
        <path fill="#FC6D26" d="M12 21.3 2.1 13.1 5 4.2h2.2L12 21.3Z" />
        <path fill="#E24329" d="M12 21.3 16.8 4.2H19l2.9 8.9L12 21.3Z" />
        <path fill="#FCA326" d="M5 4.2h14L12 21.3 5 4.2Z" />
        <path fill="#E24329" d="M12 21.3 5 4.2h14L12 21.3Z" opacity=".35" />
      </svg>
    );
  },
);
