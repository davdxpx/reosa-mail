import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { EmailList } from '../email-list';
import { useEmailStore } from '@/stores/email-store';
import { DEFAULT_SEARCH_FILTERS, emptyListKind } from '@/lib/jmap/search-utils';

vi.mock('@/hooks/use-email-drag', () => ({
  useEmailDrag: () => ({ dragHandlers: {}, isDragging: false }),
}));
vi.mock('@/components/ui/avatar', () => ({ Avatar: () => null }));
vi.mock('@/stores/auth-store', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ client: null, identities: [], username: null, activeAccountId: 'acct-1' })),
  };
});
vi.mock('@/stores/account-store', () => {
  const state = { accounts: [], getAccountById: () => undefined };
  return {
    useAccountStore: Object.assign(
      (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
      { getState: () => state },
    ),
  };
});

const initialEmailState = useEmailStore.getState();

beforeEach(() => {
  useEmailStore.setState(initialEmailState, true);
  useEmailStore.setState({ selectedMailbox: 'inbox', searchQuery: '', searchFilters: DEFAULT_SEARCH_FILTERS, error: null });
});

describe('emptyListKind', () => {
  const unread = { ...DEFAULT_SEARCH_FILTERS, isUnread: true };
  it('names each empty list by its cause', () => {
    expect(emptyListKind({ searchQuery: '', filters: DEFAULT_SEARCH_FILTERS, loadError: null })).toBe('empty');
    expect(emptyListKind({ searchQuery: '', filters: unread, loadError: null })).toBe('no_unread');
    expect(emptyListKind({ searchQuery: '  ', filters: unread, loadError: null })).toBe('no_unread');
    expect(emptyListKind({ searchQuery: 'rechnung', filters: unread, loadError: null })).toBe('no_results');
    expect(emptyListKind({ searchQuery: '', filters: { ...unread, isStarred: true }, loadError: null })).toBe('no_results');
    expect(emptyListKind({ searchQuery: 'x', filters: DEFAULT_SEARCH_FILTERS, loadError: null })).toBe('no_results');
    // A failed load is never "no emails", whatever the search.
    expect(emptyListKind({ searchQuery: 'x', filters: unread, loadError: 'boom' })).toBe('load_failed');
  });
});

describe('message list empty states', () => {
  // The owner's phone screenshot of 03.11.2026: only the Unread chip, no search
  // text, nothing unread. It read "No results found / Try adjusting your
  // search or filters" under a second "No results found" line.
  it('says there are no unread emails and offers to clear the filter, once', () => {
    const clear = vi.fn();
    useEmailStore.setState({ searchFilters: { ...DEFAULT_SEARCH_FILTERS, isUnread: true } });
    render(<EmailList emails={[]} isLoading={false} onClearSearch={clear} />);
    expect(screen.getAllByText('no_unread_results')).toHaveLength(1);
    expect(screen.queryByText('no_search_results')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'clear_filter' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps "no results" with clear search for a real search', () => {
    useEmailStore.setState({ searchQuery: 'rechnung' });
    render(<EmailList emails={[]} isLoading={false} onClearSearch={() => {}} />);
    expect(screen.getByText('no_search_results')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'clear_search' })).toBeTruthy();
  });

  it('shows a failed load as an error with try again, never as an empty folder', () => {
    const retry = vi.fn();
    useEmailStore.setState({ error: 'Failed to fetch emails' });
    render(<EmailList emails={[]} isLoading={false} onRetry={retry} />);
    expect(screen.queryByText('no_emails')).toBeNull();
    expect(screen.getByText('error_loading')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'try_again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain empty folder', () => {
    render(<EmailList emails={[]} isLoading={false} />);
    expect(screen.getByText('no_emails')).toBeTruthy();
  });
});
