"use client";

/**
 * In-app confirmation dialog.
 *
 * `window.confirm` is silently suppressed in some embedded browsers and
 * webviews (it returns false without showing anything), which made
 * destructive actions look broken. This renders our own <dialog> instead:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete match?", confirmLabel: "Delete", danger: true }))) return;
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    [],
  );

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (request && !el.open) el.showModal();
    if (!request && el.open) el.close();
  }, [request]);

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        onCancel={(e) => {
          // Escape key: treat as "cancel" and let React own the open state.
          e.preventDefault();
          settle(false);
        }}
        onClick={(e) => {
          // Clicking the backdrop (the dialog element itself, outside the panel) cancels.
          if (e.target === e.currentTarget) settle(false);
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-text shadow-card backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        {request && (
          <div className="space-y-4 p-5">
            <h2 id="confirm-title" className="text-lg font-semibold">
              {request.title}
            </h2>
            {request.body && <div className="text-sm text-muted">{request.body}</div>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => settle(false)} autoFocus>
                {request.cancelLabel ?? "Cancel"}
              </Button>
              <Button variant={request.danger ? "destructive" : "primary"} onClick={() => settle(true)}>
                {request.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
