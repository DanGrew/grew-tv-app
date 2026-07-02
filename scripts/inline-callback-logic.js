// Shared matcher for the `no-logic-in-inline-callbacks` arch check (FEAT-042).
// Flags pure transform logic hiding in anonymous block-body callbacks inside
// inline HTML <script> blocks — the untestable-by-vitest gap that
// `no-pure-fn-outside-core` (named functions only) misses.
//
// Detection (kept identical across grew-tv-app and homeschooling-app — do NOT
// let the two copies diverge):
//   - an array-transform method call (.map/.filter/.reduce/.reduceRight/
//     .flatMap/.sort/.find/.findIndex/.some/.every)
//   - whose callback is a BLOCK-BODY function or arrow (`function(){…}` /
//     `(…)=>{…}` / `x=>{…}`); expression-body arrows (`x => x + 1`) are excluded
//   - whose body has NO DOM access (reuses no-pure-fn-outside-core's DOM_PATTERN)
//   - AND has real logic (a computation token — Math.*, arithmetic, comparison,
//     parseInt/parseFloat)

const DOM_PATTERN = /\b(document|window|navigator|location|requestAnimationFrame|cancelAnimationFrame|fetch|decodeAudioBuffer|decodeAudioData)\b|\.(?:style\b|classList\b|textContent\b|innerHTML\b|innerText\b|appendChild\b|removeChild\b|remove\b|insertBefore\b|addEventListener\b|removeEventListener\b|setAttribute\b|getAttribute\b|querySelector\b|querySelectorAll\b|getElementById\b|offsetTop\b|offsetLeft\b|offsetWidth\b|offsetHeight\b|clientHeight\b|clientWidth\b|scrollTo\b|scrollLeft\b|scrollTop\b|cssText\b|createElementNS\b|createBufferSource\b|createGain\b|resume\b|decodeAudioData\b|clearRect\b|fillRect\b|strokeRect\b|drawImage\b|beginPath\b|moveTo\b|lineTo\b|arc\b|fill\b|stroke\b|fillText\b|strokeText\b|getImageData\b|putImageData\b|createLinearGradient\b|createRadialGradient\b)/;

const TRANSFORM_METHODS = 'map|filter|reduce|reduceRight|flatMap|sort|find|findIndex|some|every';
const TRANSFORM_CALL = '\\.\\s*(?:' + TRANSFORM_METHODS + ')\\s*\\(';

// A block-body callback opener immediately following the transform call's `(`.
// FN: `function name?(...) {`  ARROW: `(...) => {` or `x => {`  (async allowed).
const FN_BLOCK = /^\s*function\s*\*?\s*[\w$]*\s*\([^)]*\)\s*\{/;
const ARROW_BLOCK = /^\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/;

// Real-logic tokens: Math.*, parseInt/parseFloat, arithmetic, comparison.
// The body tested here is the callback's brace interior only, so a nested arrow
// `=>` never leaks in as a false `>`; the lookbehind guards nested cases anyway.
const COMPUTATION_PATTERN = /\bMath\.\w+\s*\(|\bparseInt\s*\(|\bparseFloat\s*\(|[+\-*/%]|<=|>=|===|!==|!=|==|(?<![=!<>])[<>]/;

function blockCallbackBraceOffset(rest) {
  const fn = rest.match(FN_BLOCK);
  if (fn) return fn[0].length - 1;
  const arrow = rest.match(ARROW_BLOCK);
  if (arrow) return arrow[0].length - 1;
  return -1;
}

function extractBraceBody(str, braceStart) {
  let depth = 0;
  for (let i = braceStart; i < str.length; i++) {
    if (str[i] === '{') { depth++; continue; }
    if (str[i] === '}') {
      depth--;
      if (depth === 0) return str.slice(braceStart + 1, i);
    }
  }
  return null;
}

function hasLogic(body) {
  return COMPUTATION_PATTERN.test(body);
}

// Returns [{ line }] for each transform callback with pure logic in `script`.
function findInlineCallbackLogic(script) {
  const results = [];
  const re = new RegExp(TRANSFORM_CALL, 'g');
  let m;
  while ((m = re.exec(script)) !== null) {
    const after = m.index + m[0].length;
    const offset = blockCallbackBraceOffset(script.slice(after));
    if (offset < 0) continue;
    const body = extractBraceBody(script, after + offset);
    if (body === null) continue;
    if (DOM_PATTERN.test(body)) continue;
    if (!hasLogic(body)) continue;
    const line = script.slice(0, m.index).split('\n').length;
    results.push({ line });
  }
  return results;
}

module.exports = { findInlineCallbackLogic, DOM_PATTERN, COMPUTATION_PATTERN };
