// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSetupBanner } from '@/components/pages/database-setup-banner';
import { markDatabaseSetup, dismissDatabaseSetup, isDatabaseSetupPending } from './page-database-setup';
import { trackPageCreation } from './page-creation-settlement';
import { buildOptimisticPage } from './optimistic-page';

const { open, reportError } = vi.hoisted(() => ({ open: vi.fn(), reportError: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/assistant-panel-context', () => ({ useAssistantPanel: () => ({ open }) }));
vi.mock('@/components/pages/database-import-dialog', () => ({ DatabaseImportDialog: () => createElement('div', { 'data-import-wizard': true }) }));
vi.mock('mangue-ui', () => ({
  Button: ({ variant: _variant, size: _size, ...props }: ComponentProps<'button'> & { variant?: string; size?: string }) => createElement('button', props),
  toast: { error: reportError },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let id = 0;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks(); });
async function mount(pageId: string) {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  const page = buildOptimisticPage('project', { id: pageId, title: 'Journal', database_schema: [] }, []);
  await act(async () => root.render(createElement(DatabaseSetupBanner, { projectId: 'project', page })));
}
const click = async (text: string) => act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === text)!.click());

describe('database setup', () => {
  it('offers setup only for a newly created database and remembers dismissal', async () => {
    const pageId = 'page-' + id++;
    await mount(pageId);
    expect(document.querySelector('[data-database-setup]')).toBeNull();
    await act(async () => root.unmount());
    markDatabaseSetup(pageId);
    await mount(pageId);
    expect(document.querySelector('[data-database-setup]')).not.toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="dismissSetup"]')!.click());
    expect(isDatabaseSetupPending(pageId)).toBe(false);
  });
  it('waits for creation and sends the localized prompt with the exact database context once', async () => {
    const pageId = 'page-' + id++;
    markDatabaseSetup(pageId);
    let settle!: () => void;
    trackPageCreation(pageId, new Promise<void>(resolve => { settle = resolve; }));
    await mount(pageId);
    await click('setupAction');
    expect(open).not.toHaveBeenCalled();
    await act(async () => settle());
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ projectId: 'project', prompt: 'setupPrompt', pageContext: { projectId: 'project', pageId, pageTitle: 'Journal', pageIcon: null } });
    expect(isDatabaseSetupPending(pageId)).toBe(false);
  });
  it('opens the import wizard without dismissing setup on cancellation', async () => {
    const pageId = 'page-' + id++;
    markDatabaseSetup(pageId);
    await mount(pageId);
    await click('importAction');
    expect(document.querySelector('[data-import-wizard]')).not.toBeNull();
    expect(isDatabaseSetupPending(pageId)).toBe(true);
    expect(open).not.toHaveBeenCalled();
    dismissDatabaseSetup(pageId);
  });
});
