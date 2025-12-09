#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const localeBase = path.join(rootDir, 'public', 'locales');
const namespaces = ['admin', 'logger'];
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

const loadNamespace = async (namespace) => {
  const enPath = path.join(localeBase, 'en', `${namespace}.json`);
  const esPath = path.join(localeBase, 'es', `${namespace}.json`);
  const [en, es] = await Promise.all([readJson(enPath), readJson(esPath)]);
  return { en, es, enPath, esPath };
};

async function validateNamespaceParity(namespace) {
  const { en, es, enPath, esPath } = await loadNamespace(namespace);
  const enKeys = collectLeafKeys(en);
  const esKeys = collectLeafKeys(es);
  const missingInEs = diffSets(enKeys, esKeys);
  const missingInEn = diffSets(esKeys, enKeys);

  const issues = [];
  if (missingInEs.length) {
    issues.push(formatIssues(`Keys missing in ${esPath}`, missingInEs));
  }
  if (missingInEn.length) {
    issues.push(formatIssues(`Keys missing in ${enPath}`, missingInEn));
  }

  return { issues, en, es, enKeysCount: enKeys.size };
}

async function validateValidationMessages(enAdmin, esAdmin) {
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

  const issues = [];
  if (missingValidationTranslations.length) {
    issues.push(formatIssues('Validation message translation issues', missingValidationTranslations));
  }

  return { issues, validationCount: validationPairs.length };
}

async function main() {
  const issues = [];
  const namespaceSummaries = [];

  const parityResults = await Promise.all(namespaces.map((ns) => validateNamespaceParity(ns)));

  parityResults.forEach((result, index) => {
    issues.push(...result.issues);
    namespaceSummaries.push(`${namespaces[index]}: ${result.enKeysCount} keys`);
  });

  const adminResult = parityResults[0];
  const { issues: validationIssues, validationCount } = await validateValidationMessages(
    adminResult.en,
    adminResult.es,
  );
  issues.push(...validationIssues);

  if (issues.length) {
    console.error('❌ Locale validation failed:');
    console.error(issues.join('\n\n'));
    process.exitCode = 1;
    return;
  }

  console.log(
    `✅ Locale validation passed (${namespaceSummaries.join(', ')}; ${validationCount} validation messages).`,
  );
}

main().catch((err) => {
  console.error('❌ Unexpected error while validating admin locales');
  console.error(err);
  process.exitCode = 1;
});
