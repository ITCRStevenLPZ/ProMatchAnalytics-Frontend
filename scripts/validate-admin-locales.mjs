#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const localeBase = path.join(rootDir, 'public', 'locales');
const adminEnPath = path.join(localeBase, 'en', 'admin.json');
const adminEsPath = path.join(localeBase, 'es', 'admin.json');
const validationMessagesPath = path.join(rootDir, 'src', 'lib', 'validationMessages.ts');

const readJson = async (filePath) => {
  const contents = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(contents);
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${(err && err.message) || err}`);
  }
};

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectLeafKeys = (value, prefix = '', keys = new Set()) => {
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([childKey, childValue]) => {
      const nextPrefix = prefix ? `${prefix}.${childKey}` : childKey;
      collectLeafKeys(childValue, nextPrefix, keys);
    });
    return keys;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const nextPrefix = `${prefix}[${index}]`;
      if (isPlainObject(entry)) {
        collectLeafKeys(entry, nextPrefix, keys);
      } else {
        keys.add(nextPrefix);
      }
    });
    return keys;
  }

  if (prefix) {
    keys.add(prefix);
  }
  return keys;
};

const diffSets = (left, right) =>
  [...left].filter((key) => !right.has(key)).sort();

const extractValidationMessageMap = async () => {
  const contents = await readFile(validationMessagesPath, 'utf8');
  const mapMatch = contents.match(/validationMessageMap[\s\S]*?=\s*{([\s\S]*?)};/);
  if (!mapMatch) {
    throw new Error('Unable to locate validationMessageMap definition in validationMessages.ts');
  }

  const inner = mapMatch[1].replace(/\/\/.*$/gm, '');
  const pairRegex = /'([^']+)'\s*:\s*'([^']+)'/g;
  const pairs = [];
  let match;
  while ((match = pairRegex.exec(inner)) !== null) {
    pairs.push({ message: match[1], translationKey: match[2] });
  }
  return pairs;
};

const hasTranslationKey = (obj, keyPath) => {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return false;
    }
  }
  return current !== undefined && current !== null && `${current}`.trim().length > 0;
};

const formatIssues = (heading, issues) => {
  if (!issues.length) return '';
  const bullets = issues.map((issue) => `  - ${issue}`).join('\n');
  return `${heading}:\n${bullets}`;
};

async function main() {
  const [enAdmin, esAdmin] = await Promise.all([
    readJson(adminEnPath),
    readJson(adminEsPath),
  ]);

  const enKeys = collectLeafKeys(enAdmin);
  const esKeys = collectLeafKeys(esAdmin);

  const missingInEs = diffSets(enKeys, esKeys);
  const missingInEn = diffSets(esKeys, enKeys);

  const issues = [];
  if (missingInEs.length) {
    issues.push(formatIssues('Keys missing in es/admin.json', missingInEs));
  }
  if (missingInEn.length) {
    issues.push(formatIssues('Keys missing in en/admin.json', missingInEn));
  }

  const validationPairs = await extractValidationMessageMap();
  const missingValidationTranslations = [];

  validationPairs.forEach(({ translationKey }) => {
    if (!hasTranslationKey(enAdmin, translationKey)) {
      missingValidationTranslations.push(
        `Missing translation for key "${translationKey}" in en/admin.json`,
      );
    }
    if (!hasTranslationKey(esAdmin, translationKey)) {
      missingValidationTranslations.push(
        `Missing translation for key "${translationKey}" in es/admin.json`,
      );
    }
  });

  if (missingValidationTranslations.length) {
    issues.push(formatIssues('Validation message translation issues', missingValidationTranslations));
  }

  if (issues.length) {
    console.error('❌ Admin locale validation failed:');
    console.error(issues.join('\n\n'));
    process.exitCode = 1;
    return;
  }

  console.log(
    `✅ Admin locale validation passed (${enKeys.size} keys, ${validationPairs.length} validation messages).`,
  );
}

main().catch((err) => {
  console.error('❌ Unexpected error while validating admin locales');
  console.error(err);
  process.exitCode = 1;
});
