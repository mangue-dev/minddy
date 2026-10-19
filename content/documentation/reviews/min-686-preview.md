# MIN-686 shared reader fixes and pull request images

Date: 2026-10-20. Reviewer: agent:/root. This is agent factual and language
review, not human reader acceptance, an authenticated account rehearsal or a
browser walkthrough with a live pull request.

The audience is a project member reading attachments or reviewing a pull
request. `code-work` advances to revision 16 in all six locales with one added
sentence under `review-pull-requests`: images in a pull request description,
comment or image diff open in the shared full-window reader, and **Close** or
Escape returns to the pull request. The existing `issues` resource and `pages`
file-block instructions already say that Close or Escape returns to the
surface and remain accurate; they are unchanged.

## Factual evidence

`components/image-viewer.tsx` renders the native top-layer dialog in a fresh
host at the end of the body for each opening. The host stops pointer, mouse,
touch, wheel, focus and key events before they reach document listeners, so a
Radix side panel, dialog or sheet below neither dismisses on a click in the
reader, steals its focus nor cancels its scrolling through its scroll lock.
The dialog sets `pointer-events: auto`, which a Radix modal's body lock would
otherwise remove. Content clicks dismiss only when a caller opts in; the
documentation zoom keeps that behavior, every file and pull request reader
closes only with Close or Escape. Backdrop and content now leave together in
0.18 s.

`components/file-viewer.tsx` scrolls long text and Markdown inside the
reader's bounded body and shows PDFs from a local `application/pdf` blob,
because the browser's PDF viewer refuses the sandboxed preview response. The
response itself keeps its sandbox; other documents keep the sandboxed frame.
The page editor's image block carries the documentation thumbnail's shared
layout transition. `components/markdown-image.tsx` and
`components/pull-requests/pr-image-diff.tsx` open the shared `ImageViewer`;
`PrEndpointProvider` wraps the whole pull request detail, so descriptions,
comments and image diffs are covered.

Focused tests: `components/file-viewer.test.tsx`,
`components/pull-requests/pr-image-diff.test.tsx`,
`lib/markdown-image.test.ts`, `components/resources-preview.test.tsx`,
`components/pages/blocks/file-preview.test.tsx` and
`lib/server/attachment-preview-route.test.ts`. jsdom proves event isolation
from document listeners, dismissal policy, host cleanup and the PDF blob; it
does not prove real scrolling or the browser PDF viewer.

## Language and illustration review

The added sentence uses each locale's catalog values of
`PullRequests.imageBefore`, `PullRequests.imageAfter` and `Common.close`,
checked against `messages/*.json`. No control shown in `review-pull-requests-workflow`,
`issue-file-preview` or `page-file-preview` changed; those figures are retained
without new captures and their revision markers advance with the guide.
