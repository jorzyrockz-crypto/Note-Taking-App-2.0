export function isChecklistFormat(text = '') {
  return text.split('\n').some(line => line.startsWith('- [ ] ') || line.startsWith('- [x] '));
}

export function plainToChecklist(text = '') {
  if (text.trim() === '') return '- [ ] ';
  return text.split('\n').map(line => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) return line;
    return `- [ ] ${line}`;
  }).join('\n');
}

export function checklistToPlain(text = '') {
  return text.split('\n').map(line => {
    if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      return line.substring(6);
    }
    return line;
  }).join('\n');
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
