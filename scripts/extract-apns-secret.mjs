#!/usr/bin/env node

import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_KEY = "APNS_PRIVATE_KEY";
const BEGIN = "-----BEGIN PRIVATE KEY-----";
const END = "-----END PRIVATE KEY-----";

function usage() {
  return `Usage: node scripts/extract-apns-secret.mjs [fichier .env ou .p8]

Extrait APNS_PRIVATE_KEY d'un .env, ou lit directement un fichier Apple .p8,
puis écrit sur stdout un PEM canonique avec de vrais retours à la ligne.

Exemples :
  node scripts/extract-apns-secret.mjs .env
  node scripts/extract-apns-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8
  node scripts/extract-apns-secret.mjs .env | pbcopy

Les diagnostics vont sur stderr afin que stdout ne contienne que le secret.`;
}

/** Lit une valeur dotenv sans exécuter le fichier, y compris un PEM multiligne cité. */
export function extractEnvPrivateKey(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const prefix = new RegExp(`^\\s*${ENV_KEY}\\s*=(.*)$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(prefix);
    if (!match) continue;

    let value = match[1].trim();
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : null;
    if (!quote) return value;

    value = value.slice(1);
    while (!value.endsWith(quote) && index + 1 < lines.length) {
      index += 1;
      value += `\n${lines[index]}`;
    }
    if (!value.endsWith(quote)) {
      throw new Error(`${ENV_KEY} commence par ${quote}, mais le guillemet final manque.`);
    }
    return value.slice(0, -1);
  }

  throw new Error(`${ENV_KEY} est absent du fichier .env.`);
}

/**
 * Accepte un PEM normal, des retours à la ligne écrits « \\n », ou un PEM
 * accidentellement aplati avec des espaces, puis recrée sa représentation sûre.
 */
export function canonicalizeApnsPrivateKey(raw) {
  const expanded = raw.trim().replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  const begin = expanded.indexOf(BEGIN);
  const end = expanded.indexOf(END, begin + BEGIN.length);
  if (begin < 0 || end < 0) {
    throw new Error(`Le secret doit contenir ${BEGIN} et ${END}.`);
  }

  const body = expanded.slice(begin + BEGIN.length, end).replace(/\s/g, "");
  if (!body || !/^[A-Za-z0-9+/=]+$/.test(body)) {
    throw new Error("Le corps base64 de la clé APNs est vide ou invalide.");
  }

  const wrapped = body.match(/.{1,64}/g)?.join("\n");
  const pem = `${BEGIN}\n${wrapped}\n${END}\n`;

  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new Error("Apple .p8 invalide : Node.js ne reconnaît pas cette clé privée.");
  }
  if (key.asymmetricKeyType !== "ec") {
    throw new Error(`Clé privée ${key.asymmetricKeyType ?? "inconnue"} : APNs attend une clé EC.`);
  }

  return key.export({ format: "pem", type: "pkcs8" }).toString();
}

async function main() {
  const argument = process.argv[2];
  if (argument === "--help" || argument === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (process.argv.length > 3) throw new Error(usage());

  const sourcePath = path.resolve(argument ?? ".env");
  const source = await readFile(sourcePath, "utf8");
  const raw = sourcePath.endsWith(".p8") ? source : extractEnvPrivateKey(source);
  process.stdout.write(canonicalizeApnsPrivateKey(raw));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[extract-apns-secret] ${error.message}\n`);
    process.exitCode = 1;
  });
}
