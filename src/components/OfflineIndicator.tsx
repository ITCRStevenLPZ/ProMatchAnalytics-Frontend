import { useTranslation } from "react-i18next";
import { useSyncStore } from "../store/syncStore";
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflineIndicator() {
  const { t } = useTranslation("common");
  const { isOnline, isSyncing, pendingCount } = useSyncStore();

  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {!isOnline && (
        <div className="bg-yellow-500 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff size={20} />
          <span>{t("sync.offline")}</span>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="bg-blue-500 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
          {isSyncing ? (
            <>
              <RefreshCw size={20} className="animate-spin" />
              <span>{t("sync.syncing", { count: pendingCount })}</span>
            </>
          ) : (
            <span>{t("sync.pending", { count: pendingCount })}</span>
          )}
        </div>
      )}
    </div>
  );
}
