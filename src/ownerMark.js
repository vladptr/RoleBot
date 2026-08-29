const TAG_BASE = 0xe0000;

export function visibleName(name) {
  return [...String(name ?? "")]
    .filter((char) => {
      const code = char.codePointAt(0);
      return code < 0xe0001 || code > 0xe007f;
    })
    .join("");
}

export function decodeOwner(name) {
  const decoded = [...String(name ?? "")]
    .map((char) => char.codePointAt(0))
    .filter((code) => code >= 0xe0001 && code <= 0xe007f)
    .map((code) => String.fromCharCode(code - TAG_BASE))
    .join("");

  return /^\d{17,20}$/.test(decoded) ? decoded : null;
}

export function applyOwnerMark(name, userId) {
  const stamp = [...String(userId)].map((digit) => String.fromCodePoint(TAG_BASE + digit.charCodeAt(0))).join("");
  return visibleName(name).slice(0, 100 - stamp.length) + stamp;
}
