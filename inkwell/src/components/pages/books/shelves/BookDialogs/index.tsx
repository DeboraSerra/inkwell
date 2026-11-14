import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type React from "react";

// With `formId`, the confirm button submits that form (passed in as
// children) and the form decides when to close, so a rejected save keeps the
// dialog open with what was typed. Without it, the button closes the dialog
// and calls `onConfirm`.
export const BookDialog = ({
  open,
  onOpenChange,
  heading,
  description,
  onConfirm,
  confirmText,
  btnVariant = "default",
  children,
  formId,
  btnDisabled = false,
}: Readonly<{
  open: boolean;
  onOpenChange: (val: boolean) => void;
  heading: React.ReactNode;
  description: React.ReactNode;
  onConfirm?: () => void;
  confirmText: string;
  btnVariant?: "default" | "outline" | "ghost" | "destructive" | "link";
  children?: React.ReactNode;
  formId?: string;
  btnDisabled?: boolean;
}>) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="sticky -bottom-4 bg-popover">
          {/* The footer is outside the form, so the `form` attribute ties
              the button to it. */}
          <Button
            variant={btnVariant}
            type={formId ? "submit" : "button"}
            form={formId}
            onClick={
              formId
                ? undefined
                : () => {
                    onOpenChange(false);
                    onConfirm?.();
                  }
            }
            disabled={btnDisabled}
          >
            {confirmText}
          </Button>
          <DialogClose render={<Button variant='outline'>Cancel</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
