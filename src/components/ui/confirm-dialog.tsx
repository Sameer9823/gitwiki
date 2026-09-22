"use client";
import * as React from "react";
import { Button } from "./button";
import { DialogContent } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  variant = "primary", loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <>
      <div className="dialog-overlay" onClick={() => !loading && onOpenChange(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="dialog-title">{title}</h2>
        <p className="dialog-description">{description}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => { onCancel?.(); onOpenChange(false); }} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant === "destructive" ? "destructive" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
