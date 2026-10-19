"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"
import { COARSE_HIT_AREA, COARSE_TOUCH_ACTION } from "./touch-target"

const TRACK_WIDTH = 34
const TRACK_HEIGHT = 20
const THUMB_SIZE = 16
const THUMB_OFFSET = 2
const PILL_EXTEND = 2
const PRESS_EXTEND = 4
const PRESS_SHRINK = 4
const DRAG_DEAD_ZONE = 2

const THUMB_TRANSITION =
  "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), width 160ms cubic-bezier(0.16, 1, 0.3, 1), height 160ms cubic-bezier(0.16, 1, 0.3, 1)"

type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>

function getThumbPosition(
  isChecked: boolean,
  pressed: boolean,
  hovered: boolean
) {
  const thumbWidth = pressed
    ? THUMB_SIZE + PRESS_EXTEND
    : hovered
      ? THUMB_SIZE + PILL_EXTEND
      : THUMB_SIZE
  const thumbHeight = pressed ? THUMB_SIZE - PRESS_SHRINK : THUMB_SIZE
  const centerX = isChecked
    ? TRACK_WIDTH - THUMB_OFFSET - thumbWidth / 2
    : THUMB_OFFSET + thumbWidth / 2

  return {
    x: centerX - thumbWidth / 2,
    y: (TRACK_HEIGHT - thumbHeight) / 2,
    width: thumbWidth,
    height: thumbHeight,
  }
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      style,
      onClick,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerEnter,
      onPointerLeave,
      onLostPointerCapture,
      ...props
    },
    ref
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
    const [hovered, setHovered] = React.useState(false)
    const [pressed, setPressed] = React.useState(false)
    const isChecked = checked ?? internalChecked
    const thumb = getThumbPosition(isChecked, pressed, hovered)
    const [dragX, setDragX] = React.useState<number | null>(null)
    const thumbX = dragX ?? thumb.x
    const thumbXRef = React.useRef(thumbX)
    thumbXRef.current = thumbX
    const isDragging = dragX !== null
    const dragging = React.useRef(false)
    const didDrag = React.useRef(false)
    const pointerStart = React.useRef<{
      clientX: number
      originX: number
    } | null>(null)

    const setChecked = React.useCallback(
      (nextChecked: boolean) => {
        if (checked === undefined) {
          setInternalChecked(nextChecked)
        }
        onCheckedChange?.(nextChecked)
      },
      [checked, onCheckedChange]
    )

    const resetDragFlag = () => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          didDrag.current = false
        })
      } else {
        setTimeout(() => {
          didDrag.current = false
        }, 0)
      }
    }

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event)
      if (disabled || event.defaultPrevented) return
      if (event.pointerType === "mouse" && event.button !== 0) return

      setPressed(true)
      dragging.current = false
      setDragX(null)
      didDrag.current = false
      pointerStart.current = {
        clientX: event.clientX,
        originX: getThumbPosition(isChecked, true, hovered).x,
      }
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerMove?.(event)
      if (!pointerStart.current) return

      const delta = event.clientX - pointerStart.current.clientX
      if (!dragging.current && Math.abs(delta) < DRAG_DEAD_ZONE) return

      dragging.current = true
      const dragMin = getThumbPosition(false, true, false).x
      const dragMax = getThumbPosition(true, true, false).x
      const nextX = Math.max(
        dragMin,
        Math.min(
          dragMax,
          pointerStart.current.originX + delta
        )
      )
      thumbXRef.current = nextX
      setDragX(nextX)
    }

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (didDrag.current) {
        event.preventDefault()
      }
    }

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerUp?.(event)
      if (!pointerStart.current) return

      setPressed(false)
      setDragX(null)
      if (dragging.current) {
        didDrag.current = true
        dragging.current = false
        const currentX = thumbXRef.current
        const dragMin = getThumbPosition(false, true, false).x
        const dragMax = getThumbPosition(true, true, false).x
        const shouldBeOn = currentX > (dragMin + dragMax) / 2

        if (shouldBeOn !== isChecked) {
          setChecked(shouldBeOn)
        }
        resetDragFlag()
      }
      pointerStart.current = null
    }

    const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerCancel?.(event)
      if (!pointerStart.current) return

      const wasDragging = dragging.current
      setPressed(false)
      dragging.current = false
      setDragX(null)
      pointerStart.current = null
      if (wasDragging) {
        didDrag.current = true
        resetDragFlag()
      }
    }

    const handleLostPointerCapture = (
      event: React.PointerEvent<HTMLButtonElement>
    ) => {
      onLostPointerCapture?.(event)
      if (!pointerStart.current) return

      const wasDragging = dragging.current
      setPressed(false)
      dragging.current = false
      setDragX(null)
      pointerStart.current = null
      if (wasDragging) {
        didDrag.current = true
        resetDragFlag()
      }
    }

    return (
      <SwitchPrimitive.Root
        ref={ref}
        data-slot="switch"
        checked={isChecked}
        disabled={disabled}
        onCheckedChange={setChecked}
        className={cn(
          `peer relative inline-flex h-5 w-[34px] shrink-0 cursor-pointer touch-none select-none items-center rounded-full border-0 bg-control transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary-hover data-[state=unchecked]:hover:bg-control-hover ${COARSE_TOUCH_ACTION} ${COARSE_HIT_AREA}`,
          className
        )}
        style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT, ...style }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerEnter={(event) => {
          onPointerEnter?.(event)
          if (event.pointerType === "mouse") setHovered(true)
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event)
          setHovered(false)
        }}
        onLostPointerCapture={handleLostPointerCapture}
        {...props}
      >
        <SwitchPrimitive.Thumb asChild>
          <span
            data-slot="switch-thumb"
            className="pointer-events-none absolute left-0 top-0 block h-4 w-4 rounded-full bg-card shadow-sm dark:bg-foreground data-[state=checked]:bg-primary-foreground dark:data-[state=checked]:bg-primary-foreground"
            style={{
              width: thumb.width,
              height: thumb.height,
              transform: `translate3d(${thumbX}px, ${thumb.y}px, 0)`,
              transition: isDragging ? "none" : THUMB_TRANSITION,
            }}
          />
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
export type { SwitchProps }
