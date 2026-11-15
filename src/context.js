// Optional "about you" context, read in the browser. Only a short text summary is sent to the
// server, once, to pick a level and a language. Files never leave the device.

export async function githubSummary(username) {
  const u = username.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').split('/')[0];
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u)) throw new Error('That does not look like a GitHub username.');
  const [userR, reposR] = await Promise.all([
    fetch(`https://api.github.com/users/${u}`),
    fetch(`https://api.github.com/users/${u}/repos?per_page=100&sort=pushed`),
  ]);
  if (userR.status === 404) throw new Error(`No GitHub user called ${u}.`);
  if (!userR.ok || !reposR.ok) throw new Error('GitHub is not answering right now. Try the other options.');
  const user = await userR.json();
  const repos = (await reposR.json()).filter((r) => !r.fork);
  const langs = {};
  for (const r of repos) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
  const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const since = (user.created_at || '').slice(0, 4);
  const recent = repos.slice(0, 6).map((r) => r.name + (r.description ? `: ${r.description.slice(0, 80)}` : '')).join('; ');
  const text = [
    `GitHub user with ${repos.length} public repos (not forks)${since ? `, coding on GitHub since ${since}` : ''}.`,
    top.length ? `Languages by repo count: ${top.map(([l, n]) => `${l} ${n}`).join(', ')}.` : 'No languages detected.',
    user.bio ? `Bio: ${user.bio.slice(0, 160)}` : '',
    recent ? `Recent repos: ${recent}` : '',
  ].filter(Boolean).join(' ');
  const label = `${repos.length} repos${top.length ? `, mostly ${top.slice(0, 2).map(([l]) => l).join(' and ')}` : ''}`;
  return { text, label };
}

export async function resumeText(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB.');
  let text;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const parts = [];
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      parts.push(content.items.map((i) => i.str).join(' '));
    }
    text = parts.join('\n');
  } else {
    text = await file.text();
  }
  text = text.replace(/\s+/g, ' ').trim();
  // Drop obvious contact details before anything leaves the page.
  text = text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '').replace(/\+?\d[\d\s().-]{7,}\d/g, '');
  if (text.length < 40) throw new Error('Could not read text from that file. Try pasting a few lines instead.');
  return { text: text.slice(0, 2400), label: `${file.name}, read in your browser` };
}
