import React, { useState, useEffect, useRef } from 'react';
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

  // Tab indicator tracking for ultra-smooth sliding animation
  const shortenTabRef = useRef<HTMLButtonElement>(null);
  const dashboardTabRef = useRef<HTMLButtonElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 3,
    width: 80,
    opacity: 0,
  });

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = currentView === 'home' ? shortenTabRef.current : dashboardTabRef.current;
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
          opacity: 1,
        });
      }
    };

    updateIndicator();
    // Re-measure on window resize
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [currentView, token]);

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
    setDarkMode((prev) => !prev);
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
          backgroundColor: scrolled ? 'var(--bg-dock-scrolled)' : 'var(--bg-dock)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--dock-shadow)',
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
                  backgroundColor: 'rgba(255, 90, 0, 0.12)',
                  border: '1px solid rgba(255, 90, 0, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF5A00',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 0 10px rgba(255, 90, 0, 0.2)',
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
                    color: 'var(--text-title)',
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
              backgroundColor: 'var(--bg-input)',
              borderRadius: '9999px',
              padding: '3px',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
            className="desktop-nav"
          >
            {/* Ultra-Smooth Animated Sliding Pill Indicator */}
            <div
              style={{
                position: 'absolute',
                top: '3px',
                bottom: '3px',
                left: 0,
                transform: `translateX(${indicatorStyle.left}px)`,
                width: `${indicatorStyle.width}px`,
                opacity: indicatorStyle.opacity,
                backgroundColor: 'var(--dock-active-bg)',
                border: '1px solid var(--dock-active-border)',
                borderRadius: '9999px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />

            {/* Sliding Pill Tab 1: Shorten */}
            <button
              ref={shortenTabRef}
              type="button"
              onClick={() => onSelectView('home')}
              style={{
                position: 'relative',
                zIndex: 2,
                fontSize: '12px',
                fontWeight: currentView === 'home' ? 700 : 500,
                color: currentView === 'home' ? 'var(--text-title)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 13px',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Link2 size={12} />
              <span>Shorten</span>
            </button>

            {/* Sliding Pill Tab 2: Dashboard */}
            <button
              ref={dashboardTabRef}
              type="button"
              onClick={handleDashboardNav}
              style={{
                position: 'relative',
                zIndex: 2,
                fontSize: '12px',
                fontWeight: currentView === 'links' ? 700 : 500,
                color: currentView === 'links' ? 'var(--text-title)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 13px',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
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
                padding: '6px',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
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
                  ? 'Account'
                  : 'Sign In'}
              </span>
              <kbd
                className="font-mono"
                style={{
                  fontSize: '8.5px',
                  padding: '1px 3.5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
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
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
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
                {currentUser ? currentUser.name : token ? 'Account' : 'Sign In'}
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
