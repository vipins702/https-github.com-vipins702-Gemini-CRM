import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './Button';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDangerous ? 'bg-rose-100' : 'bg-blue-100'}`}>
            <AlertCircle className={`w-5 h-5 ${isDangerous ? 'text-rose-600' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1">{message}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            className={isDangerous ? '!bg-rose-600 hover:!bg-rose-700' : ''}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
