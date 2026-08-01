import React from 'react';
import { Link2, Key, CheckCircle2, XCircle, Activity } from 'lucide-react';
import type { User } from './AuthModal';

interface HeaderProps {
  isHealthy: boolean | null;
  token: string;
  currentUser: User | null;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isHealthy, token, currentUser, onOpenAuth }) => {
  return (
    <header className="header-container">
      <div className="header-logo">
        <div className="logo-box">
          <Link2 size={18} className="text-accent" />
        </div>
        <div className="logo-text">
          <span className="logo-title">Slug</span>
          <span className="logo-badge font-mono">URL SHORTENER</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="health-indicator font-mono" title={isHealthy ? 'Backend operational' : 'Backend offline or unreachable'}>
          {isHealthy === true && (
            <>
              <span className="status-dot online"></span>
              <CheckCircle2 size={13} className="status-icon online" />
              <span>API ONLINE</span>
            </>
          )}
          {isHealthy === false && (
            <>
              <span className="status-dot offline"></span>
              <XCircle size={13} className="status-icon offline" />
              <span>OFFLINE</span>
            </>
          )}
          {isHealthy === null && (
            <>
              <Activity size={13} className="spinner text-accent" />
              <span>CHECKING...</span>
            </>
          )}
        </div>

        <button
          onClick={onOpenAuth}
          className={`auth-btn font-mono ${token ? 'authenticated' : ''}`}
          title={currentUser ? `Logged in as ${currentUser.name}` : (token ? 'JWT Token Active' : 'Set Auth Token')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {currentUser?.avatar_url ? (
            <img
              src={currentUser.avatar_url}
              alt={currentUser.name}
              style={{ width: '20px', height: '20px', borderRadius: '50%' }}
            />
          ) : (
            <Key size={14} />
          )}
          <span>
            {currentUser
              ? currentUser.name.split(' ')[0].toUpperCase()
              : (token ? 'TOKEN ACTIVE' : 'SIGN IN')}
          </span>
          <kbd className="cmd-kbd">⌘K</kbd>
        </button>
      </div>
    </header>
  );
};
