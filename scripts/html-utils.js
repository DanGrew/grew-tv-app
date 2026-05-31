function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes('src=')) continue;
    const code = m[2].trim();
    if (code) scripts.push(code);
  }
  return scripts;
}

module.exports = { extractInlineScripts };
