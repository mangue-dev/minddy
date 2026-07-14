-- minddy — MIN-46 : BYOK multi-provider
--
-- Le BYOK n'est plus limité à OpenRouter : un utilisateur configure UN provider
-- actif parmi OpenRouter / OpenAI / Anthropic / Google / Générique (tous
-- adressés via leur endpoint OpenAI-compatible). Le provider « Générique »
-- pointe vers un serveur OpenAI-compatible arbitraire → on stocke sa base URL.
-- La colonne `provider` existe déjà (sans CHECK, le code fait autorité).
-- Idempotent — safe to re-run.

alter table public.user_ai_keys
  add column if not exists base_url text;   -- base URL OpenAI-compatible (provider 'generic')
