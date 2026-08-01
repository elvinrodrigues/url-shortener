import React, { useState } from 'react';
import { History, Copy, Check, ExternalLink, BarChart2, Trash2, AlertCircle, Clock, Lock } from 'lucide-react';
import { deleteURL } from '../api';

export interface HistoryItem {
  short_code: string;
  short_url: string;
  long_url: string;
  created_at: string;
  expires_at?: string;
}

interface RecentHistoryProps {
  items: HistoryItem[];
  token: string;
  onViewStats: (code: string) => void;
  onRemoveItem: (code: string) => void;
  onClearHistory: () => void;
}

export const RecentHistory: React.FC<RecentHistoryProps> = ({
  items,
  token,
  onViewStats,
  onRemoveItem,
  onClearHistory,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCopy = async (code: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDelete = async (code: string) => {
    if (!token) {
      setDeleteError('Auth token required to delete short links from server.');
      return;
    }

    try {
      setDeleteError(null);
      await deleteURL(code, token);
      onRemoveItem(code);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete URL');
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel history-card">
      <div className="history-header">
        <div className="history-title-group">
          <div className="history-title">
            <History size={16} />
            <h3>Your Recent Links</h3>
            <span className="count-pill">{items.length}</span>
          </div>
          <span className="storage-note">
            <Lock size={10} /> Saved in your browser only (not shared publicly)
          </span>
        </div>
        <button onClick={onClearHistory} className="btn-clear-history">
          Clear History
        </button>
      </div>

      {deleteError && (
        <div className="error-banner mb-3">
          <AlertCircle size={14} />
          <span>{deleteError}</span>
        </div>
      )}

      <div className="history-list">
        {items.map((item) => (
          <div key={item.short_code} className="history-item">
            <div className="history-urls">
              <div className="history-short">
                <a
                  href={item.short_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="short-link"
                >
                  {item.short_url}
                </a>
                {item.expires_at && (
                  <span className="expiry-tag" title={`Expires on ${new Date(item.expires_at).toLocaleString()}`}>
                    <Clock size={10} />
                    <span>Exp: {new Date(item.expires_at).toLocaleDateString()}</span>
                  </span>
                )}
              </div>
              <div className="history-long" title={item.long_url}>
                {item.long_url}
              </div>
            </div>

            <div className="history-actions">
              <button
                onClick={() => handleCopy(item.short_code, item.short_url)}
                className={`btn-action-sm ${copiedCode === item.short_code ? 'copied' : ''}`}
                title="Copy short link"
              >
                {copiedCode === item.short_code ? <Check size={14} /> : <Copy size={14} />}
              </button>

              <a
                href={item.short_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action-sm"
                title="Open short link"
              >
                <ExternalLink size={14} />
              </a>

              <button
                onClick={() => onViewStats(item.short_code)}
                className="btn-action-sm"
                title="View statistics"
              >
                <BarChart2 size={14} />
              </button>

              {token && (
                <button
                  onClick={() => handleDelete(item.short_code)}
                  className="btn-action-sm btn-delete"
                  title="Soft-delete link from server"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
