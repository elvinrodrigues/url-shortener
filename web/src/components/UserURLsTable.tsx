import React, { useEffect, useState } from 'react';
import { Table, Search, Copy, Check, ExternalLink, BarChart3, Trash2, RefreshCw, AlertCircle, Lock } from 'lucide-react';
import { getUserURLs, deleteURL, type URLStats } from '../api';

interface UserURLsTableProps {
  token: string;
  onOpenAuth: () => void;
  onViewStats: (code: string) => void;
  refreshTrigger?: number; // Increment to force refetch
}

export const UserURLsTable: React.FC<UserURLsTableProps> = ({
  token,
  onOpenAuth,
  onViewStats,
  refreshTrigger = 0,
}) => {
  const [urls, setUrls] = useState<URLStats[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const fetchUserURLs = async () => {
    if (!token) {
      setUrls([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getUserURLs(token);
      setUrls(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load your URLs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserURLs();
  }, [token, refreshTrigger]);

  const handleCopy = (code: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`Are you sure you want to delete short URL "${code}"?`)) {
      return;
    }
    setDeletingCode(code);
    try {
      await deleteURL(code, token);
      setUrls((prev) => prev.filter((u) => u.short_code !== code));
    } catch (err: any) {
      alert(err.message || 'Failed to delete short URL');
    } finally {
      setDeletingCode(null);
    }
  };

  const filteredUrls = urls.filter(
    (u) =>
      u.short_code.toLowerCase().includes(search.toLowerCase()) ||
      u.long_url.toLowerCase().includes(search.toLowerCase())
  );

  if (!token) {
    return (
      <div className="glass-panel stats-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '0.75rem', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', marginBottom: '0.75rem' }}>
          <Table size={28} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem' }}>My Links Table</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
          Sign in with Google to view a full management table of all short links created under your account.
        </p>
        <button onClick={onOpenAuth} className="btn-primary-modal" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <Lock size={15} /> Sign In to View Links Table
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel stats-card">
      <div className="stats-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="stats-title">
          <Table className="icon-title" size={20} />
          <h3>All My Short Links</h3>
          <span className="badge font-mono" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            {urls.length} LINKS
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={fetchUserURLs}
            disabled={loading}
            className="btn-secondary-modal"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Refresh link table"
          >
            <RefreshCw size={13} className={loading ? 'spinner' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter / Search input */}
      <div style={{ margin: '1rem 0 1.25rem', position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by short code or target URL..."
          className="stats-input"
          style={{ paddingLeft: '2.4rem' }}
        />
      </div>

      {error && (
        <div className="error-banner mb-3">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(15, 23, 42, 0.75)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }} className="font-mono">
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>SHORT LINK</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>DESTINATION URL</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>CLICKS</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>EXPIRATION</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading && urls.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw className="spinner" size={20} style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                  Loading your short links...
                </td>
              </tr>
            ) : filteredUrls.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  {search ? 'No short links match your search filter.' : 'No short links created yet under this account.'}
                </td>
              </tr>
            ) : (
              filteredUrls.map((u) => {
                const shortUrl = `${window.location.origin}/${u.short_code}`;
                const isCopied = copiedCode === u.short_code;
                const isDeleting = deletingCode === u.short_code;

                const isExpired = u.expires_at ? new Date(u.expires_at) < new Date() : false;

                return (
                  <tr
                    key={u.short_code}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Short Link */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="font-mono" style={{ fontWeight: 600, color: '#38bdf8' }}>
                          /{u.short_code}
                        </span>
                        <button
                          onClick={() => handleCopy(u.short_code, shortUrl)}
                          className="btn-secondary-modal"
                          style={{ padding: '0.2rem 0.35rem', fontSize: '0.7rem' }}
                          title="Copy short URL"
                        >
                          {isCopied ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>

                    {/* Long URL */}
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '240px' }}>
                      <div
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: '#cbd5e1',
                        }}
                        title={u.long_url}
                      >
                        {u.long_url}
                      </div>
                    </td>

                    {/* Clicks */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span
                        className="badge font-mono"
                        style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '0.15rem 0.45rem', fontSize: '0.75rem' }}
                      >
                        {u.click_count.toLocaleString()}
                      </span>
                    </td>

                    {/* Expiration */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {isExpired ? (
                        <span className="badge badge-error">Expired</span>
                      ) : u.expires_at ? (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(u.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="badge badge-success">Permanent</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleCopy(u.short_code, shortUrl)}
                          className="btn-secondary-modal"
                          style={{ padding: '0.3rem 0.45rem' }}
                          title="Copy short link"
                        >
                          {isCopied ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
                        </button>
                        <a
                          href={shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary-modal"
                          style={{ padding: '0.3rem 0.45rem' }}
                          title="Open short link"
                        >
                          <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={() => onViewStats(u.short_code)}
                          className="btn-secondary-modal"
                          style={{ padding: '0.3rem 0.45rem' }}
                          title="View link analytics"
                        >
                          <BarChart3 size={13} className="text-accent" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.short_code)}
                          disabled={isDeleting}
                          className="btn-secondary-modal"
                          style={{ padding: '0.3rem 0.45rem', color: '#ef4444' }}
                          title="Delete short URL"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
