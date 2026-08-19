import React, { useState } from 'react';
import { Copy, Check, ExternalLink, QrCode, BarChart3, Trash2 } from 'lucide-react';
import { Favicon } from './Favicon.tsx';
import { getShortUrl } from '../api.ts';

export interface LinkItemData {
  short_code: string;
  long_url: string;
  click_count: number;
  created_at: string;
  expires_at?: string;
  is_active?: boolean;
}

interface LinkCardProps {
  link: LinkItemData;
  token: string;
  onViewStats: (code: string) => void;
  onOpenQR: (url: string, code: string) => void;
  onDelete: (code: string) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  token: _token,
  onViewStats,
  onOpenQR,
  onDelete,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const realShortUrl = getShortUrl(link.short_code);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(realShortUrl);
    setCopied(true);
    onShowToast('Copied short link', realShortUrl, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d ago`;
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: '12px',
        padding: '0.95rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem',
        transition: 'all 0.18s ease',
        border: `1px solid ${isHovered ? 'var(--border-hover)' : 'var(--border-subtle)'}`,
        backgroundColor: isHovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        boxShadow: isHovered ? 'var(--card-shadow)' : 'none',
      }}
    >
      {/* Left: Domain Favicon & Slug Stack */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: '220px', flex: 1 }}>
        <Favicon url={link.long_url} size={18} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: isHovered ? '#FF5A00' : 'var(--text-title)',
                transition: 'color 0.15s ease',
              }}
            >
              /{link.short_code}
            </span>

            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: 'transparent',
                border: 'none',
                color: copied ? '#FF5A00' : 'var(--text-dim)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s ease',
              }}
              title="Copy link"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>

            <a
              href={realShortUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--text-dim)',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                textDecoration: 'none',
                transition: 'color 0.15s ease',
              }}
              title="Open destination"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Truncated Target URL */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '320px',
            }}
            title={link.long_url}
          >
            {link.long_url.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>

      {/* Right: Metrics & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {/* Click counter (only show if > 0 or logged in) */}
        {link.click_count > 0 && (
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-dim)',
              backgroundColor: 'var(--bg-input)',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {link.click_count} {link.click_count === 1 ? 'click' : 'clicks'}
          </span>
        )}

        {/* Time ago */}
        <span
          className="font-mono"
          style={{
            fontSize: '11px',
            color: 'var(--text-dim)',
          }}
        >
          {formatTimeAgo(link.created_at)}
        </span>

        {/* Action icons stack */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => onViewStats(link.short_code)}
            className="btn-icon-action"
            style={{ padding: '5px', borderRadius: '6px' }}
            title="View statistics"
          >
            <BarChart3 size={13} />
          </button>

          <button
            type="button"
            onClick={() => onOpenQR(realShortUrl, link.short_code)}
            className="btn-icon-action"
            style={{ padding: '5px', borderRadius: '6px' }}
            title="Download QR code"
          >
            <QrCode size={13} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(link.short_code)}
            className="btn-icon-action"
            style={{ padding: '5px', borderRadius: '6px', color: 'var(--text-dim)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            title="Deactivate link"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
