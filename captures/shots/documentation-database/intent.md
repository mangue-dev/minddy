# Isolated database documentation captures

Capture candidate 0.11.1 against the loopback Supabase backend restored for MIN-664. The dedicated project, database, entry and empty import target were created through the real UI. Their IDs are explicitly scoped in `localize.mjs`. Private owner storage state stays outside the repository.

Only exact meaningful demo strings in successful GET responses are translated. IDs, schema types, numeric and checkbox values, relations and server results remain unchanged. Conversion previews are real server responses and no conversion is committed. Import previews parse a local, intentionally translated CSV fixture. The optional AI import-plan request is aborted to avoid calling a configured provider; the importer retains its local inferred mappings. No success response is replaced.

The setup-pending local storage flag restores the undismissed setup state of the database previously created through the UI. It does not alter the server database. Capture records distinguish preview, actual business outcomes and visual inspection.
