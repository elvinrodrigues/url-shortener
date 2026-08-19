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
      className="link-card-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderRadius: '14px',
        padding: '0.85rem 1.15rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        transition: 'all 0.18s ease',
        border: `1px solid ${isHovered ? 'var(--border-hover)' : 'var(--border-subtle)'}`,
        backgroundColor: isHovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        boxShadow: isHovered ? 'var(--card-shadow)' : 'none',
      }}
    >
      {/* Left: Domain Favicon Avatar & Short Code Stack */}
      <div
        className="link-card-left"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          minWidth: 0,
          flex: '1 1 240px',
        }}
      >
        <Favicon url={link.long_url} size={16} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', minWidth: 0, flex: 1 }}>
          {/* Top Row: Short Code + inline copy button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '14.5px',
                fontWeight: 700,
                color: isHovered ? '#FF5A00' : 'var(--text-title)',
                letterSpacing: '-0.01em',
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
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s ease',
              }}
              title="Copy short link"
            >
              {copied ? <Check size={13} color="#FF5A00" /> : <Copy size={13} />}
            </button>
          </div>

          {/* Bottom Row: Full Destination URL Target */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%',
              maxWidth: '380px',
              display: 'block',
            }}
            title={link.long_url}
          >
            {link.long_url}
          </span>
        </div>
      </div>

      {/* Right: Orange Click Badge, Time ago & 5 Action Buttons */}
      <div
        className="link-card-right"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Orange Click Count Pill */}
          <div
            className="font-mono"
            style={{
              backgroundColor: 'rgba(255, 90, 0, 0.08)',
              border: '1px solid rgba(255, 90, 0, 0.35)',
              color: '#FF5A00',
              padding: '3px 9px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{link.click_count || 0}</span>
            <span>clicks</span>
          </div>

          {/* Time Ago */}
          <span
            className="font-mono"
            style={{
              fontSize: '11px',
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatTimeAgo(link.created_at)}
          </span>
        </div>

        {/* 5 Distinct Action Button Icons */}
        <div className="link-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* 1. Copy Link */}
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon-action"
            style={{ padding: '6px', borderRadius: '7px' }}
            title="Copy short link"
          >
            {copied ? <Check size={13} color="#FF5A00" /> : <Copy size={13} />}
          </button>

          {/* 2. QR Code */}
          <button
            type="button"
            onClick={() => onOpenQR(realShortUrl, link.short_code)}
            className="btn-icon-action"
            style={{ padding: '6px', borderRadius: '7px' }}
            title="View QR code"
          >
            <QrCode size={13} />
          </button>

          {/* 3. Open External Destination */}
          <a
            href={realShortUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-icon-action"
            style={{ padding: '6px', borderRadius: '7px', display: 'inline-flex' }}
            title="Open link in new tab"
          >
            <ExternalLink size={13} />
          </a>

          {/* 4. Analytics / Stats (Orange) */}
          <button
            type="button"
            onClick={() => onViewStats(link.short_code)}
            className="btn-icon-action"
            style={{ padding: '6px', borderRadius: '7px', color: '#FF5A00' }}
            title="View link analytics"
          >
            <BarChart3 size={13} />
          </button>

          {/* 5. Delete Link (Red) */}
          <button
            type="button"
            onClick={() => onDelete(link.short_code)}
            className="btn-icon-action"
            style={{ padding: '6px', borderRadius: '7px', color: '#EF4444' }}
            title="Delete link"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
