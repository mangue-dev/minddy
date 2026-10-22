"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { COARSE_HIT_AREA } from "./touch-target"

export interface SliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root> {
  label?: React.ReactNode
  valueLabel?: React.ReactNode
  tickCount?: number
}

type SliderThumbMetric = {
  offsetX: number
  offsetY: number
  progress: number
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  label,
  valueLabel,
  tickCount = 5,
  step = 1,
  orientation = "horizontal",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SliderProps) {
  const values = React.useMemo(
    () => value ?? defaultValue ?? [min],
    [value, defaultValue, min]
  )
  const resolvedDefaultValue = defaultValue ?? [min]
  const normalizedTickCount = Math.max(0, Math.floor(tickCount))
  const normalizedStep = Number.isFinite(step) && step > 0 ? step : 1
  const tickValues = Array.from(
    new Set(
      Array.from({ length: normalizedTickCount }, (_, index) => {
        const ratio = (index + 1) / (normalizedTickCount + 1)
        const rawValue = min + (max - min) * ratio
        const stepIndex = Math.round((rawValue - min) / normalizedStep)
        return Math.min(max, min + stepIndex * normalizedStep)
      })
    )
  ).filter((tickValue) => tickValue > min && tickValue < max)
  const thumbLabel =
    ariaLabel ?? (typeof label === "string" ? label : undefined)
  const thumbValueText =
    typeof valueLabel === "string" || typeof valueLabel === "number"
      ? String(valueLabel)
      : undefined
  const hasLabels = label !== undefined || valueLabel !== undefined
  const thumbRefs = React.useRef<
    Array<React.ComponentRef<typeof SliderPrimitive.Thumb> | null>
  >([])
  const trackRef = React.useRef<
    React.ComponentRef<typeof SliderPrimitive.Track> | null
  >(null)
  const labelRefs = React.useRef<Array<HTMLSpanElement | null>>([])
  const [overlappingThumbs, setOverlappingThumbs] = React.useState<boolean[]>(
    () => values.map(() => false)
  )
  const [thumbMetrics, setThumbMetrics] = React.useState<SliderThumbMetric[]>(
    () => values.map(() => ({ offsetX: 0, offsetY: 0, progress: 1 }))
  )

  React.useLayoutEffect(() => {
    const updateThumbState = () => {
      const track = trackRef.current
      const labels = labelRefs.current.filter(
        (label): label is HTMLSpanElement =>
          label !== null && label.getClientRects().length > 0
      )
      const nextOverlaps = thumbRefs.current
        .slice(0, values.length)
        .map((thumb) => {
          if (!thumb || thumb.getClientRects().length === 0) return false
          const thumbRect = thumb.getBoundingClientRect()
          return labels.some((label) => {
            const labelRect = label.getBoundingClientRect()
            return (
              thumbRect.left < labelRect.right &&
              thumbRect.right > labelRect.left &&
              thumbRect.top < labelRect.bottom &&
              thumbRect.bottom > labelRect.top
            )
          })
        })

      setOverlappingThumbs((current) =>
        current.length === nextOverlaps.length &&
        current.every((overlapping, index) => overlapping === nextOverlaps[index])
          ? current
          : nextOverlaps
      )

      if (!track) return
      const trackRect = track.getBoundingClientRect()
      const horizontal = orientation === "horizontal"
      const axisLength = horizontal ? trackRect.width : trackRect.height
      const crossLength = horizontal ? trackRect.height : trackRect.width
      const computedRadius = Number.parseFloat(
        getComputedStyle(track).borderTopLeftRadius
      )
      const radius = Math.max(
        0,
        Math.min(
          Number.isFinite(computedRadius) ? computedRadius : 0,
          crossLength / 2,
          axisLength / 2
        )
      )
      const nextMetrics = thumbRefs.current
        .slice(0, values.length)
        .map((thumb): SliderThumbMetric => {
          if (!thumb || thumb.getClientRects().length === 0) {
            return { offsetX: 0, offsetY: 0, progress: 1 }
          }

          const thumbRect = thumb.getBoundingClientRect()
          const startDistance = horizontal
            ? thumbRect.left - trackRect.left
            : thumbRect.top - trackRect.top
          const endDistance = horizontal
            ? trackRect.right - thumbRect.right
            : trackRect.bottom - thumbRect.bottom
          const nearestEdge = Math.min(startDistance, endDistance)
          const progress =
            radius > 0
              ? Math.max(0, Math.min(1, nearestEdge / (radius * 2)))
              : 1
          const halfHeight = 9 + progress
          const halfWidth = 2 + progress
          const curveExtent = horizontal ? halfHeight : halfWidth
          const curveInset =
            radius - Math.sqrt(Math.max(0, radius * radius - curveExtent * curveExtent))
          const requiredInset =
            curveInset + (horizontal ? halfWidth : halfHeight)
          const offset = requiredInset * (1 - progress)
          const nearStart = startDistance <= endDistance

          return {
            offsetX: horizontal ? (nearStart ? offset : -offset) : 0,
            offsetY: horizontal
              ? 0
              : nearStart
                ? -offset
                : offset,
            progress,
          }
        })

      setThumbMetrics((current) =>
        current.length === nextMetrics.length &&
        current.every((metric, index) => {
          const next = nextMetrics[index]
          return (
            Math.abs(metric.offsetX - next.offsetX) < 0.05 &&
            Math.abs(metric.offsetY - next.offsetY) < 0.05 &&
            Math.abs(metric.progress - next.progress) < 0.005
          )
        })
          ? current
          : nextMetrics
      )
    }

    const frame = requestAnimationFrame(updateThumbState)
    const observer = new ResizeObserver(updateThumbState)
    if (trackRef.current) observer.observe(trackRef.current)
    thumbRefs.current.forEach((thumb) => thumb && observer.observe(thumb))
    labelRefs.current.forEach((label) => label && observer.observe(label))
    window.addEventListener("pointermove", updateThumbState)
    window.addEventListener("resize", updateThumbState)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("pointermove", updateThumbState)
      window.removeEventListener("resize", updateThumbState)
    }
  }, [label, orientation, valueLabel, values])

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      orientation={orientation}
      defaultValue={resolvedDefaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      className={cn(
        "group/slider relative flex w-full touch-none items-center select-none data-horizontal:cursor-ew-resize data-vertical:cursor-ns-resize data-disabled:cursor-not-allowed data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        ref={trackRef}
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-2xl bg-control data-horizontal:h-11 data-horizontal:w-full data-vertical:h-full data-vertical:w-11 md:data-horizontal:h-9 md:data-vertical:w-9"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          // The filled part takes the account's accent (`--primary`, which the
          // theme presets recolor), tinted so the thumb and labels stay legible.
          className="absolute bg-primary/25 select-none data-horizontal:h-full data-vertical:w-full"
        />
        {hasLabels ? (
          <span
            data-slot="slider-labels"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-between px-3.5 text-base font-medium leading-none text-foreground data-vertical:hidden md:text-sm"
          >
            <span
              ref={(node) => {
                labelRefs.current[0] = node
              }}
            >
              {label}
            </span>
            <span
              ref={(node) => {
                labelRefs.current[1] = node
              }}
              className="tabular-nums"
            >
              {valueLabel}
            </span>
          </span>
        ) : null}
        {tickValues.length > 0 ? (
          <span
            data-slot="slider-ticks"
            aria-hidden="true"
            // Always shown: the notches say where the steps are before the
            // pointer gets there, and a phone has no hover to reveal them.
            className="pointer-events-none absolute inset-0 z-10 data-vertical:hidden"
          >
            {tickValues.map((tickValue) => (
              <span
                key={tickValue}
                className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/15"
                style={{
                  left: `${max === min ? 0 : ((tickValue - min) / (max - min)) * 100}%`,
                }}
              />
            ))}
          </span>
        ) : null}
      </SliderPrimitive.Track>
      {values.map((_, index) => {
        const metric = thumbMetrics[index] ?? {
          offsetX: 0,
          offsetY: 0,
          progress: 1,
        }
        const overlapsLabel = overlappingThumbs[index]
        const visualProgress = overlapsLabel ? 0 : metric.progress
        const hoverOpacity = overlapsLabel
          ? 0.4
          : 0.4 + visualProgress * 0.6

        return (
          <SliderPrimitive.Thumb
            ref={(node) => {
              thumbRefs.current[index] = node
            }}
            data-slot="slider-thumb"
            key={index}
            aria-label={thumbLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-valuetext={thumbValueText}
            className={`relative block h-4 w-0 shrink-0 border-0 bg-transparent outline-none ring-0 ${COARSE_HIT_AREA} focus-visible:[&>span]:ring-3 focus-visible:[&>span]:ring-ring/50 data-horizontal:cursor-ew-resize data-vertical:cursor-ns-resize data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-auto absolute top-1/2 left-1/2 z-10 block translate-x-[calc(-50%+var(--slider-thumb-offset-x,0px))] translate-y-[calc(-50%+var(--slider-thumb-offset-y,0px))] rounded-full bg-foreground opacity-40 scale-75 transition-[height,width,opacity,transform,scale] duration-150 before:absolute before:-inset-2 before:content-[''] group-hover/slider:scale-100 group-hover/slider:opacity-[var(--slider-thumb-hover-opacity,1)] group-active/slider:scale-100 group-active/slider:opacity-[var(--slider-thumb-hover-opacity,1)] group-focus-within/slider:scale-100 group-focus-within/slider:opacity-[var(--slider-thumb-hover-opacity,1)] app-mobile:scale-100 app-mobile:opacity-[var(--slider-thumb-hover-opacity,1)] pointer-coarse:scale-100 pointer-coarse:opacity-[var(--slider-thumb-hover-opacity,1)]"
              style={
                {
                  "--slider-thumb-offset-x": `${metric.offsetX}px`,
                  "--slider-thumb-offset-y": `${metric.offsetY}px`,
                  "--slider-thumb-hover-opacity": hoverOpacity,
                  height: `${18 + visualProgress * 2}px`,
                  width: `${4 + visualProgress * 2}px`,
                } as React.CSSProperties
              }
            />
          </SliderPrimitive.Thumb>
        )
      })}
    </SliderPrimitive.Root>
  )
}

export { Slider }
