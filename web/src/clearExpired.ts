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
  // Expired entries can linger in guest history from before the user signed in.
  // Returns null when there is no local history to act on, otherwise the count removed.
  const pruneExpiredGuestHistory = (): number | null => {
    const saved = localStorage.getItem('slug_guest_history');
    if (!saved) return null;
    const history = JSON.parse(saved);
    if (!Array.isArray(history)) return null;

    const remaining = history.filter((item: any) => !isLinkExpired(item.expires_at));
    const removedCount = history.length - remaining.length;
    localStorage.setItem('slug_guest_history', JSON.stringify(remaining));

    if (onClearGuestHistory) {
      onClearGuestHistory();
    }
    return removedCount;
  };

  if (token) {
    try {
      const count = await deleteExpiredURLs(token);
      try {
        pruneExpiredGuestHistory();
      } catch {
        // A corrupt local history must not fail an otherwise successful server delete.
      }
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
      const removedCount = pruneExpiredGuestHistory();
      if (removedCount === null) return;

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
