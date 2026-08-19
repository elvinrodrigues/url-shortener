import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { LiveDashboard } from './components/LiveDashboard.tsx';
import { AllLinksView } from './components/AllLinksView.tsx';
import { Footer } from './components/Footer.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { StatsModal } from './components/StatsModal.tsx';
import { QRCodeModal } from './components/QRCodeModal.tsx';
import { CursorGlow } from './components/CursorGlow.tsx';
import { NotFound } from './components/NotFound.tsx';
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import {
  checkHealth,
  getUserURLs,
  API_BASE_URL,
  type User,
  type HistoryItem,
  type CreateURLResponse,
  type URLStats,
} from './api.ts';
import { type LinkItemData } from './components/LinkCard.tsx';

export const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('slug-theme');
    if (saved) return saved === 'dark';
    return true; // Default dark
  });

  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem('slug_jwt_token') || '');
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('slug_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Current view state ('home' = creator + top 5 links, 'links' = dedicated /dashboard)
  const [currentView, setCurrentView] = useState<'home' | 'links'>(() => {
    const pathname = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (pathname === '/dashboard' || pathname === '/links' || hash === '#dashboard' || hash === '#links') {
      return 'links';
    }
    return 'home';
  });

  const [userLinks, setUserLinks] = useState<URLStats[]>([]);
  const [guestHistory, setGuestHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('slug_guest_history');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [selectedStatsCode, setSelectedStatsCode] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<{ url: string; code: string }>({ url: '', code: '' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 404 Routing state
  const [notFoundState, setNotFoundState] = useState<{ is404: boolean; code: string; isExpired: boolean }>({
    is404: false,
    code: '',
    isExpired: false,
  });

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((title: string, message?: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Sync browser URL & history with view state (HTML5 pushState / popstate)
  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (pathname === '/dashboard' || pathname === '/links' || hash === '#dashboard' || hash === '#links') {
        setCurrentView('links');
      } else {
        setCurrentView('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Fetch user links when token is available
  useEffect(() => {
    if (!token) {
      setUserLinks([]);
      return;
    }
    const loadLinks = async () => {
      try {
        const data = await getUserURLs(token);
        setUserLinks(data || []);
      } catch (err: any) {
        if (err.message && (err.message.includes('expired') || err.message.includes('401'))) {
          setToken('');
          setUser(null);
          localStorage.removeItem('slug_jwt_token');
          localStorage.removeItem('slug_user');
          setUserLinks([]);
        }
      }
    };
    loadLinks();
  }, [token, refreshTrigger]);

  // Handle path routing for short codes and health
  useEffect(() => {
    const pathname = window.location.pathname;
    const pathCode = pathname.substring(1).trim();

    // Reserved paths for client app
    const isClientRoute = !pathCode || pathCode === 'dashboard' || pathCode === 'links' || pathCode === 'auth' || pathCode === 'stats';

    if (!isClientRoute && !pathCode.includes('.')) {
      const testLink = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/${encodeURIComponent(pathCode)}`, {
            method: 'GET',
            redirect: 'manual',
          });

          if (res.status === 404) {
            setNotFoundState({ is404: true, code: pathCode, isExpired: false });
            return;
          }
          if (res.status === 410) {
            setNotFoundState({ is404: true, code: pathCode, isExpired: true });
            return;
          }

          window.location.href = `${API_BASE_URL}/${pathCode}`;
        } catch {
          setNotFoundState({ is404: true, code: pathCode, isExpired: false });
        }
      };

      testLink();
      return;
    }

    const verifyHealth = async () => {
      const healthy = await checkHealth();
      setIsHealthy(healthy);
    };
    verifyHealth();
    const interval = setInterval(verifyHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAuth = (newToken: string, newUser: User | null) => {
    setToken(newToken);
    setUser(newUser);

    if (newToken) {
      localStorage.setItem('slug_jwt_token', newToken);
    } else {
      localStorage.removeItem('slug_jwt_token');
      setUserLinks([]); // Clear account links on logout
    }

    if (newUser) {
      localStorage.setItem('slug_user', JSON.stringify(newUser));
    } else {
      localStorage.removeItem('slug_user');
    }

    setRefreshTrigger((prev) => prev + 1);
  };

  const handleShortenSuccess = (
    res: CreateURLResponse,
    originalUrl: string,
    expiresAt?: string
  ) => {
    if (token) {
      // Logged-in: The link was created with the user token and saved to PostgreSQL
      setRefreshTrigger((prev) => prev + 1);
    } else {
      // Guest: Save to guest browser history in localStorage
      const newItem: HistoryItem = {
        short_code: res.short_code,
        short_url: res.short_url,
        long_url: originalUrl,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        click_count: 0,
        is_active: true,
      };

      setGuestHistory((prev) => {
        const filtered = prev.filter((item) => item.short_code !== res.short_code);
        const updated = [newItem, ...filtered].slice(0, 50);
        localStorage.setItem('slug_guest_history', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteHistoryItem = (code: string) => {
    if (token) {
      setUserLinks((prev) => prev.filter((item) => item.short_code !== code));
    } else {
      setGuestHistory((prev) => {
        const updated = prev.filter((item) => item.short_code !== code);
        localStorage.setItem('slug_guest_history', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleViewStats = (code: string) => {
    setSelectedStatsCode(code);
    setStatsModalOpen(true);
  };

  const handleOpenQR = (url: string, code: string) => {
    setQrModalData({ url, code });
    setQrModalOpen(true);
  };

  const handleSelectView = (view: 'home' | 'links') => {
    setCurrentView(view);
    const targetPath = view === 'links' ? '/dashboard' : '/';
    window.history.pushState({}, '', targetPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // When logged in: display user's PostgreSQL account links
  // When logged out: display strictly guest links created on this browser
  const allDisplayLinks: LinkItemData[] = token
    ? userLinks
    : guestHistory.map((h) => ({
        short_code: h.short_code,
        long_url: h.long_url,
        click_count: h.click_count || 0,
        created_at: h.created_at,
        expires_at: h.expires_at,
        is_active: h.is_active ?? true,
      }));

  // If path is a 404 / 410 short link, render NotFound view directly
  if (notFoundState.is404) {
    return <NotFound pathCode={notFoundState.code} isExpired={notFoundState.isExpired} />;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-page)', color: 'var(--text-main)', display: 'flex', flexDirection: 'column' }}>
      {/* Pure Soft White Cursor Spotlight */}
      <CursorGlow darkMode={darkMode} />

      {/* Floating Pill Top Navbar */}
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        token={token}
        currentUser={user}
        isHealthy={isHealthy}
        currentView={currentView}
        onSelectView={handleSelectView}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Content Router */}
      <main style={{ flex: 1 }}>
        {currentView === 'home' ? (
          <>
            {/* 1. Hero with White Glow Spotlight & Orange Shorten Button */}
            <HeroSection
              token={token}
              onShortenSuccess={handleShortenSuccess}
              onViewStats={handleViewStats}
              onOpenQR={handleOpenQR}
              onShowToast={addToast}
              onOpenAuth={() => setAuthModalOpen(true)}
            />

            {/* 2. Top 5 Recent Links Feed */}
            <LiveDashboard
              token={token}
              currentUser={user}
              allDisplayLinks={allDisplayLinks}
              refreshTrigger={refreshTrigger}
              onOpenAuth={() => setAuthModalOpen(true)}
              onViewStats={handleViewStats}
              onOpenQR={handleOpenQR}
              onDeleteHistoryItem={handleDeleteHistoryItem}
              onShowToast={addToast}
              onNavigateAllLinks={() => handleSelectView('links')}
            />
          </>
        ) : (
          /* 3. Dedicated /dashboard All Links Page */
          <AllLinksView
            token={token}
            currentUser={user}
            allDisplayLinks={allDisplayLinks}
            setUserLinks={setUserLinks}
            onOpenAuth={() => setAuthModalOpen(true)}
            onDeleteHistoryItem={handleDeleteHistoryItem}
            onNavigateHome={() => handleSelectView('home')}
            onViewStats={handleViewStats}
            onOpenQR={handleOpenQR}
            onShowToast={addToast}
          />
        )}
      </main>

      {/* Footer */}
      <Footer darkMode={darkMode} />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        currentToken={token}
        currentUser={user}
        onSaveAuth={handleSaveAuth}
        onClose={() => setAuthModalOpen(false)}
        onShowToast={addToast}
      />

      {/* Analytics Inspector Modal */}
      <StatsModal
        isOpen={statsModalOpen}
        token={token}
        initialCode={selectedStatsCode}
        onClose={() => setStatsModalOpen(false)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onShowToast={addToast}
      />

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={qrModalOpen}
        shortUrl={qrModalData.url}
        shortCode={qrModalData.code}
        onClose={() => setQrModalOpen(false)}
        onCopy={(text) => addToast('Copied short link', text, 'success')}
      />
    </div>
  );
};

export default App;
