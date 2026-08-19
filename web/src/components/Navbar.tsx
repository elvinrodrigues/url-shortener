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
    onSelectView('links');
  };

  return (
    <>
      {/* Mobile Dark Glass Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="mobile-menu-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.48)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 45,
            pointerEvents: 'auto',
            animation: 'fadeIn 0.18s ease forwards',
          }}
        />
      )}

      <div
        className="navbar-wrapper"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transition: 'padding 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingTop: `calc(${scrolled ? '0.65rem' : '1.15rem'} + env(safe-area-inset-top, 0px))`,
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Main Navbar Pill */}
        <header
          className="navbar-dock"
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
            transition: 'max-width 0.35s ease, background-color 0.3s ease',
            overflow: 'hidden',
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
              {/* Animated Floating Pill Background */}
              <div
                style={{
                  position: 'absolute',
                  top: '3px',
                  bottom: '3px',
                  left: 0,
                  transform: `translateX(${indicatorStyle.left}px)`,
                  width: `${indicatorStyle.width}px`,
                  backgroundColor: 'var(--dock-active-bg)',
                  borderRadius: '9999px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 0 12px rgba(255, 90, 0, 0.06)',
                  border: '1px solid var(--dock-active-border)',
                  transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
                  opacity: indicatorStyle.opacity,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />

              {/* Shorten tab */}
              <button
                ref={shortenTabRef}
                type="button"
                onClick={() => onSelectView('home')}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: currentView === 'home' ? 'var(--text-title)' : 'var(--text-muted)',
                  fontWeight: currentView === 'home' ? 700 : 500,
                  fontSize: '12.5px',
                  padding: '0.35rem 0.95rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'color 0.2s ease',
                }}
              >
                <Link2 size={13} color={currentView === 'home' ? '#FF5A00' : 'currentColor'} />
                <span>Shorten</span>
              </button>

              {/* Dashboard tab */}
              <button
                ref={dashboardTabRef}
                type="button"
                onClick={handleDashboardNav}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: currentView === 'links' ? 'var(--text-title)' : 'var(--text-muted)',
                  fontWeight: currentView === 'links' ? 700 : 500,
                  fontSize: '12.5px',
                  padding: '0.35rem 0.95rem',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'color 0.2s ease',
                }}
              >
                {token ? (
                  <LayoutDashboard size={13} color={currentView === 'links' ? '#FF5A00' : 'currentColor'} />
                ) : (
                  <Lock size={12} color={currentView === 'links' ? '#FF5A00' : 'var(--text-dim)'} />
                )}
                <span>Dashboard</span>
              </button>
            </nav>

            {/* Right Action Icons & Auth */}
            <div style={{ display: 'none', alignItems: 'center', gap: '0.65rem' }} className="desktop-actions">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle Theme"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  color: 'var(--text-muted)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-title)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>

              {/* Account / Sign In Button */}
              <button
                onClick={onOpenAuth}
                className="btn-pill-primary"
                style={{
                  padding: '0.42rem 0.95rem',
                  fontSize: '12.5px',
                }}
              >
                {currentUser?.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.name}
                    style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.4)' }}
                  />
                ) : (
                  <Key size={13} />
                )}
                <span>
                  {currentUser ? currentUser.name.split(' ')[0] : token ? 'Account' : 'Sign In'}
                </span>
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
        </header>

        {/* Mobile Dropdown Panel: Smooth sliding squircle glass card */}
        {mobileMenuOpen && (
          <div
            className="mobile-menu-panel"
            style={{
              pointerEvents: 'auto',
              width: '100%',
              maxWidth: scrolled ? '720px' : '900px',
              marginTop: '0.5rem',
              backgroundColor: 'var(--bg-dock-scrolled)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '1.25rem',
              boxShadow: 'var(--dock-shadow)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              padding: '0.85rem 1rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              animation: 'menuDropdownSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              zIndex: 50,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onSelectView('home');
              }}
              style={{
                fontSize: '13.5px',
                fontWeight: currentView === 'home' ? 700 : 500,
                color: currentView === 'home' ? '#FF5A00' : 'var(--text-title)',
                backgroundColor: currentView === 'home' ? 'var(--badge-orange-bg)' : 'transparent',
                textAlign: 'left',
                border: currentView === 'home' ? '1px solid var(--badge-orange-border)' : '1px solid transparent',
                borderRadius: '10px',
                padding: '0.65rem 0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <Link2 size={15} color={currentView === 'home' ? '#FF5A00' : 'var(--text-muted)'} />
              <span>Shorten Links</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handleDashboardNav();
              }}
              style={{
                fontSize: '13.5px',
                fontWeight: currentView === 'links' ? 700 : 500,
                color: currentView === 'links' ? '#FF5A00' : 'var(--text-title)',
                backgroundColor: currentView === 'links' ? 'var(--badge-orange-bg)' : 'transparent',
                textAlign: 'left',
                border: currentView === 'links' ? '1px solid var(--badge-orange-border)' : '1px solid transparent',
                borderRadius: '10px',
                padding: '0.65rem 0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <LayoutDashboard size={15} color={currentView === 'links' ? '#FF5A00' : 'var(--text-muted)'} />
              <span>Dashboard & Analytics</span>
            </button>

            <div style={{ paddingTop: '0.5rem', marginTop: '0.2rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="btn-pill-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '0.6rem 1rem',
                  fontSize: '13px',
                  borderRadius: '10px',
                }}
              >
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
                ) : (
                  <Key size={13} />
                )}
                <span>{currentUser ? currentUser.name : token ? 'Account' : 'Sign In'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 640px) {
          .desktop-nav { display: flex !important; }
          .desktop-actions { display: flex !important; }
          .mobile-toggle { display: none !important; }
        }
      `}</style>
    </>
  );
};
