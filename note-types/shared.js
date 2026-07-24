const CHECKLIST_INLINE_REMINDER_REGEX = /\s*\{\{reminder:([^}]+)\}\}\s*$/;

export function isChecklistFormat(text = '') {
  return text.split('\n').some(line => /^\s*[-*]\s*\[[ xX]\]\s*/.test(line))
    || /class=["'][^"']*checklist-(?:container|item)/i.test(text);
}

export function getChecklistPreviewLines(text = '') {
  const markdownLines = `${text}`.split('\n').filter(line => /^\s*[-*]\s*\[[ xX]\]\s*/.test(line));
  if (markdownLines.length > 0) return markdownLines;
  if (!/class=["'][^"']*checklist-item/i.test(text)) return [];

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html');
    return Array.from(doc.querySelectorAll('.checklist-item')).map((item) => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const label = item.querySelector('span[contenteditable], .checklist-text, label');
      const checked = Boolean(checkbox?.checked || checkbox?.hasAttribute('checked') || item.classList.contains('checked'));
      const labelText = (label?.textContent || item.textContent || '').trim();
      return `- [${checked ? 'x' : ' '}] ${labelText}`;
    });
  }

  return `${text}`.split(/(?=<[^>]+class=["'][^"']*checklist-item)/i).map((fragment) => {
    if (!/class=["'][^"']*checklist-item/i.test(fragment)) return '';
    const inputTag = fragment.match(/<input\b[^>]*type=["']?checkbox["']?[^>]*>/i)?.[0] || '';
    const labelHtml = fragment.match(/<span\b[^>]*contenteditable[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const labelText = labelHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
    return `- [${/\bchecked\b/i.test(inputTag) ? 'x' : ' '}] ${labelText}`;
  }).filter(Boolean);
}

export function toggleHtmlChecklistItem(text = '', itemIndex = 0, checked = false) {
  if (typeof DOMParser === 'undefined' || !/class=["'][^"']*checklist-item/i.test(text)) return text;
  const doc = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html');
  const item = doc.querySelectorAll('.checklist-item')[itemIndex];
  const checkbox = item?.querySelector('input[type="checkbox"]');
  if (!checkbox) return text;
  checkbox.checked = checked;
  if (checked) checkbox.setAttribute('checked', '');
  else checkbox.removeAttribute('checked');
  return doc.body.innerHTML;
}

export function plainToChecklist(text = '') {
  if (text.trim() === '') return '- [ ] ';
  return text.split('\n').map(line => {
    if (/^\s*[-*]\s*\[[ xX]\]\s*/.test(line)) return line;
    return `- [ ] ${line}`;
  }).join('\n');
}

export function checklistToPlain(text = '') {
  return text.split('\n').map(line => {
    const checklistMatch = line.match(/^\s*[-*]\s*\[[ xX]\]\s*(.*)$/);
    if (checklistMatch) {
      return checklistMatch[1] || '';
    }
    return line;
  }).join('\n');
}

export function extractChecklistInlineReminder(text = '') {
  const match = `${text}`.match(CHECKLIST_INLINE_REMINDER_REGEX);
  return match ? match[1] : '';
}

export function stripChecklistInlineReminder(text = '') {
  return `${text}`.replace(CHECKLIST_INLINE_REMINDER_REGEX, '').trimEnd();
}

export function applyChecklistInlineReminder(text = '', reminder = '') {
  const cleanText = stripChecklistInlineReminder(text);
  return reminder ? `${cleanText} {{reminder:${reminder}}}` : cleanText;
}

export function parseMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^# (.*$)/gim, '<h3>$1</h3>');

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  let lines = html.split('\n');
  let listState = null;

  const closeActiveList = () => {
    if (!listState) return '';
    const tag = listState === 'ordered' ? 'ol' : 'ul';
    listState = null;
    return `</${tag}>`;
  };

  lines = lines.map((line) => {
    const trimmed = line.trim();
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    const unorderedMatch = trimmed.match(/^([*\-•])\s+(.*)$/);

    if (orderedMatch) {
      let result = '';
      if (listState === 'unordered') {
        result += closeActiveList();
      }
      if (listState !== 'ordered') {
        listState = 'ordered';
        result += '<ol>';
      }
      result += `<li>${orderedMatch[2]}</li>`;
      return result;
    }

    if (unorderedMatch) {
      let result = '';
      if (listState === 'ordered') {
        result += closeActiveList();
      }
      if (listState !== 'unordered') {
        listState = 'unordered';
        result += '<ul>';
      }
      result += `<li>${unorderedMatch[2]}</li>`;
      return result;
    }

    let result = '';
    if (listState) {
      result += closeActiveList();
    }
    result += line;
    return result;
  });

  if (listState) {
    lines.push(closeActiveList());
  }

  html = lines.join('<br>');
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<\/ol><br>/g, '</ol>');
  html = html.replace(/<ul><br>/g, '<ul>');
  html = html.replace(/<ol><br>/g, '<ol>');
  html = html.replace(/<\/li><br><li>/g, '</li><li>');
  html = html.replace(/<br><li>/g, '<li>');
  html = html.replace(/<\/li><br>/g, '</li>');

  return html;
}

export function renderTextWithLinks(text, urlRegex) {
  const fragment = document.createDocumentFragment();
  if (!text) return fragment;

  let lastIndex = 0;
  let match;
  urlRegex.lastIndex = 0;

  while ((match = urlRegex.exec(text)) !== null) {
    const [url] = match;
    const start = match.index;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = new URL(url).toString();
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      fragment.appendChild(anchor);
    } catch (e) {
      fragment.appendChild(document.createTextNode(url));
    }

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

export function renderFormattedText(text, options = {}) {
  const { urlRegex } = options;
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(text);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    urlRegex.lastIndex = 0;
    if (!urlRegex.test(node.textContent)) return;
    const replacement = renderTextWithLinks(node.textContent, urlRegex);
    node.parentNode.replaceChild(replacement, node);
  });

  return template.content;
}
