import React, { useState, useEffect } from 'react';
import { BarChart3, Search, Clock, MousePointer, Calendar, AlertCircle, Loader2, Lock, ShieldCheck, X } from 'lucide-react';
import { getStats, type URLStats } from '../api';

interface StatsSectionProps {
  token: string;
  initialCode?: string;
  onOpenAuth: () => void;
  onClose?: () => void;
}

export const StatsSection: React.FC<StatsSectionProps> = ({
  token,
  initialCode = '',
  onOpenAuth,
  onClose,
}) => {
  const [code, setCode] = useState(initialCode);
  const [stats, setStats] = useState<URLStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      if (token) {
        setLoading(true);
        setError(null);
        setStats(null);
        getStats(initialCode.trim(), token)
          .then((data) => setStats(data))
          .catch((err) => setError(err.message || 'Failed to retrieve stats'))
          .finally(() => setLoading(false));
      }
    }
  }, [initialCode, token]);

  const handleFetchStats = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!code.trim()) {
      setError('Please enter a short code');
      return;
    }

    if (!token) {
      setError('Please sign in to query link analytics.');
      return;
    }

    setLoading(true);
    setError(null);
    setStats(null);

    try {
      const data = await getStats(code.trim(), token);
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel stats-card">
      <div className="stats-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="stats-title">
          <BarChart3 className="icon-title" size={20} />
          <h3>Link Analytics & Metadata</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {!token && (
            <button onClick={onOpenAuth} className="token-warning-btn">
              <Lock size={12} />
              <span>Sign In Required</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="btn-close-modal"
              style={{ padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close analytics panel"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleFetchStats} className="stats-search-form">
        <div className="stats-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter short code (e.g. x8aK9q1)"
            className="stats-input"
            id="stats-code-input"
          />
        </div>
        <button type="submit" className="btn-search-stats" disabled={loading}>
          {loading ? <Loader2 className="spinner" size={16} /> : 'Inspect'}
        </button>
      </form>

      {error && (
        <div className="error-banner mt-3">
          <AlertCircle size={16} />
          <span>{error}</span>
          {!token && (
            <button onClick={onOpenAuth} className="inline-link-btn">
              Sign In
            </button>
          )}
        </div>
      )}

      {stats && (
        <div className="stats-results-grid">
          <div className="stat-box clicks-box">
            <div className="stat-box-icon">
              <MousePointer size={22} />
            </div>
            <div className="stat-box-content">
              <span className="stat-value">{stats.click_count.toLocaleString()}</span>
              <span className="stat-label">Total Clicks</span>
            </div>
          </div>

          <div className="stat-box status-box">
            <div className="stat-box-icon">
              <ShieldCheck size={22} />
            </div>
            <div className="stat-box-content">
              <span className="stat-value">
                {stats.is_active ? (
                  <span className="badge badge-success">Active</span>
                ) : (
                  <span className="badge badge-error">Inactive</span>
                )}
              </span>
              <span className="stat-label">Link Status</span>
            </div>
          </div>

          <div className="stat-box info-box-wide">
            <div className="info-row">
              <span className="info-label">
                <Search size={14} /> Short Code:
              </span>
              <span className="info-val font-mono">{stats.short_code}</span>
            </div>
            <div className="info-row">
              <span className="info-label">
                <Clock size={14} /> Created:
              </span>
              <span className="info-val">
                {new Date(stats.created_at).toLocaleString()}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">
                <Calendar size={14} /> Expires:
              </span>
              <span className="info-val">
                {stats.expires_at
                  ? new Date(stats.expires_at).toLocaleString()
                  : 'Never (Permanent)'}
              </span>
            </div>
            <div className="info-row full-width">
              <span className="info-label">Destination URL:</span>
              <a
                href={stats.long_url}
                target="_blank"
                rel="noopener noreferrer"
                className="info-url-link"
              >
                {stats.long_url}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
