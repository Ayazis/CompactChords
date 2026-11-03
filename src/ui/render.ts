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

function renderRow(row: Exclude<Row, { type: 'gap' }>): HTMLElement {
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
  }
}

/** Sections and their paragraphs may continue on the next page; rows may not. */
const isSplittable = (node: HTMLElement) => node.classList.contains('block') || node.classList.contains('paragraph');

/**
 * Takes the children of `parent` that lie past the page (in an overflow column
 * or below it) out of the page. A child that only partly fits is split: its
 * rest goes along as an untitled continuation of it.
 */
function takeOverflow(parent: HTMLElement, isOut: (node: HTMLElement) => boolean): HTMLElement[] {
  const children = [...parent.children] as HTMLElement[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (isOut(child)) {
      const moved = children.slice(i);
      for (const node of moved) node.remove();
      return moved;
    }
    if (!isSplittable(child)) continue;
    const rest = takeOverflow(child, isOut);
    if (rest.length === 0) continue;
    const shell = child.cloneNode(false) as HTMLElement;
    if (shell.classList.contains('block')) shell.classList.add('continuation');
    shell.append(...rest);
    const after = children.slice(i + 1);
    for (const node of after) node.remove();
    return [shell, ...after];
  }
  return [];
}

/**
 * Splits a rendered sheet into A4 pages: whatever does not fit on `first` moves
 * to new pages placed right after it. Needs layout, so `first` must be visible
 * (it may be off screen). Returns all pages; the last one balances its columns.
 */
export function paginate(first: HTMLElement): HTMLElement[] {
  while (first.nextElementSibling?.classList.contains('sheet-more')) first.nextElementSibling.remove();
  first.classList.remove('last');
  // The footer closes the song: it goes on the last page once the rest is laid out.
  const footer = first.querySelector<HTMLElement>(':scope > .sheet-banner.bottom');
  footer?.remove();

  const pages = [first];
  const split = (page: HTMLElement): HTMLElement[] => {
    // Without layout (hidden, or no rendering engine) everything stays on one page.
    if (page.offsetWidth === 0) return [];
    const box = page.getBoundingClientRect();
    // The preview may be scaled; rects are, offsets are not.
    const scale = box.width / page.offsetWidth;
    const style = getComputedStyle(page);
    const right = box.left + (page.offsetWidth - parseFloat(style.paddingRight || '0')) * scale - 1;
    const bottom = box.top + (page.offsetHeight - parseFloat(style.paddingBottom || '0')) * scale - 1;
    const rest = takeOverflow(page, (node) => {
      const rect = node.getBoundingClientRect();
      return rect.left >= right || rect.top >= bottom;
    });
    // Something taller than a whole page stays put rather than moving on forever.
    if (page.childElementCount === 0) {
      page.append(...rest);
      return [];
    }
    return rest;
  };
  const addPage = (nodes: HTMLElement[]) => {
    const page = first.cloneNode(false) as HTMLElement;
    page.removeAttribute('id');
    page.removeAttribute('aria-label');
    page.classList.add('sheet-more');
    page.append(...nodes);
    pages[pages.length - 1]!.after(page);
    pages.push(page);
  };
  // Every page keeps at least one child, so this ends; the cap is a safety net.
  for (let rest = split(first); rest.length > 0 && pages.length < 100; rest = split(pages[pages.length - 1]!)) addPage(rest);

  const last = pages[pages.length - 1]!;
  last.classList.add('last');
  if (footer) {
    last.append(footer);
    const rest = split(last);
    if (rest.length > 0) addPage(rest);
  }
  for (const page of pages) page.classList.toggle('last', page === pages[pages.length - 1]);
  return pages;
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
    // Gap rows split a section into paragraphs. A paragraph stays in one column;
    // a long section may continue in the next column between paragraphs.
    let paragraph: HTMLElement | undefined;
    for (const row of block.rows) {
      if (row.type === 'gap') {
        paragraph = undefined;
        continue;
      }
      if (!paragraph) section.append((paragraph = el('div', 'paragraph')));
      paragraph.append(renderRow(row));
    }
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
