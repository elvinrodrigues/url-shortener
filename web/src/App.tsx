import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ShortenForm } from './components/ShortenForm';
import { ResultCard } from './components/ResultCard';
import { StatsSection } from './components/StatsSection';
import { RecentHistory, type HistoryItem } from './components/RecentHistory';
import { UserURLsTable } from './components/UserURLsTable';
import { AuthModal, type User } from './components/AuthModal';
import { checkHealth, API_BASE_URL, type CreateURLResponse } from './api';
import './App.css';

export function App() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem('lynx_jwt_token') || '');
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('lynx_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [tableRefreshCount, setTableRefreshCount] = useState(0);

  const [currentResult, setCurrentResult] = useState<{
    res: CreateURLResponse;
    originalUrl: string;
    expiresAt?: string;
  } | null>(null);

  const [statsCode, setStatsCode] = useState<string>('');

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('lynx_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const pathname = window.location.pathname;
    const pathCode = pathname.substring(1);
    if (pathCode && !pathCode.includes('.') && pathCode !== 'auth' && pathCode !== 'health') {
      window.location.href = `${API_BASE_URL}/${pathCode}`;
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
      localStorage.setItem('lynx_jwt_token', newToken);
    } else {
      localStorage.removeItem('lynx_jwt_token');
    }

    if (newUser) {
      localStorage.setItem('lynx_user', JSON.stringify(newUser));
    } else {
      localStorage.removeItem('lynx_user');
    }
  };

  const handleShortenSuccess = (
    res: CreateURLResponse,
    originalUrl: string,
    expiresAt?: string
  ) => {
    setCurrentResult({ res, originalUrl, expiresAt });
    setTableRefreshCount((prev) => prev + 1);

    const newItem: HistoryItem = {
      short_code: res.short_code,
      short_url: res.short_url,
      long_url: originalUrl,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.short_code !== res.short_code);
      const updated = [newItem, ...filtered].slice(0, 20);
      localStorage.setItem('lynx_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleRemoveHistoryItem = (code: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.short_code !== code);
      localStorage.setItem('lynx_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('lynx_history');
  };

  const handleViewStats = (code: string) => {
    setStatsCode(code);
    setTimeout(() => {
      const statsElem = document.getElementById('stats-section');
      if (statsElem) {
        statsElem.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  return (
    <div className="app-container">
      <Header
        isHealthy={isHealthy}
        token={token}
        currentUser={user}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main className="main-content">
        {/* Hero Section */}
        <section className="hero-section">
          <h1 className="hero-title">
            Shorten any link <br />
            <span className="text-gradient">in one click.</span>
          </h1>

          <p className="hero-subtitle">
            Free to use, no account required. Paste a long link to get a clean short URL instantly. Optionally create a custom alias or set an expiration date.
          </p>
        </section>

        {/* Shorten Section */}
        <section className="shorten-section">
          <ShortenForm token={token} onSuccess={handleShortenSuccess} />
        </section>

        {currentResult && (
          <section className="result-section">
            <ResultCard
              result={currentResult.res}
              originalUrl={currentResult.originalUrl}
              expiresAt={currentResult.expiresAt}
              onViewStats={handleViewStats}
            />
          </section>
        )}

        {/* User's All Links Table (Dashboard) */}
        <section className="user-urls-section">
          <div className="section-header font-mono">
            <span className="section-number">02 //</span>
            <span className="section-title">MY LINK DASHBOARD (ALL URLS TABLE)</span>
          </div>
          <UserURLsTable
            token={token}
            onOpenAuth={() => setAuthModalOpen(true)}
            onViewStats={handleViewStats}
            refreshTrigger={tableRefreshCount}
          />
        </section>

        {/* Recent History */}
        <section className="history-section">
          <RecentHistory
            items={history}
            token={token}
            onViewStats={handleViewStats}
            onRemoveItem={handleRemoveHistoryItem}
            onClearHistory={handleClearHistory}
          />
        </section>

        {/* Dynamic Stats Section (Only visible when Analyze is clicked) */}
        {statsCode && (
          <section id="stats-section" className="stats-section">
            <div className="section-header font-mono">
              <span className="section-number">03 //</span>
              <span className="section-title">LINK ANALYTICS & METADATA</span>
            </div>
            <StatsSection
              token={token}
              initialCode={statsCode}
              onOpenAuth={() => setAuthModalOpen(true)}
              onClose={() => setStatsCode('')}
            />
          </section>
        )}
      </main>

      <footer className="footer-container">
        <p className="tos-notice">
          Don't shorten links to illegal, phishing, or harmful content.
        </p>
        <p className="footer-meta font-mono">
          Elvin Rodrigues — Slug • Go 1.22+ • PostgreSQL 15 • Redis 7
        </p>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        currentToken={token}
        currentUser={user}
        onSaveAuth={handleSaveAuth}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}

export default App;
