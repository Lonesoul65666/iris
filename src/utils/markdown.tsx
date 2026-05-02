/** Safe markdown renderer — returns React elements instead of HTML strings.
 *  Supports: headings, bold, italic, inline code, unordered/ordered lists,
 *  tables, horizontal rules, and paragraphs. No dangerouslySetInnerHTML. */

import React from 'react';

/* ── inline formatting ─────────────────────────────────────────────── */

/** Split a text string into React nodes with bold, italic, and code spans. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Tokenize inline markdown: **bold**, *italic*, `code`
  // We process them in a single regex pass with alternations.
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      nodes.push(<strong key={`${keyPrefix}-b${idx}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      nodes.push(<em key={`${keyPrefix}-i${idx}`}>{match[4]}</em>);
    } else if (match[5]) {
      // `code`
      nodes.push(<code key={`${keyPrefix}-c${idx}`}>{match[6]}</code>);
    }

    lastIndex = match.index + match[0].length;
    idx++;
  }

  // Remaining plain text after the last match
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/* ── block-level parsing ───────────────────────────────────────────── */

export function MarkdownContent({ text }: { text: string }): React.ReactElement {
  const lines = text.split('\n');
  const blocks: React.ReactElement[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Table ──
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      const rows: React.ReactElement[] = [];
      for (let r = 0; r < tableRows.length; r++) {
        const cells = tableRows[r].split('|').slice(1, -1).map(c => c.trim());
        // Skip separator rows (e.g. |---|---|)
        if (cells.every(c => /^[-:]+$/.test(c))) continue;
        const isHeader = r === 0;
        const cellElements = cells.map((cell, ci) =>
          isHeader
            ? <th key={ci}>{renderInline(cell, `t${blockKey}-r${r}-c${ci}`)}</th>
            : <td key={ci}>{renderInline(cell, `t${blockKey}-r${r}-c${ci}`)}</td>
        );
        rows.push(<tr key={r}>{cellElements}</tr>);
      }
      blocks.push(<table key={blockKey++}><tbody>{rows}</tbody></table>);
      continue;
    }

    // ── Horizontal rule ──
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      blocks.push(<hr key={blockKey++} className="my-3 border-white/10" />);
      i++;
      continue;
    }

    // ── Headings ──
    if (trimmed.startsWith('### ')) {
      blocks.push(<h3 key={blockKey++}>{renderInline(trimmed.slice(4), `h${blockKey}`)}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(<h2 key={blockKey++}>{renderInline(trimmed.slice(3), `h${blockKey}`)}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(<h1 key={blockKey++}>{renderInline(trimmed.slice(2), `h${blockKey}`)}</h1>);
      i++;
      continue;
    }

    // ── Unordered list ──
    if (/^[-*] /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*] /, ''));
        i++;
      }
      blocks.push(
        <ul key={blockKey++}>
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `ul${blockKey}-${li}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──
    if (/^\d+\. /.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\. /, ''));
        i++;
      }
      blocks.push(
        <ol key={blockKey++}>
          {items.map((item, li) => (
            <li key={li}>{renderInline(item, `ol${blockKey}-${li}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Blank line — skip ──
    if (trimmed === '') {
      i++;
      continue;
    }

    // ── Paragraph (default) ──
    blocks.push(<p key={blockKey++}>{renderInline(trimmed, `p${blockKey}`)}</p>);
    i++;
  }

  return <>{blocks}</>;
}
