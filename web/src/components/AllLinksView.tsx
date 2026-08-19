import React, { useState } from 'react';
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  Download,
  Plus,
  ArrowLeft,
  Link2,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Lock,
  Sparkles,
  BarChart3,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { LinkCard, type LinkItemData } from './LinkCard.tsx';
import { deleteURL, getUserURLs, type URLStats, type User } from '../api.ts';

interface AllLinksViewProps {
  token: string;
  currentUser: User | null;
  allDisplayLinks: LinkItemData[];
  setUserLinks: React.Dispatch<React.SetStateAction<URLStats[]>>;
  onOpenAuth: () => void;
  onDeleteHistoryItem: (code: string) => void;
  onNavigateHome: () => void;
  onViewStats: (code: string) => void;
  onOpenQR: (url: string, code: string) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const AllLinksView: React.FC<AllLinksViewProps> = ({
  token,
  currentUser,
  allDisplayLinks,
  setUserLinks,
  onOpenAuth,
  onDeleteHistoryItem,
  onNavigateHome,
  onViewStats,
  onOpenQR,
  onShowToast,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'clicks' | 'date' | 'name'>('clicks');
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const itemsPerPage = 8;

  // GUEST ACCESS RESTRICTION: If not signed in, show Auth Gate
  if (!token) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '7.5rem 1.25rem 5rem', textAlign: 'center' }}>
        {/* Subtle Ambient Glow */}
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '350px',
            background: 'var(--spotlight-glow)',
            filter: 'blur(70px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div
          className="glass-panel"
          style={{
            position: 'relative',
            zIndex: 1,
            backgroundColor: 'var(--bg-modal)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '1.5rem',
            padding: '2.5rem 1.75rem',
            boxShadow: 'var(--dock-shadow)',
            animation: 'fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Lock Icon Box with Orange Halo */}
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 90, 0, 0.12)',
              border: '1px solid rgba(255, 90, 0, 0.35)',
              color: '#FF5A00',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              boxShadow: '0 0 25px rgba(255, 90, 0, 0.25)',
            }}
          >
            <Lock size={26} />
          </div>

          <h2
            className="font-display"
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              color: 'var(--text-title)',
              marginBottom: '0.5rem',
              letterSpacing: '-0.02em',
            }}
          >
            Dashboard Access Restricted
          </h2>

          <p
            style={{
              fontSize: '0.92rem',
              color: 'var(--text-muted)',
              lineHeight: 1.55,
              maxWidth: '440px',
              margin: '0 auto 1.75rem',
            }}
          >
            Please sign in to view your complete link catalog, inspect live click analytics, filter records, and export CSV reports.
          </p>

          {/* Feature List */}
          <div
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              fontSize: '0.82rem',
              color: 'var(--text-main)',
              marginBottom: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <BarChart3 size={15} color="#FF5A00" />
              <span>Real-time click telemetry & traffic analytics</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Layers size={15} color="#FF5A00" />
              <span>Search, status filters (Active/Expired), & sorting</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Download size={15} color="#FF5A00" />
              <span>1-click CSV link export & reporting</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <ShieldCheck size={15} color="#FF5A00" />
              <span>Permanent cloud sync across all your devices</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={onOpenAuth}
              className="btn-pill-primary"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.92rem',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} />
              <span>Sign In to Access Dashboard</span>
            </button>

            <button
              type="button"
              onClick={onNavigateHome}
              className="btn-icon-action"
              style={{
                width: '100%',
                padding: '0.65rem',
                fontSize: '0.85rem',
                justifyContent: 'center',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Shortener</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const data = await getUserURLs(token);
      setUserLinks(data || []);
      onShowToast('Refreshed links', 'Fetched latest data from backend', 'info');
    } catch {
      onShowToast('Refresh failed', 'Could not refresh links', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`Are you sure you want to deactivate short link "/${code}"?`)) return;
    try {
      if (token) {
        await deleteURL(code, token);
        setUserLinks((prev) => prev.filter((item) => item.short_code !== code));
      }
      onDeleteHistoryItem(code);
      onShowToast('Link deactivated', `/${code} has been deactivated.`, 'info');
    } catch (err: any) {
      onShowToast('Delete failed', err.message || 'Could not delete link', 'error');
    }
  };

  const handleExportCSV = () => {
    if (allDisplayLinks.length === 0) {
      onShowToast('No links to export', '', 'info');
      return;
    }
    const headers = 'Short Code,Short URL,Destination URL,Clicks,Created At,Expires At\n';
    const rows = allDisplayLinks
      .map(
        (l) =>
          `"${l.short_code}","${window.location.origin}/${l.short_code}","${l.long_url}",${l.click_count},"${l.created_at}","${l.expires_at || 'Permanent'}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `slug-links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Exported CSV', 'Downloaded link records', 'success');
  };

  // Filter links
  const filteredLinks = allDisplayLinks.filter((item) => {
    const matchesSearch =
      item.short_code.toLowerCase().includes(search.toLowerCase()) ||
      item.long_url.toLowerCase().includes(search.toLowerCase());

    const isExpired = item.expires_at ? new Date(item.expires_at) < new Date() : false;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? item.is_active && !isExpired
        : !item.is_active || isExpired;

    return matchesSearch && matchesStatus;
  });

  // Sort links
  const sortedLinks = [...filteredLinks].sort((a, b) => {
    if (sortBy === 'clicks') return b.click_count - a.click_count;
    if (sortBy === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'name') return a.short_code.localeCompare(b.short_code);
    return 0;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedLinks.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLinks = sortedLinks.slice(startIndex, startIndex + itemsPerPage);

  // Metrics
  const totalClicks = allDisplayLinks.reduce((acc, curr) => acc + (curr.click_count || 0), 0);
  const activeCount = allDisplayLinks.filter((l) => {
    const isExpired = l.expires_at ? new Date(l.expires_at) < new Date() : false;
    return l.is_active && !isExpired;
  }).length;

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '6.5rem 1.25rem 5rem' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            type="button"
            onClick={onNavigateHome}
            className="btn-icon-action"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.45rem 0.85rem',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1
                className="font-display"
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  color: 'var(--text-title)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {currentUser ? `${currentUser.name.split(' ')[0]}'s Link Dashboard` : 'Account Dashboard'}
              </h1>

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
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Manage your cloud-synced short links, click analytics, and custom redirects.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-icon-action"
            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center' }}
            title="Refresh Links"
          >
            <RefreshCw size={14} className={refreshing ? 'spinner' : ''} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="btn-icon-action"
            style={{
              padding: '0.5rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={onNavigateHome}
            className="btn-pill-primary"
            style={{
              padding: '0.5rem 1.15rem',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} />
            <span>Create Link</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards (Orange Highlights) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.75rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '1.15rem',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Total Links
          </span>
          <div className="font-display" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-title)', marginTop: '2px' }}>
            {allDisplayLinks.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Cloud Account Records
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '1.15rem',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Total Clicks
          </span>
          <div className="font-display" style={{ fontSize: '2rem', fontWeight: 800, color: '#FF5A00', marginTop: '2px' }}>
            {totalClicks.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: '#22C55E', fontWeight: 600, marginTop: '2px' }}>
            ● Live Redirection Telemetry
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '1.15rem',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Active Links
          </span>
          <div className="font-display" style={{ fontSize: '2rem', fontWeight: 800, color: '#22C55E', marginTop: '2px' }}>
            {activeCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Available for instant redirect
          </div>
        </div>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '320px' }}>
          <Search size={13} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Search slug or destination..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9999px',
              padding: '6px 12px 6px 32px',
              fontSize: '12px',
              color: 'var(--text-main)',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter Pills & Sort Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Status Tabs */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9999px',
              padding: '2px',
            }}
          >
            {(['all', 'active', 'expired'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setStatusFilter(tab);
                  setCurrentPage(1);
                }}
                style={{
                  background: statusFilter === tab ? 'linear-gradient(135deg, #FF4500, #FF5A00)' : 'transparent',
                  color: statusFilter === tab ? '#FFFFFF' : 'var(--text-dim)',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '4px 8px',
            }}
          >
            <ArrowUpDown size={12} color="var(--text-dim)" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '11px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="clicks">Most Clicks</option>
              <option value="date">Latest Created</option>
              <option value="name">Slug (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Link Cards Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {paginatedLinks.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              borderRadius: '12px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 90, 0, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.65rem',
                color: 'var(--text-dim)',
              }}
            >
              <Link2 size={18} />
            </div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>
              No links matched your query
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
              Try adjusting your search terms or filter settings.
            </p>
          </div>
        ) : (
          paginatedLinks.map((link) => (
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

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            Showing {startIndex + 1} - {Math.min(startIndex + itemsPerPage, sortedLinks.length)} of {sortedLinks.length} links
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="btn-icon-action"
              style={{ padding: '4px 8px', opacity: currentPage === 1 ? 0.4 : 1 }}
            >
              <ChevronLeft size={14} />
            </button>

            <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, padding: '0 6px' }}>
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="btn-icon-action"
              style={{ padding: '4px 8px', opacity: currentPage === totalPages ? 0.4 : 1 }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
