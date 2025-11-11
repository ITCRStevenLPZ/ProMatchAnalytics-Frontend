import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DuplicateWarningProps {
  duplicates: Array<{
    name: string;
    match_score: number;
    match_details: string[];
    similarity_score: number;
    [key: string]: any;
  }>;
  onContinue: () => void;
  onCancel: () => void;
  entityType: string;
}

export default function DuplicateWarning({
  duplicates,
  onContinue,
  onCancel
}: DuplicateWarningProps) {
  const { t } = useTranslation('admin');

  return (
    <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            {t('duplicateWarning.title')}
          </h3>
          <p className="text-sm text-yellow-700 mb-3">
            {t('duplicateWarning.message', { count: duplicates.length })}
          </p>
          
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {duplicates.map((dup, index) => (
              <div key={index} className="bg-white rounded p-3 text-sm border border-yellow-200">
                <div className="font-medium text-gray-900 mb-1">{dup.name}</div>
                {dup.match_details && dup.match_details.length > 0 && (
                  <div className="text-xs text-gray-600 mb-1">
                    {dup.match_details.join(' • ')}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {t('duplicateWarning.matchScore')}: {dup.match_score}%
                  </span>
                  <span className="text-xs text-gray-500">
                    {t('duplicateWarning.similarity')}: {Math.round(dup.similarity_score * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onCancel}
              className="btn btn-secondary text-sm flex items-center"
            >
              <X className="h-4 w-4 mr-1" />
              {t('duplicateWarning.cancel')}
            </button>
            <button
              onClick={onContinue}
              className="btn btn-primary text-sm"
            >
              {t('duplicateWarning.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
