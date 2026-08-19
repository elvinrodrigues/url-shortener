import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  BarChart3,
  Search,
  Clock,
  Calendar,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { getStats, API_BASE_URL, type URLStats } from '../api.ts';

interface StatsModalProps {
  isOpen: boolean;
  token?: string;
  initialCode: string;
  onClose: () => void;
  onOpenAuth: () => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  token,
  initialCode,
  onClose,
  onOpenAuth,
  onShowToast,
}) => {
  const [code, setCode] = useState(initialCode);
  const [stats, setStats] = useState<URLStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStats = useCallback(
    async (codeToFetch: string) => {
      if (!codeToFetch.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getStats(codeToFetch.trim(), token);
        setStats(data);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve link stats');
        setStats(null);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (isOpen && initialCode) {
      setCode(initialCode);
      fetchStats(initialCode);
    }
  }, [isOpen, initialCode, fetchStats]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStats(code);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    onShowToast('Copied to clipboard', text, 'success');
    setTimeout(() => setCopied(false), 2000);
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
          maxWidth: '500px',
          backgroundColor: '#0F0F12',
          borderRadius: '1.25rem',
          padding: '1.75rem',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 90, 0, 0.12)',
                color: '#FF5A00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BarChart3 size={18} />
            </div>
            <h3 className="font-display" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF' }}>
              Link Analytics
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

        {/* Search Bar */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
            }}
          >
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Enter short code (e.g. github)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Orange Inspect Button */}
          <button type="submit" disabled={loading} className="btn-pill-primary" style={{ padding: '0.5rem 1.15rem', fontSize: '0.85rem' }}>
            {loading ? <Loader2 size={15} className="spinner" /> : 'Inspect'}
          </button>
        </form>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              color: '#EF4444',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            {!token && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#FF5A00',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                Sign In
              </button>
            )}
          </div>
        )}

        {stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Top Stat Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Total Clicks
                </div>
                <div className="font-display" style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FF5A00', marginTop: '2px' }}>
                  {stats.click_count.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#22C55E', fontWeight: 600, marginTop: '2px' }}>
                  ● Real-time Click Count
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Link Status
                </div>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={20} color={stats.is_active ? '#22C55E' : '#EF4444'} />
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: stats.is_active ? '#22C55E' : '#EF4444' }}>
                    {stats.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Backend 302 Redirect
                </div>
              </div>
            </div>

            {/* Metadata Information List */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Link2 size={13} /> Short URL:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="font-mono" style={{ fontWeight: 700, color: '#FF5A00' }}>
                    {API_BASE_URL}/{stats.short_code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${API_BASE_URL}/${stats.short_code}`)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: '2px',
                    }}
                    title="Copy short link"
                  >
                    {copied ? <Check size={13} color="#FF5A00" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} /> Created At:
                </span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                  {new Date(stats.created_at).toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} /> Expires At:
                </span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                  {stats.expires_at ? new Date(stats.expires_at).toLocaleString() : 'Never (Permanent)'}
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: '4px', fontSize: '0.78rem' }}>Destination Target:</div>
                <a
                  href={stats.long_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: '#FF5A00',
                    wordBreak: 'break-all',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{stats.long_url}</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
