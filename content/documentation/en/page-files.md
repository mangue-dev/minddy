---
{
  "id": "page-files",
  "locale": "en",
  "title": "Attach and retrieve page files",
  "summary": "Upload a file, verify access and understand what publication makes readable.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-file-states.png",
      "alt": "Demo page with an unfinished upload and a saved 67-byte file offering Download.",
      "caption": "Check the actual file state: the second attachment is available, while the first unfinished upload is not.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-files-steps"
  ]
}
---

## Upload and check a file {#page-files}

Open the page as a project member and use its attachment or upload controls. Select a nonempty file within the 10 MB per-file limit. Your account or instance storage quota can impose an additional limit. Keep the original until the upload succeeds.

Images can be inserted as image blocks, and other documents can be attached as file blocks. The server determines the stored media type from the bytes rather than trusting the filename or browser label. Upload acceptance does not guarantee that every format has an inline preview; use the file download when a preview is unavailable.

Check that the file appears in the page and open or download it. File bytes live in Storage, while the page and file metadata determine access. A successful page save alone does not prove the file bytes are available.

## Shared files and failures {#file-access}

A file referenced on a published page can be made available to that page's visitors. Files from pages outside the published branch are not made available merely because another page contains a reference. Review the page and children included in publication before sharing.

If upload fails, check the size, quota and error message. A self-hosted operator should also verify Storage configuration and policies. For a missing file after restoration, recover the matching raw Storage bytes and metadata; a database-only restore cannot recreate the file. Published file URLs are signed for up to 24 hours when the page is rendered. Revoking a share stops new authorized page visits but does not immediately invalidate file URLs already delivered; those can remain usable until their expiry. Downloaded copies cannot be recalled.


![Demo page with an unfinished upload and a saved 67-byte file offering Download.](/documentation/en/page-file-states.png)
