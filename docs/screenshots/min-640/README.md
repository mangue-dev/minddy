# MIN-640 launcher preview

These Playwright captures render the actual `AssistantFab` and `NumoLauncherIcon`
components with mocked host contexts and queries. The four desktop states are
idle, working in the background, response ready, and conversation viewed. The
last row shows the shared icon at the mobile launcher size.

The static blue dot sits at the top right of Numo's face and uses a surface-colored
ring to remain distinct in light and dark themes. The launcher tooltip and
accessible name also include the existing localized unread-conversation label.

Notification lifecycle coverage lives in `lib/use-assistant-chat.test.ts` and
`lib/assistant-chat-context.test.ts`; these images verify component appearance,
not an authenticated end-to-end conversation.
