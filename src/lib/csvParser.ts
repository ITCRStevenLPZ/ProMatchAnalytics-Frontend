/**
 * CSV Parser Utility
 * Handles parsing of CSV and JSON files for data ingestion
 */

export interface ParseResult<T> {
  data: T[];
  errors: string[];
}

/**
 * Parse CSV string to array of objects
 */
export function parseCSV<T = any>(csvContent: string): ParseResult<T> {
  const errors: string[] = [];
  const data: T[] = [];
  
  try {
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      errors.push('CSV must have at least a header row and one data row');
      return { data, errors };
    }
    
    // Parse header
    const headers = parseCSVLine(lines[0]);
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        
        if (values.length !== headers.length) {
          errors.push(`Row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`);
          continue;
        }
        
        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index].trim();
          
          // Try to parse numbers
          if (value !== '' && !isNaN(Number(value)) && header !== 'jersey_number') {
            row[header] = Number(value);
          } else {
            row[header] = value;
          }
        });
        
        data.push(row as T);
      } catch (error: any) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }
  } catch (error: any) {
    errors.push(`Failed to parse CSV: ${error.message}`);
  }
  
  return { data, errors };
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  
  return result;
}

/**
 * Parse JSON file content
 */
export function parseJSON<T = any>(jsonContent: string): ParseResult<T> {
  const errors: string[] = [];
  let data: T[] = [];
  
  try {
    const parsed = JSON.parse(jsonContent);
    
    if (!Array.isArray(parsed)) {
      errors.push('JSON must be an array of objects');
      return { data, errors };
    }
    
    data = parsed;
    
    if (data.length === 0) {
      errors.push('JSON array is empty');
    }
  } catch (error: any) {
    errors.push(`Failed to parse JSON: ${error.message}`);
  }
  
  return { data, errors };
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Validate file type
 */
export function validateFileType(file: File, allowedTypes: string[]): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (!extension || !allowedTypes.includes(extension)) {
    return `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`;
  }
  
  return null;
}

/**
 * Validate file size (in MB)
 */
export function validateFileSize(file: File, maxSizeMB: number): string | null {
  const maxBytes = maxSizeMB * 1024 * 1024;
  
  if (file.size > maxBytes) {
    return `File too large. Maximum size: ${maxSizeMB}MB`;
  }
  
  return null;
}
