import React, { useEffect, useState } from 'react';
import { X, Key, LogOut, User as UserIcon } from 'lucide-react';
import { API_BASE_URL } from '../api';

export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
}

interface AuthModalProps {
  isOpen: boolean;
  currentToken: string;
  currentUser: User | null;
  onSaveAuth: (token: string, user: User | null) => void;
  onClose: () => void;
}

const GOOGLE_CLIENT_ID = '716971806941-d1qktup2q64pttiqr5knron4olf3kudj.apps.googleusercontent.com';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  currentToken: _currentToken,
  currentUser,
  onSaveAuth,
  onClose,
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

        const btnDiv = document.getElementById('google-signin-btn');
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
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    }
  };

  if (!isOpen) return null;

  const handleSignOut = () => {
    onSaveAuth('', null);
    onClose();
  };

  /*
    LOCAL TESTING HANDLER (Uncomment when manual token testing is needed):
    const [tokenInput, setTokenInput] = useState(currentToken);
    const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      onSaveAuth(tokenInput.trim(), currentUser);
      onClose();
    };
  */

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Key size={18} className="text-gradient" />
            <h3>Authentication</h3>
          </div>
          <button onClick={onClose} className="btn-close-modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {currentUser ? (
            <div className="user-profile-section" style={{ textAlign: 'center', padding: '1rem 0' }}>
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.name}
                  style={{ width: '64px', height: '64px', borderRadius: '50%', marginBottom: '0.75rem', border: '2px solid rgba(255,255,255,0.2)' }}
                />
              ) : (
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                  <UserIcon size={32} />
                </div>
              )}
              <h4 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 600 }}>{currentUser.name}</h4>
              <p style={{ margin: '0 0 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>{currentUser.email}</p>
              <button
                onClick={handleSignOut}
                className="btn-secondary-modal"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          ) : (
            <>
              <p className="modal-desc">
                Sign in with your Google account to associate short links with your account and manage link analytics.
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', margin: '1.25rem 0' }}>
                <div id="google-signin-btn"></div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.875rem', textAlign: 'center', marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

              {/* 
                LOCAL TESTING SECTION (Uncomment below to re-enable manual token input via go run ./cmd/gentoken)

                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem', margin: '1rem 0 0.75rem', fontWeight: 600 }} className="font-mono">
                  — OR MANUAL TOKEN —
                </div>

                <form onSubmit={handleSave}>
                  <div className="input-group">
                    <label htmlFor="jwt-token-input">Manual Bearer Token</label>
                    <textarea
                      id="jwt-token-input"
                      rows={3}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste manual JWT Bearer token here..."
                      className="token-textarea font-mono"
                    />
                  </div>

                  <div className="token-info-box" style={{ marginTop: '0.75rem' }}>
                    <Info size={16} />
                    <span>
                      Or generate a test token using <code>go run ./cmd/gentoken</code>.
                    </span>
                  </div>

                  <div className="modal-footer" style={{ marginTop: '1.25rem' }}>
                    {currentToken && (
                      <button type="button" onClick={handleSignOut} className="btn-secondary-modal">
                        Clear Auth
                      </button>
                    )}
                    <button type="submit" className="btn-primary-modal">
                      <ShieldCheck size={16} />
                      <span>Save Token</span>
                    </button>
                  </div>
                </form>
              */}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
