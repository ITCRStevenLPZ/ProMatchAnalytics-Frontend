/**
 * CSV Parser Utility
 * Handles parsing of CSV and JSON files for data ingestion
 */

export interface ParseResult<T> {
  data: T[];
  errors: string[];
}

export type IngestionModelType =
  | "competitions"
  | "venues"
  | "referees"
  | "players"
  | "teams"
  | "matches"
  | "players_with_team"
  | "bulk";

type FieldType = "string" | "number" | "date" | "enum";

interface FieldSpec {
  name: string;
  type: FieldType;
  required?: boolean;
  enumValues?: string[];
}

const MODEL_SPECS: Partial<Record<IngestionModelType, FieldSpec[]>> = {
  competitions: [
    { name: "name", type: "string", required: true },
    { name: "short_name", type: "string", required: true },
    {
      name: "gender",
      type: "enum",
      required: true,
      enumValues: ["male", "female"],
    },
    { name: "country_name", type: "string", required: true },
  ],
  venues: [
    { name: "name", type: "string", required: true },
    { name: "city", type: "string", required: true },
    { name: "country_name", type: "string", required: true },
    { name: "capacity", type: "number", required: true },
    { name: "surface", type: "string", required: true },
  ],
  referees: [
    { name: "name", type: "string", required: true },
    { name: "country_name", type: "string", required: true },
    { name: "years_of_experience", type: "number", required: true },
  ],
  players: [
    { name: "name", type: "string", required: true },
    {
      name: "position",
      type: "enum",
      required: true,
      enumValues: [
        "GK",
        "CB",
        "LB",
        "RB",
        "LWB",
        "RWB",
        "SW",
        "CDM",
        "CM",
        "CAM",
        "LM",
        "RM",
        "LW",
        "RW",
        "CF",
        "ST",
        "LF",
        "RF",
        "SS",
      ],
    },
    { name: "country_name", type: "string", required: true },
    { name: "birth_date", type: "date", required: true },
    { name: "player_height", type: "number", required: false },
    { name: "player_weight", type: "number", required: false },
    {
      name: "gender",
      type: "enum",
      required: true,
      enumValues: ["male", "female"],
    },
  ],
  teams: [
    { name: "name", type: "string", required: true },
    { name: "short_name", type: "string", required: true },
    { name: "country_name", type: "string", required: true },
    {
      name: "gender",
      type: "enum",
      required: true,
      enumValues: ["male", "female"],
    },
    { name: "founded_year", type: "number", required: true },
    { name: "stadium", type: "string", required: true },
    { name: "manager_name", type: "string", required: false },
  ],
  players_with_team: [
    { name: "name", type: "string", required: true },
    {
      name: "position",
      type: "enum",
      required: true,
      enumValues: [
        "GK",
        "CB",
        "LB",
        "RB",
        "LWB",
        "RWB",
        "SW",
        "CDM",
        "CM",
        "CAM",
        "LM",
        "RM",
        "LW",
        "RW",
        "CF",
        "ST",
        "LF",
        "RF",
        "SS",
      ],
    },
    { name: "country_name", type: "string", required: true },
    { name: "birth_date", type: "date", required: true },
    { name: "player_height", type: "number", required: false },
    { name: "player_weight", type: "number", required: false },
    { name: "team_name", type: "string", required: true },
    { name: "jersey_number", type: "number", required: true },
  ],
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse CSV string to array of objects
 */
export function parseCSV<T = any>(csvContent: string): ParseResult<T> {
  const errors: string[] = [];
  const data: T[] = [];

  try {
    const lines = csvContent.split("\n").filter((line) => line.trim() !== "");

    if (lines.length < 2) {
      errors.push("CSV must have at least a header row and one data row");
      return { data, errors };
    }

    // Parse header
    const headers = parseCSVLine(lines[0]);

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);

        if (values.length !== headers.length) {
          errors.push(
            `Row ${i + 1}: Expected ${headers.length} columns, got ${
              values.length
            }`,
          );
          continue;
        }

        const row: any = {};
        headers.forEach((header, index) => {
          const value = values[index].trim();

          // Try to parse numbers when possible
          if (value !== "" && !isNaN(Number(value))) {
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
  let current = "";
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
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current);
      current = "";
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
      errors.push("JSON must be an array of objects");
      return { data, errors };
    }

    data = parsed;

    if (data.length === 0) {
      errors.push("JSON array is empty");
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
        reject(new Error("Failed to read file"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsText(file);
  });
}

/**
 * Validate file type
 */
export function validateFileType(
  file: File,
  allowedTypes: string[],
): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !allowedTypes.includes(extension)) {
    return `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`;
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

const isValidDateString = (value: unknown) =>
  typeof value === "string" && DATE_REGEX.test(value.trim());

const coerceNumber = (value: unknown) => {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  return undefined;
};

const validateValue = (
  rowIndex: number,
  spec: FieldSpec,
  value: unknown,
): string | null => {
  if (
    spec.required &&
    (value === undefined || value === null || value === "")
  ) {
    return `Row ${rowIndex}: Missing required column "${spec.name}"`;
  }

  if (value === undefined || value === null || value === "") {
    return null;
  }

  switch (spec.type) {
    case "string":
      return typeof value === "string"
        ? null
        : `Row ${rowIndex}: Column "${spec.name}" must be a string`;
    case "number": {
      const num = coerceNumber(value);
      return num === undefined
        ? `Row ${rowIndex}: Column "${spec.name}" must be a number`
        : null;
    }
    case "date":
      return isValidDateString(value)
        ? null
        : `Row ${rowIndex}: Column "${spec.name}" must be a date in YYYY-MM-DD format`;
    case "enum":
      if (typeof value !== "string") {
        return `Row ${rowIndex}: Column "${spec.name}" must be one of ${
          spec.enumValues?.join(", ") || "allowed values"
        }`;
      }
      return spec.enumValues?.includes(value.trim())
        ? null
        : `Row ${rowIndex}: Column "${
            spec.name
          }" must be one of ${spec.enumValues?.join(", ")}`;
    default:
      return null;
  }
};

/**
 * Pre-check parsed CSV/JSON rows against required columns and types before ingestion
 */
export function precheckData(
  model: IngestionModelType,
  rows: Array<Record<string, any>>,
): { errors: string[] } {
  if (!rows || rows.length === 0) {
    return { errors: ["No data found in file"] };
  }

  const specs = MODEL_SPECS[model];
  if (!specs || model === "bulk") {
    return { errors: [] };
  }

  const errors: string[] = [];
  const headerColumns = new Set(Object.keys(rows[0] || {}));
  const requiredColumns = specs
    .filter((field) => field.required)
    .map((field) => field.name);

  requiredColumns.forEach((col) => {
    if (!headerColumns.has(col)) {
      errors.push(`Missing required column "${col}"`);
    }
  });

  const maxErrors = 30;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const spec of specs) {
      if (errors.length >= maxErrors) {
        break;
      }

      const value = row[spec.name];
      const error = validateValue(i + 2, spec, value); // +2 accounts for header + 1-indexed rows
      if (error) {
        errors.push(error);
      } else if (spec.type === "number") {
        const coerced = coerceNumber(value);
        if (coerced !== undefined && coerced !== value) {
          row[spec.name] = coerced;
        }
      }
    }
    if (errors.length >= maxErrors) {
      errors.push(
        "Too many errors; stopping validation early. Please fix reported issues and retry.",
      );
      break;
    }
  }

  return { errors };
}
