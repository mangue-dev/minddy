import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ComponentType, CSSProperties, Ref, SVGProps } from "react";

/**
 * Any icon the app renders. Two shapes coexist during the icon-library
 * migration:
 *
 * - `IconSvgElement` — Hugeicons icon DATA (`@hugeicons/core-free-icons`),
 *   rendered through `HugeiconsIcon`.
 * - `IconComponent` — a React SVG component (Lucide icons, the bespoke
 *   design-supplied icons in `components/smart-icons.tsx`, the Numo face…),
 *   rendered directly.
 */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
export type AppIcon = IconSvgElement | IconComponent;

export interface AppIconProps {
  icon: AppIcon;
  className?: string;
  style?: CSSProperties;
  size?: number | string;
  strokeWidth?: number;
  ref?: Ref<SVGSVGElement>;
}

/** Render any `AppIcon` with one call site, whichever shape it is. */
export function AppIcon({
  icon,
  className,
  style,
  size,
  strokeWidth,
  ref,
}: AppIconProps) {
  if (!icon) return null;
  // Icon DATA is a tuple array; a component is either a function or a
  // forwardRef OBJECT (`$$typeof: react.forward_ref`), never an array.
  if (!Array.isArray(icon)) {
    const Component = icon as IconComponent;
    return (
      <Component
        ref={ref}
        className={className}
        style={style}
        width={size}
        height={size}
        strokeWidth={strokeWidth}
      />
    );
  }
  return (
    <HugeiconsIcon
      ref={ref}
      icon={icon}
      className={className}
      style={style}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}

/**
 * Bridge icon DATA into a React component, for contracts that render the icon
 * themselves as a component (mangue-ui `NavItem`, `CommandMenuItem`…).
 */
export function dataIcon(icon: IconSvgElement): IconComponent {
  const DataIcon = ({
    className,
    style,
    ref,
  }: {
    className?: string;
    style?: CSSProperties;
    ref?: Ref<SVGSVGElement>;
  }) => (
    <HugeiconsIcon ref={ref} icon={icon} className={className} style={style} />
  );
  DataIcon.displayName = "DataIcon";
  return DataIcon;
}
