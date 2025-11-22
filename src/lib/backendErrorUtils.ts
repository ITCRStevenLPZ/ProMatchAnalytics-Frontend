import { getTranslationKeyForError } from './validationMessages';

type Translator = (key: string) => string;

type SetFieldErrorFn = (name: string, message: string) => void;

type ClearErrorsFn = () => void;

interface ApplyBackendErrorsOptions {
  setFieldError: SetFieldErrorFn;
  clearErrors?: ClearErrorsFn;
  translate?: Translator;
}

const translateMessage = (message?: string, translate?: Translator): string | undefined => {
  if (!message) return undefined;
  const translationKey = getTranslationKeyForError(message);
  if (translate && translationKey !== message) {
    return translate(translationKey);
  }
  return message;
};

const normalizeFieldPath = (loc?: Array<string | number> | string): string | undefined => {
  if (!loc) return undefined;
  if (typeof loc === 'string') {
    return loc;
  }
  const path = loc
    .filter((segment) => typeof segment === 'string' && !['body', 'query', 'path'].includes(segment))
    .join('.');
  return path || undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

export const mapBackendValidationErrors = (
  detail: unknown,
  translate?: Translator,
): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};

  if (!detail) {
    return fieldErrors;
  }

  if (Array.isArray(detail)) {
    detail.forEach((item) => {
      if (!item) return;
      const fieldName = normalizeFieldPath((item as any).loc || (item as any).field);
      const translated = translateMessage((item as any).msg || (item as any).message, translate);
      if (fieldName && translated) {
        fieldErrors[fieldName] = translated;
      }
    });
    return fieldErrors;
  }

  if (isPlainObject(detail)) {
    Object.entries(detail).forEach(([rawField, value]) => {
      if (rawField === 'detail') {
        return;
      }
      const translated = translateMessage(
        Array.isArray(value) ? String(value[0]) : (value as string),
        translate,
      );
      const fieldName = normalizeFieldPath(rawField);
      if (fieldName && translated) {
        fieldErrors[fieldName] = translated;
      }
    });
  }

  return fieldErrors;
};

export const applyBackendValidationErrors = (
  detail: unknown,
  options: ApplyBackendErrorsOptions,
): boolean => {
  const fieldErrors = mapBackendValidationErrors(detail, options.translate);
  const entries = Object.entries(fieldErrors);

  if (entries.length === 0) {
    return false;
  }

  options.clearErrors?.();
  entries.forEach(([field, message]) => {
    options.setFieldError(field, message);
  });

  return true;
};

export interface KnownFieldError {
  field: string;
  translationKey: string;
}

const duplicateIdPatterns: Array<KnownFieldError & { regex: RegExp }> = [
  {
    regex: /^Player '.*' already exists$/i,
    field: 'player_id',
    translationKey: 'validationErrors.playerIdExists',
  },
  {
    regex: /^Player with this ID already exists$/i,
    field: 'player_id',
    translationKey: 'validationErrors.playerIdExists',
  },
  {
    regex: /^Team '.*' already exists$/i,
    field: 'team_id',
    translationKey: 'validationErrors.teamIdExists',
  },
  {
    regex: /^Team with this ID already exists$/i,
    field: 'team_id',
    translationKey: 'validationErrors.teamIdExists',
  },
  {
    regex: /^Competition '.*' already exists$/i,
    field: 'competition_id',
    translationKey: 'validationErrors.competitionIdExists',
  },
  {
    regex: /^Competition with this ID already exists$/i,
    field: 'competition_id',
    translationKey: 'validationErrors.competitionIdExists',
  },
  {
    regex: /^Venue '.*' already exists$/i,
    field: 'venue_id',
    translationKey: 'validationErrors.venueIdExists',
  },
  {
    regex: /^Venue with this ID already exists$/i,
    field: 'venue_id',
    translationKey: 'validationErrors.venueIdExists',
  },
  {
    regex: /^Referee '.*' already exists$/i,
    field: 'referee_id',
    translationKey: 'validationErrors.refereeIdExists',
  },
  {
    regex: /^Referee with this ID already exists$/i,
    field: 'referee_id',
    translationKey: 'validationErrors.refereeIdExists',
  },
];

export const resolveKnownFieldError = (detail: unknown): KnownFieldError | null => {
  if (typeof detail !== 'string') {
    return null;
  }

  const normalized = detail.trim();
  for (const pattern of duplicateIdPatterns) {
    if (pattern.regex.test(normalized)) {
      return {
        field: pattern.field,
        translationKey: pattern.translationKey,
      };
    }
  }

  return null;
};
