# Numo product knowledge

This directory is the versioned source of truth for the product knowledge that Numo retrieves with `get_help`. Each article is a Markdown file with frontmatter, loaded at runtime and included in the API route's deployment trace.

Update an article whenever a user-facing product behavior changes. Use a stable kebab-case `id` that matches the filename, concise summary text, and an ISO `lastReviewed` date. Keep operational instructions and safety rules in the system prompt; put product explanations and setup guidance here.

Run `npm run check:knowledge` before merging a knowledge change. The checker validates required frontmatter, the id/filename match, audience values, review dates, and a minimum useful body length.
