"use client"

import * as React from "react"
import { Spinner } from "./spinner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog"

/**
 * A confirmation dialog for a destructive action.
 *
 * Both button labels are REQUIRED and have no defaults. They used to default to
 * "Delete" / "Cancel", which was a trap in a localized app: a caller naturally
 * passes `confirmLabel` (the dangerous button is the one you think about) and
 * forgets `cancelLabel`, so the cancel button silently kept the English default
 * while the rest of the dialog was translated. Nothing failed — not the build,
 * not the type-check — and the bug shipped. Requiring both moves that omission
 * to compile time, where it belongs.
 */
export interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel: React.ReactNode
  onConfirm: () => void | Promise<void>
  isLoading?: boolean
  closeOnConfirm?: boolean
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isLoading: isLoadingProp,
  closeOnConfirm = true,
}: ConfirmDeleteDialogProps) {
  const [isPending, setIsPending] = React.useState(false)
  const isLoading = isLoadingProp ?? isPending

  async function handleConfirm(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    try {
      setIsPending(true)
      await onConfirm()
      if (closeOnConfirm) onOpenChange(false)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Spinner className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
