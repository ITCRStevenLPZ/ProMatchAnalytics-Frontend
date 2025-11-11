import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Upload, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { readFileAsText, validateFileType, validateFileSize, parseCSV, parseJSON } from '../lib/csvParser';
import {
  createBatchIngestion,
  type CreateBatchResponse
} from '../lib/ingestion';

interface DataIngestionDialogProps {
  modelType: 'competitions' | 'venues' | 'referees' | 'players' | 'teams' | 'matches' | 'bulk';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  downloadTemplate: (format: 'csv' | 'json') => void;
}

export function DataIngestionDialog({
  modelType,
  isOpen,
  onClose,
  onSuccess,
  downloadTemplate
}: DataIngestionDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CreateBatchResponse | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileInputId = useId();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Reset previous results
    setResult(null);
    setParseErrors([]);

    // Validate file
    const typeError = validateFileType(selectedFile, ['csv', 'json']);
    if (typeError) {
      setParseErrors([typeError]);
      return;
    }

    const sizeError = validateFileSize(selectedFile, 10);
    if (sizeError) {
      setParseErrors([sizeError]);
      return;
    }

    setFile(selectedFile);
  };

  const handleImport = async () => {
    if (!file) return;

    setIsProcessing(true);
    setResult(null);
    setParseErrors([]);

    try {
      // Read file content
      const content = await readFileAsText(file);
      
      // Parse based on file type
      const extension = file.name.split('.').pop()?.toLowerCase();
      
      // Handle bulk vs regular ingestion
      if (modelType === 'bulk') {
        // For bulk ingestion, send raw content
        const { createBulkIngestion } = await import('../lib/ingestion');
        
        const bulkResult = await createBulkIngestion(
          extension === 'csv' ? 'csv' : 'json',
          extension === 'csv' ? content : undefined,
          extension === 'json' ? JSON.parse(content) : undefined,
          {
            source: 'bulk_upload',
            file_name: file.name,
            uploaded_at: new Date().toISOString()
          }
        );

        // For bulk, we'll navigate to a bulk status page (or the first batch)
        const firstBatchId = Object.values(bulkResult.batch_ids)[0];
        
        setResult({
          ingestion_id: bulkResult.bulk_id,
          target_model: 'bulk',
          status: 'processing',
          total_rows: bulkResult.total_rows,
          message: bulkResult.message
        });
        
        // Navigate to the first batch page to monitor progress
        setTimeout(() => {
          onSuccess();
          handleClose();
          navigate(`/admin/ingestion/${firstBatchId}`);
        }, 1500);
      } else {
        // Regular single-model ingestion - parse and validate
        let parseResult;
        
        if (extension === 'csv') {
          parseResult = parseCSV(content);
        } else if (extension === 'json') {
          parseResult = parseJSON(content);
        } else {
          setParseErrors(['Unsupported file format']);
          setIsProcessing(false);
          return;
        }

        if (parseResult.errors.length > 0) {
          setParseErrors(parseResult.errors);
          setIsProcessing(false);
          return;
        }

        if (parseResult.data.length === 0) {
          setParseErrors(['No data found in file']);
          setIsProcessing(false);
          return;
        }

        const batchName = `${modelType} - ${file.name} - ${new Date().toLocaleString()}`;
        const batchResult = await createBatchIngestion(
          modelType,
          parseResult.data,
          batchName,
          `Uploaded ${parseResult.data.length} rows from ${file.name}`
        );

        setResult(batchResult);
        
        // Navigate to the batch page to monitor progress
        setTimeout(() => {
          onSuccess();
          handleClose();
          navigate(`/admin/ingestion/${batchResult.ingestion_id}`);
        }, 1500);
      }
    } catch (error: any) {
      setParseErrors([error.message || 'Failed to process file']);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setParseErrors([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {t('ingestion.importTitle', { model: t(`ingestion.${modelType}`) })}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isProcessing}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Template Download */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 mb-3">
              {t('ingestion.templatePrompt')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => downloadTemplate('csv')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Download size={16} />
                {t('ingestion.csvTemplate')}
              </button>
              <button
                onClick={() => downloadTemplate('json')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                <Download size={16} />
                {t('ingestion.jsonTemplate')}
              </button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor={fileInputId} className="block text-sm font-medium text-gray-700 mb-2">
              {t('ingestion.selectFile')}
            </label>
            <div className="flex items-center gap-4">
              <input
                id={fileInputId}
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                {t('ingestion.selected')}: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-900 mb-2">
                    {t('ingestion.fileParsingErrors')}
                  </h3>
                  <ul className="text-sm text-red-800 space-y-1">
                    {parseErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Batch Creation Result */}
          {result && (
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="flex-shrink-0 mt-0.5 text-blue-600" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold mb-2 text-blue-900">
                    {t('ingestion.batchCreated')}
                  </h3>
                  <p className="text-sm text-blue-800 mb-3">
                    {result.message}
                  </p>
                  
                  {/* Batch Info */}
                  <div className="bg-white rounded border border-blue-200 p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{t('ingestion.batchId')}:</span>
                      <span className="font-mono text-gray-900">{result.ingestion_id}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{t('ingestion.status')}:</span>
                      <span className="font-medium text-blue-700">{result.status.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{t('ingestion.totalRows')}:</span>
                      <span className="font-bold text-gray-900">{result.total_rows}</span>
                    </div>
                  </div>

                  <p className="text-xs text-blue-700 mt-3">
                    {t('ingestion.redirectingToBatch')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
            disabled={isProcessing}
          >
            {result ? t('ingestion.close') : t('ingestion.cancel')}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || isProcessing || parseErrors.length > 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {t('ingestion.processing')}
                </>
              ) : (
                <>
                  <Upload size={18} />
                  {t('ingestion.importData')}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
