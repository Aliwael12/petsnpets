import type { ReactNode } from 'react';
import { Button, Modal } from './ui';

/** A "this can't be undone" confirmation: says what goes, then a red button to do it. */
export function ConfirmDelete({
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm text-slate-600">
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
