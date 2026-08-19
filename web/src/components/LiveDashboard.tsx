import React, { useState } from 'react';
import { Search, Link2, ArrowRight, UserCheck, Lock } from 'lucide-react';
import { LinkCard, type LinkItemData } from './LinkCard.tsx';
import { deleteURL, type User } from '../api.ts';

interface LiveDashboardProps {
  token: string;
  currentUser: User | null;
  allDisplayLinks: LinkItemData[];
  refreshTrigger: number;
  onOpenAuth: () => void;
  onViewStats: (code: string) => void;
  onOpenQR: (url: string, code: string) => void;
  onDeleteHistoryItem: (code: string) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateAllLinks: () => void;
}

export const LiveDashboard: React.FC<LiveDashboardProps> = ({
  token,
  currentUser,
  allDisplayLinks,
  onOpenAuth,
  onViewStats,
  onOpenQR,
  onDeleteHistoryItem,
  onShowToast,
  onNavigateAllLinks,
}) => {
  const [search, setSearch] = useState('');

  const handleDelete = async (code: string) => {
    if (!confirm(`Are you sure you want to deactivate short link "/${code}"?`)) return;
    try {
      if (token) {
        await deleteURL(code, token);
      }
      onDeleteHistoryItem(code);
      onShowToast('Link deactivated', `/${code} has been deactivated.`, 'info');
    } catch (err: any) {
      onShowToast('Delete failed', err.message || 'Could not delete link', 'error');
    }
  };

  const handleDashboardClick = () => {
    if (token) {
      onNavigateAllLinks();
    } else {
      onShowToast('Sign in required', 'Please sign in to access your full link dashboard', 'info');
      onOpenAuth();
    }
  };

  const filteredLinks = allDisplayLinks.filter((item) => {
    return (
      item.short_code.toLowerCase().includes(search.toLowerCase()) ||
      item.long_url.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Limit Home view to Top 5 links
  const top5Links = filteredLinks.slice(0, 5);

  return (
    <section id="dashboard" style={{ padding: '0.5rem 1.25rem 5rem', maxWidth: '760px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <h2
            className="font-display"
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#FFFFFF',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {token && currentUser ? `${currentUser.name.split(' ')[0]}'s Links` : 'Recent Links'}
          </h2>

          {/* Orange Circular Link Counter Badge */}
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: 'rgba(255, 90, 0, 0.12)',
              border: '1px solid rgba(255, 90, 0, 0.28)',
              color: '#FF5A00',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {allDisplayLinks.length}
          </span>

          {/* Account Sync Pill (only when logged in) */}
          {token && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#22C55E',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                padding: '2px 8px',
                borderRadius: '9999px',
                border: '1px solid rgba(34, 197, 94, 0.25)',
              }}
            >
              <UserCheck size={11} />
              <span>Synced</span>
            </span>
          )}
        </div>

        {/* Search Input Pill */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: '10px', color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Filter links..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9999px',
              padding: '4px 12px 4px 28px',
              fontSize: '11px',
              color: '#FFFFFF',
              outline: 'none',
              width: '150px',
              transition: 'all 0.2s ease',
            }}
          />
        </div>
      </div>

      {/* Stack of Top 5 Link Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {top5Links.length === 0 ? (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              borderRadius: '12px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.5rem',
                color: 'var(--text-dim)',
              }}
            >
              <Link2 size={16} />
            </div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>
              No links yet
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
              Paste a URL above to create your first short link.
            </p>
          </div>
        ) : (
          top5Links.map((link) => (
            <LinkCard
              key={link.short_code}
              link={link}
              token={token}
              onViewStats={onViewStats}
              onOpenQR={onOpenQR}
              onDelete={handleDelete}
              onShowToast={onShowToast}
            />
          ))
        )}
      </div>

      {/* Dashboard Access Button */}
      {allDisplayLinks.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <button
            type="button"
            onClick={handleDashboardClick}
            className="btn-pill-primary"
            style={{
              padding: '0.55rem 1.35rem',
              fontSize: '12px',
            }}
          >
            {token ? (
              <>
                <span>View all links ({allDisplayLinks.length})</span>
                <ArrowRight size={13} />
              </>
            ) : (
              <>
                <Lock size={12} />
                <span>Sign in to access dashboard ({allDisplayLinks.length})</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
};
