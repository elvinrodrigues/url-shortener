import React, { useState } from 'react';
import { Copy, Check, ExternalLink, QrCode, BarChart3, Trash2 } from 'lucide-react';
import { Favicon } from './Favicon.tsx';
import { API_BASE_URL } from '../api.ts';

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

  const realShortUrl = `${API_BASE_URL}/${link.short_code}`;

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
        border: `1px solid ${isHovered ? 'rgba(255, 255, 255, 0.22)' : 'var(--border-subtle)'}`,
        backgroundColor: isHovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        boxShadow: isHovered
          ? '0 4px 20px rgba(0, 0, 0, 0.45), 0 0 15px rgba(255, 255, 255, 0.08)'
          : '0 2px 10px rgba(0, 0, 0, 0.2)',
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
                color: isHovered ? '#FF5A00' : '#FFFFFF',
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
                cursor: 'pointer',
                color: copied ? '#FF5A00' : 'var(--text-dim)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s ease',
              }}
              title="Quick copy link"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>

          <div
            style={{
              fontSize: '11.5px',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '380px',
            }}
            title={link.long_url}
          >
            {link.long_url}
          </div>
        </div>
      </div>

      {/* Right: Glowing Orange Click Badge, Timestamp, & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
        {/* Orange Click Count Capsule */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 90, 0, 0.12)',
            border: '1px solid rgba(255, 90, 0, 0.28)',
            color: '#FF5A00',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          <span className="font-mono">{link.click_count || 0} clicks</span>
        </div>

        {/* Relative Timestamp */}
        <span
          style={{
            fontSize: '11.5px',
            color: 'var(--text-dim)',
            minWidth: '50px',
            textAlign: 'right',
          }}
        >
          {formatTimeAgo(link.created_at)}
        </span>

        {/* Action Group */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={handleCopy}
            className="btn-icon-action"
            title="Copy Short URL"
          >
            {copied ? <Check size={13} color="#FF5A00" /> : <Copy size={13} />}
          </button>

          <button
            type="button"
            onClick={() => onOpenQR(realShortUrl, link.short_code)}
            className="btn-icon-action"
            title="View QR Code"
          >
            <QrCode size={13} />
          </button>

          <a
            href={realShortUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-icon-action"
            title="Visit Destination"
          >
            <ExternalLink size={13} />
          </a>

          <button
            type="button"
            onClick={() => onViewStats(link.short_code)}
            className="btn-icon-action"
            style={{ color: '#FF5A00' }}
            title="Analytics"
          >
            <BarChart3 size={13} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(link.short_code)}
            className="btn-icon-action"
            style={{ color: 'rgba(239, 68, 68, 0.8)' }}
            title="Deactivate Link"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
