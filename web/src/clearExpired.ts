import { deleteExpiredURLs, isLinkExpired } from './api.ts';

export interface ClearExpiredOptions {
  token: string;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => Promise<void> | void;
  onClearGuestHistory?: () => void;
  onSuccess?: (deletedCount: number) => void;
}

export async function clearAllExpiredLinks({
  token,
  onShowToast,
  onRefresh,
  onClearGuestHistory,
  onSuccess,
}: ClearExpiredOptions): Promise<void> {
  if (token) {
    try {
      const count = await deleteExpiredURLs(token);
      if (onRefresh) {
        await onRefresh();
      }
      if (onSuccess) {
        onSuccess(count);
      }
      onShowToast(
        'Cleared expired links',
        count === 1 ? 'Removed 1 expired link.' : `Removed ${count} expired links.`,
        'success'
      );
    } catch (err: any) {
      onShowToast('Clear expired failed', err.message || 'Could not clear expired links', 'error');
    }
  } else {
    // Guest mode: localStorage only, strictly no API call
    try {
      const saved = localStorage.getItem('slug_guest_history');
      if (!saved) return;
      const history = JSON.parse(saved);
      if (!Array.isArray(history)) return;

      const remaining = history.filter((item: any) => !isLinkExpired(item.expires_at));
      const removedCount = history.length - remaining.length;
      localStorage.setItem('slug_guest_history', JSON.stringify(remaining));

      if (onClearGuestHistory) {
        onClearGuestHistory();
      }
      if (onSuccess) {
        onSuccess(removedCount);
      }
      onShowToast(
        'Cleared local history',
        removedCount === 1
          ? 'Removed 1 expired link from local history (not deleted from server).'
          : `Removed ${removedCount} expired links from local history (not deleted from server).`,
        'info'
      );
    } catch {
      onShowToast('Clear expired failed', 'Could not clear local history', 'error');
    }
  }
}
