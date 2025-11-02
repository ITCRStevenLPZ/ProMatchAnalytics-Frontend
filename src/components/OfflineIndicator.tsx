import { useSyncStore } from '../store/syncStore';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount } = useSyncStore();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {!isOnline && (
        <div className="bg-yellow-500 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff size={20} />
          <span>You are offline. Changes will be synced when connection is restored.</span>
        </div>
      )}
      
      {isOnline && pendingCount > 0 && (
        <div className="bg-blue-500 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
          {isSyncing ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              <span>Syncing {pendingCount} pending changes...</span>
            </>
          ) : (
            <span>{pendingCount} changes pending sync</span>
          )}
        </div>
      )}
    </div>
  );
}
