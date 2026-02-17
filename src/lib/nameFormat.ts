const WORD_BOUNDARY_REGEX = /(^|[\s\-'.’])([\p{L}])/gu;

const looksLikeIdentifier = (value: string): boolean => {
  if (value.includes(" ")) {
    return false;
  }
  if (!/^[A-Z0-9_-]+$/.test(value)) {
    return false;
  }
  return /[_\d-]/.test(value);
};

export const formatPlayerName = (rawName?: string | null): string => {
  if (!rawName) {
    return "";
  }

  const trimmed = rawName.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  if (looksLikeIdentifier(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLocaleLowerCase();
  return normalized.replace(
    WORD_BOUNDARY_REGEX,
    (_, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase()}`,
  );
};
