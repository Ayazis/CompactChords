// Side-panel rendering: the song library list and the sections list.

import type { Block } from '../core';
import { el } from './render';

export interface SongEntry {
  /** Unique key for the entry, used as data-key on its button. */
  key: string;
  label: string;
  detail?: string;
  badge?: string;
}

export interface SongGroup {
  name: string;
  entries: SongEntry[];
}

export function renderSongList(root: HTMLElement, groups: SongGroup[], activeKey: string | undefined, query: string): void {
  const needle = query.trim().toLowerCase();
  const matches = (entry: SongEntry, group: SongGroup) =>
    !needle || `${entry.label} ${entry.detail ?? ''} ${group.name}`.toLowerCase().includes(needle);

  const nodes: HTMLElement[] = [];
  for (const group of groups) {
    const entries = group.entries.filter((entry) => matches(entry, group));
    if (entries.length === 0) continue;
    const section = el('section', 'song-group');
    section.append(el('h3', 'song-group-title', group.name));
    const list = el('ul', 'song-items');
    for (const entry of entries) {
      const item = el('li', '');
      const button = el('button', 'song-item');
      button.type = 'button';
      button.dataset.key = entry.key;
      if (entry.key === activeKey) button.setAttribute('aria-current', 'true');
      button.append(el('span', 'song-label', entry.label));
      if (entry.detail || entry.badge) {
        const meta = el('span', 'song-meta');
        if (entry.detail) meta.append(el('span', '', entry.detail));
        if (entry.badge) meta.append(el('span', 'badge', entry.badge));
        button.append(meta);
      }
      item.append(button);
      list.append(item);
    }
    section.append(list);
    nodes.push(section);
  }
  if (nodes.length === 0) nodes.push(el('p', 'empty-note', needle ? 'No songs match your search.' : 'No songs yet.'));
  root.replaceChildren(...nodes);
}

/** Readable name for a block: its header, else the start of its first lyric. */
export function blockLabel(block: Block, index: number): string {
  if (block.title) return block.title;
  const lyric = block.lines.find((line) => line.kind === 'Lyric')?.raw.trim();
  if (lyric) return `“${lyric.length > 28 ? `${lyric.slice(0, 26)}…` : lyric}”`;
  return `Section ${index + 1}`;
}

export function renderSections(
  root: HTMLElement,
  blocks: Block[],
  hidden: ReadonlySet<string>,
  chordless: ReadonlySet<string>,
): void {
  if (blocks.length === 0) {
    root.replaceChildren(el('p', 'empty-note', 'Sections appear here once the sheet has content.'));
    return;
  }
  const rows = blocks.map((block, index) => {
    const row = el('li', hidden.has(block.id) ? 'section-row is-hidden' : 'section-row');
    const label = el('span', 'section-label', blockLabel(block, index));
    const toggle = (role: 'visible' | 'chords', text: string, checked: boolean, disabled = false) => {
      const wrap = el('label', 'mini-check');
      const box = el('input', '');
      box.type = 'checkbox';
      box.checked = checked;
      box.disabled = disabled;
      box.dataset.block = block.id;
      box.dataset.role = role;
      box.dataset.focusKey = `${role}:${block.id}`;
      wrap.append(box, el('span', '', text));
      return wrap;
    };
    const hasChords = block.lines.some((line) => line.kind === 'Chord');
    row.append(
      label,
      toggle('visible', 'Show', !hidden.has(block.id)),
      toggle('chords', 'Chords', hasChords && !chordless.has(block.id), !hasChords || hidden.has(block.id)),
    );
    return row;
  });
  const list = el('ul', 'section-list');
  list.append(...rows);
  root.replaceChildren(list);
}
