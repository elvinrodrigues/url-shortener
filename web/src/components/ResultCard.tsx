import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Sparkles, BarChart2, Clock } from 'lucide-react';
import type { CreateURLResponse } from '../api';

interface ResultCardProps {
  result: CreateURLResponse;
  originalUrl: string;
  expiresAt?: string;
  onViewStats: (code: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, originalUrl, expiresAt, onViewStats }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback copy
      const textArea = document.createElement('textarea');
      textArea.value = result.short_url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="glass-panel result-card">
      <div className="result-card-header">
        <div className="header-badges-left">
          <div className="badge badge-success">
            <Sparkles size={12} />
            <span>Short Link Created</span>
          </div>
          {expiresAt && (
            <div className="badge badge-warning font-mono" title={`Expires on ${new Date(expiresAt).toLocaleString()}`}>
              <Clock size={11} />
              <span>Expires {new Date(expiresAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        <span className="result-code-tag">Code: {result.short_code}</span>
      </div>

      <div className="result-main">
        <div className="result-url-display">
          <a
            href={result.short_url}
            target="_blank"
            rel="noopener noreferrer"
            className="short-url-link"
          >
            {result.short_url}
          </a>
          <span className="original-url-truncated" title={originalUrl}>
            → {originalUrl}
          </span>
        </div>

        <div className="result-actions">
          <button
            onClick={handleCopy}
            className={`btn-copy ${copied ? 'copied' : ''}`}
            id="copy-short-url-btn"
          >
            {copied ? (
              <>
                <Check size={16} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy URL</span>
              </>
            )}
          </button>

          <a
            href={result.short_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-visit"
            title="Open short link"
          >
            <ExternalLink size={16} />
          </a>

          <button
            onClick={() => onViewStats(result.short_code)}
            className="btn-stats-shortcut"
            title="View link analytics"
          >
            <BarChart2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
