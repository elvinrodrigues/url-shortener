import React, { useEffect, useState } from 'react';
import { X, Key, LogOut, User as UserIcon } from 'lucide-react';
import { API_BASE_URL, type User } from '../api.ts';

interface AuthModalProps {
  isOpen: boolean;
  currentToken: string;
  currentUser: User | null;
  onSaveAuth: (token: string, user: User | null) => void;
  onClose: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '522031681947-n509q6tl9f6k3ottib6h9ojir8lhh7jc.apps.googleusercontent.com';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  currentToken: _currentToken,
  currentUser,
  onSaveAuth,
  onClose,
  onShowToast,
}) => {
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || currentUser) return;

    const initGoogle = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });

        const btnDiv = document.getElementById('google-signin-btn-slug');
        if (btnDiv) {
          btnDiv.innerHTML = '';
          (window as any).google.accounts.id.renderButton(btnDiv, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            width: 280,
          });
        }
      }
    };

    const timer = setTimeout(initGoogle, 100);
    return () => clearTimeout(timer);
  }, [isOpen, currentUser]);

  const handleGoogleResponse = async (response: any) => {
    try {
      setError('');
      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: response.credential }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Google authentication failed');
      }

      const data = await res.json();
      onSaveAuth(data.token, data.user);
      onShowToast('Signed in successfully', `Welcome back, ${data.user.name}!`, 'success');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication error');
      onShowToast('Auth failed', err.message, 'error');
    }
  };

  const handleSignOut = () => {
    onSaveAuth('', null);
    onShowToast('Signed out', 'Returned to guest mode', 'info');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: '#0F0F12',
          borderRadius: '1.35rem',
          padding: '1.75rem',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 90, 0, 0.12)',
                color: '#FF5A00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Key size={16} />
            </div>
            <h3 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              Authentication
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {currentUser ? (
          <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.name}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  margin: '0 auto 0.85rem',
                  border: '2px solid #FF5A00',
                  boxShadow: '0 0 15px rgba(255, 90, 0, 0.35)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 90, 0, 0.12)',
                  color: '#FF5A00',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.85rem',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                }}
              >
                <UserIcon size={30} />
              </div>
            )}
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 0.25rem' }}>
              {currentUser.name}
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              {currentUser.email}
            </p>

            <button
              onClick={handleSignOut}
              className="btn-icon-action"
              style={{ width: '100%', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '0.65rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem', textAlign: 'left' }}>
              Sign in with your Google account to associate short links with your account and manage link analytics.
            </p>

            {/* Google Sign-in */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '1.25rem 0' }}>
              <div id="google-signin-btn-slug"></div>
            </div>

            {error && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#EF4444',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  textAlign: 'center',
                  marginBottom: '1rem',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
