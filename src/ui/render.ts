// DOM rendering only: turns formatter output into elements. No parsing rules here.

import type { RenderBlock, Row } from '../core';
import { DEFAULT_SHEET_SETTINGS, type SheetSettings } from '../core/songs';

export interface Heading {
  title: string;
  details: string;
}

export interface UiSettings extends SheetSettings {
  marginMm: number;
}

export const DEFAULT_SETTINGS: UiSettings = { ...DEFAULT_SHEET_SETTINGS, marginMm: 12 };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Replaces "{date}" with today's date (YYYY-MM-DD). */
export function expandBanner(text: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return text.replace(/\{date\}/gi, date);
}

function renderRow(row: Row): HTMLElement {
  switch (row.type) {
    case 'pair': {
      const line = el('div', 'row pair');
      for (const segment of row.segments) {
        const seg = el('span', 'seg');
        seg.append(el('span', 'chord', segment.chord ?? ''), el('span', 'lyric', segment.text || ' '));
        line.append(seg);
      }
      return line;
    }
    case 'chords':
      return el('pre', 'row chords', row.text);
    case 'tab':
      return el('pre', 'row tab', row.text);
    case 'lyric':
      return el('div', 'row lyric', row.text);
    case 'gap':
      return el('div', 'row gap');
  }
}

export function renderSheet(root: HTMLElement, blocks: RenderBlock[], heading: Heading, settings: UiSettings): void {
  root.style.setProperty('--chord-size', `${settings.chordPx}px`);
  root.style.setProperty('--lyric-size', `${settings.lyricPx}px`);
  root.style.setProperty('--margin', `${settings.marginMm}mm`);
  root.style.setProperty('--columns', String(settings.columns));
  root.style.setProperty('--section-gap', `${settings.sectionGap}em`);
  if (settings.chordColor === 'auto') root.style.removeProperty('--chord-color');
  else root.style.setProperty('--chord-color', settings.chordColor);

  const nodes: HTMLElement[] = [];
  const header = expandBanner(settings.headerText).trim();
  if (header) nodes.push(el('div', 'sheet-banner top', header));
  if (heading.title || heading.details) {
    const header = el('header', 'sheet-header');
    if (heading.title) header.append(el('h1', 'sheet-title', heading.title));
    if (heading.details) header.append(el('p', 'sheet-details', heading.details));
    nodes.push(header);
  }
  for (const block of blocks) {
    const section = el('section', block.continuation ? 'block continuation' : 'block');
    if (block.title) section.append(el('h2', 'block-title', block.title));
    section.append(...block.rows.map(renderRow));
    // All tab rows of a block share one size so the staff lines stay aligned.
    const tabWidth = Math.max(0, ...block.rows.map((row) => (row.type === 'tab' ? row.text.length : 0)));
    if (tabWidth > 0) section.style.setProperty('--chars', String(tabWidth));
    nodes.push(section);
  }
  if (blocks.length === 0) {
    nodes.push(el('p', 'sheet-empty', 'Paste or type a chord sheet in the editor, or pick a song from the library.'));
  }
  const footer = expandBanner(settings.footerText).trim();
  if (footer && blocks.length > 0) nodes.push(el('div', 'sheet-banner bottom', footer));
  root.replaceChildren(...nodes);
}
