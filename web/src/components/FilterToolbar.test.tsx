import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterToolbar } from './FilterToolbar';

describe('<FilterToolbar />', () => {
  it('renders the priority select with All + P0..P4 options', () => {
    render(
      <FilterToolbar
        priority="all"
        query=""
        onPriorityChange={() => {}}
        onQueryChange={() => {}}
      />,
    );
    const select = screen.getByLabelText(/priority/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['All', 'P0', 'P1', 'P2', 'P3', 'P4']);
  });

  it('reflects the controlled priority value', () => {
    render(
      <FilterToolbar
        priority={1}
        query=""
        onPriorityChange={() => {}}
        onQueryChange={() => {}}
      />,
    );
    const select = screen.getByLabelText(/priority/i) as HTMLSelectElement;
    expect(select.value).toBe('1');
  });

  it('emits onPriorityChange when the user picks a value', async () => {
    const onPriorityChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterToolbar
        priority="all"
        query=""
        onPriorityChange={onPriorityChange}
        onQueryChange={() => {}}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/priority/i), '2');
    expect(onPriorityChange).toHaveBeenCalledWith(2);
  });

  it('emits "all" when user picks the All option', async () => {
    const onPriorityChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterToolbar
        priority={1}
        query=""
        onPriorityChange={onPriorityChange}
        onQueryChange={() => {}}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/priority/i), 'All');
    expect(onPriorityChange).toHaveBeenCalledWith('all');
  });

  it('shows the search input with current query value', () => {
    render(
      <FilterToolbar
        priority="all"
        query="hello"
        onPriorityChange={() => {}}
        onQueryChange={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('debounces query changes before invoking onQueryChange', async () => {
    vi.useFakeTimers();
    try {
      const onQueryChange = vi.fn();
      render(
        <FilterToolbar
          priority="all"
          query=""
          onPriorityChange={() => {}}
          onQueryChange={onQueryChange}
        />,
      );
      const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'abc' } });
      expect(onQueryChange).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(onQueryChange).toHaveBeenLastCalledWith('abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates the local input immediately even before debouncing fires', () => {
    render(
      <FilterToolbar
        priority="all"
        query=""
        onPriorityChange={() => {}}
        onQueryChange={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(input.value).toBe('xyz');
  });

  it('only emits the latest value when the user types rapidly', async () => {
    vi.useFakeTimers();
    try {
      const onQueryChange = vi.fn();
      render(
        <FilterToolbar
          priority="all"
          query=""
          onPriorityChange={() => {}}
          onQueryChange={onQueryChange}
        />,
      );
      const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ab' } });
      fireEvent.change(input, { target: { value: 'abc' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(onQueryChange).toHaveBeenCalledWith('abc');
    } finally {
      vi.useRealTimers();
    }
  });
});
