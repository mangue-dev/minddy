---
{
  "id": "recommended-models",
  "locale": "en",
  "title": "Recommended model configuration",
  "summary": "Start an instance from the AI model configuration minddy Cloud runs.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/api/recommended-models/route.ts",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "components/admin/admin-models-dashboard.tsx",
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 model roles: file contents sentence, source audit against lib/ai-model-config-file.ts; no browser walkthrough)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Import the recommended model configuration"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Start from the minddy Cloud configuration {#recommended-models}

minddy Cloud publishes the AI model configuration it runs, always current: [download the recommended configuration](https://www.minddy.app/api/recommended-models?download=1). The file uses the versioned format of **Export** in the admin **Models** tab (`minddy.instance-models`): the model of each kind, the reasoning level and personal-key provider defaults. It contains no key, no account and no usage.

## Import it on your instance {#import}

Download the file, open **Models** in your instance’s admin dashboard, choose **Import** and select it. Every change is listed before anything is written; **Apply** writes them all, or none when one value is refused, for example a decision model your provider does not serve. Settings the file leaves out return to their default. A file from a newer minddy version is refused until your instance is updated. You can also attach the file in a Numo conversation opened from an administrator session and ask Numo to import it: Numo shows the same list of changes and asks you to confirm. See [instance administration](/docs/instance-administration#models-file).

## Publish your own configuration {#publish}

A self-hosted instance publishes nothing by default. Set `MINDDY_PUBLISH_MODEL_CONFIG=1` to serve its configuration at `/api/recommended-models`, for example to set up several instances alike. The file is public: it only names models and how they are served.
