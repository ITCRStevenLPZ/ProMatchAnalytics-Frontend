import { useTranslation } from 'react-i18next';

export default function TeamDetail() {
  const { t } = useTranslation('teams');
  
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('teamDetails')}</h1>
      <div className="card">
        <p className="text-gray-600">{t('loading')}</p>
      </div>
    </div>
  );
}
