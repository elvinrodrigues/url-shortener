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
import { ToastContainer, type ToastMessage } from './components/Toast.tsx';
import {
  checkHealth,
  getUserURLs,
  getShortUrl,
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
  const [statsCode, setStatsCode] = useState<string | null>(null);
  const [qrModalData, setQrModalData] = useState<{ url: string; code: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync theme class with HTML root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('slug-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('slug-theme', 'light');
    }
  }, [darkMode]);

  // Handle browser popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (pathname === '/dashboard' || pathname === '/links' || hash === '#dashboard' || hash === '#links') {
        setCurrentView('links');
      } else {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const handleNavigateView = (view: 'home' | 'links') => {
    setCurrentView(view);
    if (view === 'links') {
      window.history.pushState(null, '', '/dashboard');
    } else {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showToast = useCallback(
    (title: string, message?: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
      setToasts((prev) => [...prev, { id, title, message, type }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Health check
  useEffect(() => {
    let mounted = true;
    checkHealth()
      .then((healthy) => {
        if (mounted) setIsHealthy(healthy);
      })
      .catch(() => {
        if (mounted) setIsHealthy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch logged-in user URLs from PostgreSQL
  const fetchUserLinks = useCallback(async () => {
    if (!token) {
      setUserLinks([]);
      return;
    }
    try {
      const links = await getUserURLs(token);
      setUserLinks(links || []);
    } catch (err: any) {
      if (err.message && (err.message.includes('401') || err.message.includes('Unauthorized') || err.message.includes('expired'))) {
        setToken('');
        setUser(null);
        localStorage.removeItem('slug_jwt_token');
        localStorage.removeItem('slug_user');
        showToast('Session expired', 'Please sign in again', 'info');
      }
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchUserLinks();
  }, [fetchUserLinks, refreshTrigger]);

  const handleSaveAuth = (newToken: string, newUser: User | null) => {
    setToken(newToken);
    setUser(newUser);
    if (newToken) {
      localStorage.setItem('slug_jwt_token', newToken);
      if (newUser) {
        localStorage.setItem('slug_user', JSON.stringify(newUser));
      }
    } else {
      localStorage.removeItem('slug_jwt_token');
      localStorage.removeItem('slug_user');
      setUserLinks([]);
    }
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleShortenSuccess = (
    res: CreateURLResponse,
    originalUrl: string,
    expiresAt?: string,
  ) => {
    if (token) {
      // User is logged in: Trigger server refetch to load link from database
      setRefreshTrigger((prev) => prev + 1);
    } else {
      // Guest user: Save exclusively to local history (defaulting to 30d if omitted)
      const finalExpiry = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const newItem: HistoryItem = {
        short_code: res.short_code,
        short_url: res.short_url,
        long_url: originalUrl,
        created_at: new Date().toISOString(),
        expires_at: finalExpiry,
      };
      setGuestHistory((prev) => {
        const filtered = prev.filter((item) => item.short_code !== res.short_code);
        const updated = [newItem, ...filtered];
        localStorage.setItem('slug_guest_history', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteHistoryItem = (code: string) => {
    if (token) {
      setUserLinks((prev) => prev.filter((l) => l.short_code !== code));
      setRefreshTrigger((prev) => prev + 1);
    } else {
      setGuestHistory((prev) => {
        const updated = prev.filter((item) => item.short_code !== code);
        localStorage.setItem('slug_guest_history', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Convert URLs for Unified Rendering
  const allDisplayLinks: LinkItemData[] = token
    ? userLinks.map((item) => ({
        short_code: item.short_code,
        short_url: getShortUrl(item.short_code),
        long_url: item.long_url,
        created_at: item.created_at,
        expires_at: item.expires_at,
        click_count: item.click_count,
        is_active: item.is_active,
      }))
    : guestHistory.map((item) => ({
        short_code: item.short_code,
        short_url: item.short_url,
        long_url: item.long_url,
        created_at: item.created_at,
        expires_at: item.expires_at,
        click_count: 0,
        is_active: true,
      }));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <CursorGlow darkMode={darkMode} />

      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        token={token}
        currentUser={user}
        isHealthy={isHealthy}
        currentView={currentView}
        onSelectView={handleNavigateView}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {currentView === 'home' ? (
          <>
            <HeroSection
              token={token}
              onShortenSuccess={handleShortenSuccess}
              onShowToast={showToast}
              onOpenQR={(url, code) => setQrModalData({ url, code })}
              onViewStats={(code) => setStatsCode(code)}
              onOpenAuth={() => setAuthModalOpen(true)}
            />

            <LiveDashboard
              token={token}
              currentUser={user}
              allDisplayLinks={allDisplayLinks}
              refreshTrigger={refreshTrigger}
              onOpenAuth={() => setAuthModalOpen(true)}
              onViewStats={(code) => setStatsCode(code)}
              onOpenQR={(url, code) => setQrModalData({ url, code })}
              onDeleteHistoryItem={handleDeleteHistoryItem}
              onShowToast={showToast}
              onNavigateAllLinks={() => handleNavigateView('links')}
            />
          </>
        ) : (
          <AllLinksView
            token={token}
            currentUser={user}
            allDisplayLinks={allDisplayLinks}
            setUserLinks={setUserLinks}
            onOpenAuth={() => setAuthModalOpen(true)}
            onViewStats={(code) => setStatsCode(code)}
            onOpenQR={(url, code) => setQrModalData({ url, code })}
            onDeleteHistoryItem={handleDeleteHistoryItem}
            onShowToast={showToast}
            onNavigateHome={() => handleNavigateView('home')}
          />
        )}
      </main>

      <Footer darkMode={darkMode} />

      {/* Modals & Portals */}
      <AuthModal
        isOpen={authModalOpen}
        currentToken={token}
        currentUser={user}
        onSaveAuth={handleSaveAuth}
        onClose={() => setAuthModalOpen(false)}
        onShowToast={showToast}
      />

      <StatsModal
        initialCode={statsCode || ''}
        token={token}
        isOpen={!!statsCode}
        onClose={() => setStatsCode(null)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onShowToast={showToast}
      />

      {qrModalData && (
        <QRCodeModal
          url={qrModalData.url}
          shortCode={qrModalData.code}
          isOpen={true}
          onClose={() => setQrModalData(null)}
          onShowToast={showToast}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export default App;
