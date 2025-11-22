import { AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChangeDetail {
  field: string;
  original_value: any;
  modified_value: any;
  similarity: number;
  change_percentage: number;
}

interface ChangeConfirmationProps {
  changePercentage: number;
  changes: ChangeDetail[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ChangeConfirmation({
  changePercentage,
  changes,
  onConfirm,
  onCancel
}: ChangeConfirmationProps) {
  const { t } = useTranslation('admin');

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return t('changeConfirmation.empty');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    
    // Handle ISO date strings - show just the date part
    const valueStr = String(value);
    if (valueStr.includes('T') && valueStr.length >= 10) {
      return valueStr.substring(0, 10);
    }
    
    return valueStr;
  };

  const getFieldLabel = (field: string): string => {
    // Convert field names to readable labels
    const fieldMap: Record<string, string> = {
      'name': t('name'),
      'birth_date': t('birthDate'),
      'nationality': t('nationality'),
      'position': t('position'),
      'height': t('height'),
      'weight': t('weight'),
      'player_height': t('height'),
      'player_weight': t('weight'),
      'short_name': t('shortName'),
      'country_name': t('country'),
      'gender': t('gender'),
      'city': t('city'),
      'country': t('country'),
      'capacity': t('capacity'),
      'surface': t('surface'),
      'years_of_experience': t('yearsOfExperience'),
      'manager.name': t('managerName'),
      'manager.nationality': t('managerNationality'),
      'manager.country_name': t('managerNationality'),
    };
    return fieldMap[field] || field;
  };

  return (
    <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">
            {t('changeConfirmation.reviewTitle')}
          </h3>
          <p className="text-sm text-blue-700 mb-3">
            {t('changeConfirmation.reviewMessage', { 
              percentage: changePercentage.toFixed(1),
              count: changes.length 
            })}
          </p>
          
          <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
            {changes.map((change, index) => (
              <div key={index} className="bg-white rounded-lg p-3 text-sm border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-gray-900">
                    {getFieldLabel(change.field)}
                  </div>
                  <div className="text-xs font-medium px-2 py-1 rounded bg-blue-100 text-blue-800">
                    {change.change_percentage.toFixed(1)}% {t('changeConfirmation.changed')}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 mb-1 font-medium">{t('changeConfirmation.original')}:</div>
                    <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5 text-red-900 break-words min-h-[2rem] flex items-center">
                      {formatValue(change.original_value)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1 font-medium">{t('changeConfirmation.modified')}:</div>
                    <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5 text-green-900 break-words min-h-[2rem] flex items-center">
                      {formatValue(change.modified_value)}
                    </div>
                  </div>
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
              {t('changeConfirmation.cancel')}
            </button>
            <button
              onClick={onConfirm}
              className="btn btn-primary text-sm"
            >
              {t('changeConfirmation.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
