import * as React from "react"

import { Button } from "./button"

type ButtonProps = React.ComponentProps<typeof Button>
type ButtonVariant = ButtonProps["variant"]

export type IconButtonSize = "sm" | "default" | "lg"

const SIZE_MAP: Record<IconButtonSize, NonNullable<ButtonProps["size"]>> = {
  sm: "icon-sm",
  default: "icon",
  lg: "icon-lg",
}

export interface IconButtonProps
  extends Omit<ButtonProps, "size" | "variant"> {
  "aria-label": string
  size?: IconButtonSize
  variant?: ButtonVariant
}

export function IconButton({
  size = "default",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return <Button size={SIZE_MAP[size]} variant={variant} {...props} />
}
