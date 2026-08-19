import React, { useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const timerRef = useRef<number | null>(null);
  const remainingTimeRef = useRef<number>(toast.duration || 3200);
  const startTimeRef = useRef<number>(Date.now());

  const startTimer = (duration: number) => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
  };

  useEffect(() => {
    startTimer(remainingTimeRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id]);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(1000, remainingTimeRef.current - elapsed);
    }
  };

  const handleMouseLeave = () => {
    startTimer(remainingTimeRef.current);
  };

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div
      className="glass-panel toast-item"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.85rem 1rem',
        borderRadius: '0.85rem',
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${
          isSuccess
            ? 'rgba(34, 197, 94, 0.3)'
            : isError
            ? 'rgba(239, 68, 68, 0.3)'
            : 'rgba(255, 90, 0, 0.3)'
        }`,
        boxShadow: 'var(--dock-shadow)',
        animation: 'fadeSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ marginTop: '2px', flexShrink: 0 }}>
        {isSuccess && <CheckCircle2 size={18} color="#22C55E" />}
        {isError && <AlertCircle size={18} color="#EF4444" />}
        {!isSuccess && !isError && <Info size={18} color="#FF5A00" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-title)' }}>
          {toast.title}
        </div>
        {toast.message && (
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginTop: '2px',
              lineHeight: 1.4,
              wordBreak: 'break-all',
            }}
          >
            {toast.message}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        right: 'max(1.5rem, env(safe-area-inset-right, 0px))',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        maxWidth: '380px',
        width: 'calc(100% - 3rem)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
