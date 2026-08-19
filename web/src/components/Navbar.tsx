import React, { useState, useEffect } from 'react';
import { Moon, Sun, Menu, X, LayoutDashboard, Link2, Key, Lock } from 'lucide-react';
import { type User } from '../api.ts';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  token: string;
  currentUser: User | null;
  isHealthy: boolean | null;
  currentView: 'home' | 'links';
  onSelectView: (view: 'home' | 'links') => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  setDarkMode,
  token,
  currentUser,
  isHealthy,
  currentView,
  onSelectView,
  onOpenAuth,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 25);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Global CMD+K / CTRL+K shortcut to open Auth Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenAuth();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenAuth]);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('slug-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };

  const handleDashboardNav = () => {
    if (token) {
      onSelectView('links');
    } else {
      onOpenAuth();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: 'padding 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        paddingTop: scrolled ? '0.75rem' : '1.25rem',
        paddingLeft: '1.25rem',
        paddingRight: '1.25rem',
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <header
        style={{
          pointerEvents: 'auto',
          margin: '0 auto',
          maxWidth: scrolled ? '720px' : '900px',
          width: '100%',
          borderRadius: '9999px',
          backgroundColor: scrolled
            ? 'rgba(15, 15, 18, 0.88)'
            : 'rgba(15, 15, 18, 0.45)',
          border: `1px solid ${
            scrolled
              ? 'rgba(255, 255, 255, 0.2)'
              : 'var(--border-subtle)'
          }`,
          boxShadow: scrolled
            ? '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 25px rgba(255, 255, 255, 0.08)'
            : '0 2px 10px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            padding: scrolled ? '0 1rem 0 0.85rem' : '0 1.25rem 0 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: scrolled ? '52px' : '58px',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Brand Logo & API Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => onSelectView('home')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                textDecoration: 'none',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {/* Brand Icon Box */}
              <div
                style={{
                  width: scrolled ? '26px' : '28px',
                  height: scrolled ? '26px' : '28px',
                  borderRadius: '7px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF5A00',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 0 10px rgba(255, 90, 0, 0.25)',
                }}
              >
                <Link2 size={scrolled ? 14 : 15} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span
                  className="font-display"
                  style={{
                    fontSize: scrolled ? '17px' : '18px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    letterSpacing: '-0.02em',
                    transition: 'font-size 0.3s ease',
                  }}
                >
                  Slug
                </span>
                <span style={{ color: '#FF5A00', fontWeight: 900, fontSize: scrolled ? '17px' : '18px' }}>.</span>
              </div>
            </button>

            {/* Backend Health Badge */}
            {isHealthy !== null && (
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  backgroundColor: isHealthy ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: isHealthy ? '#22C55E' : '#EF4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  border: `1px solid ${isHealthy ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)'}`,
                }}
                title={isHealthy ? 'Go Backend Online' : 'Backend Offline'}
              >
                <span
                  style={{
                    width: '4.5px',
                    height: '4.5px',
                    borderRadius: '50%',
                    backgroundColor: isHealthy ? '#22C55E' : '#EF4444',
                    boxShadow: isHealthy ? '0 0 6px #22C55E' : 'none',
                  }}
                />
                <span className="font-mono">{isHealthy ? 'API ONLINE' : 'OFFLINE'}</span>
              </span>
            )}
          </div>

          {/* Seamless Center Dock Segmented Switcher */}
          <nav
            style={{
              display: 'none',
              alignItems: 'center',
              position: 'relative',
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              borderRadius: '9999px',
              padding: '3px',
              border: '1px solid var(--border-subtle)',
            }}
            className="desktop-nav"
          >
            {/* Sliding Pill Tab 1: Shorten */}
            <button
              type="button"
              onClick={() => onSelectView('home')}
              style={{
                position: 'relative',
                zIndex: 2,
                fontSize: '12px',
                fontWeight: currentView === 'home' ? 700 : 500,
                color: currentView === 'home' ? '#FFFFFF' : 'var(--text-muted)',
                backgroundColor: currentView === 'home' ? 'var(--dock-active-bg)' : 'transparent',
                border: currentView === 'home' ? '1px solid var(--dock-active-border)' : '1px solid transparent',
                borderRadius: '9999px',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: currentView === 'home' ? '0 2px 8px rgba(0, 0, 0, 0.4)' : 'none',
              }}
            >
              <Link2 size={12} />
              <span>Shorten</span>
            </button>

            {/* Sliding Pill Tab 2: Dashboard */}
            <button
              type="button"
              onClick={handleDashboardNav}
              style={{
                position: 'relative',
                zIndex: 2,
                fontSize: '12px',
                fontWeight: currentView === 'links' ? 700 : 500,
                color: currentView === 'links' ? '#FFFFFF' : 'var(--text-muted)',
                backgroundColor: currentView === 'links' ? 'var(--dock-active-bg)' : 'transparent',
                border: currentView === 'links' ? '1px solid var(--dock-active-border)' : '1px solid transparent',
                borderRadius: '9999px',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: currentView === 'links' ? '0 2px 8px rgba(0, 0, 0, 0.4)' : 'none',
              }}
            >
              {token ? <LayoutDashboard size={12} /> : <Lock size={11} color="#FF5A00" />}
              <span>Dashboard</span>
            </button>
          </nav>

          {/* Desktop Right Actions */}
          <div
            style={{
              display: 'none',
              alignItems: 'center',
              gap: '0.65rem',
            }}
            className="desktop-actions"
          >
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Auth Pill Button: Vibrant Orange */}
            <button
              onClick={onOpenAuth}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'var(--theme-primary-gradient)',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '9999px',
                padding: scrolled ? '0.3rem 0.65rem 0.3rem 0.55rem' : '0.35rem 0.75rem 0.35rem 0.65rem',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 14px var(--theme-orange-glow)',
                transition: 'all 0.3s ease',
              }}
            >
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
              ) : (
                <Key size={11} />
              )}
              <span>
                {currentUser
                  ? currentUser.name.split(' ')[0]
                  : token
                  ? 'Elvin'
                  : 'Sign In'}
              </span>
              <kbd
                className="font-mono"
                style={{
                  fontSize: '8.5px',
                  padding: '1px 3.5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  color: '#FFFFFF',
                  letterSpacing: '0.04em',
                }}
              >
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Mobile toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} className="mobile-toggle">
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Open Menu"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectView('home');
              }}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: currentView === 'home' ? '#FF5A00' : 'var(--text-main)',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '0.25rem 0',
                cursor: 'pointer',
              }}
            >
              Shorten Link
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleDashboardNav();
              }}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: currentView === 'links' ? '#FF5A00' : 'var(--text-main)',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '0.25rem 0',
                cursor: 'pointer',
              }}
            >
              Dashboard (All Links)
            </button>
            <div style={{ paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="btn-pill-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.45rem' }}
              >
                {currentUser ? currentUser.name : token ? 'Elvin' : 'Sign In'}
              </button>
            </div>
          </div>
        )}
      </header>

      <style>{`
        @media (min-width: 640px) {
          .desktop-nav { display: flex !important; }
          .desktop-actions { display: flex !important; }
          .mobile-toggle { display: none !important; }
        }
      `}</style>
    </div>
  );
};
