export const COLORS = [
  { value: "DEFAULT", hex: 0, label: "Без цвета", emoji: "⚪" },
  { value: "E74C3C", hex: 0xe74c3c, label: "Красный", emoji: "🔴" },
  { value: "C0392B", hex: 0xc0392b, label: "Тёмно-красный", emoji: "🟥" },
  { value: "E67E22", hex: 0xe67e22, label: "Оранжевый", emoji: "🟠" },
  { value: "F1C40F", hex: 0xf1c40f, label: "Жёлтый", emoji: "🟡" },
  { value: "F4D03F", hex: 0xf4d03f, label: "Золотой", emoji: "🟨" },
  { value: "2ECC71", hex: 0x2ecc71, label: "Лайм", emoji: "🟢" },
  { value: "27AE60", hex: 0x27ae60, label: "Зелёный", emoji: "🟩" },
  { value: "1E8449", hex: 0x1e8449, label: "Тёмно-зелёный", emoji: "🌲" },
  { value: "1ABC9C", hex: 0x1abc9c, label: "Бирюзовый", emoji: "🌊" },
  { value: "17A2B8", hex: 0x17a2b8, label: "Циан", emoji: "💠" },
  { value: "3498DB", hex: 0x3498db, label: "Голубой", emoji: "🔵" },
  { value: "2E86C1", hex: 0x2e86c1, label: "Синий", emoji: "🟦" },
  { value: "1F618D", hex: 0x1f618d, label: "Тёмно-синий", emoji: "🔹" },
  { value: "9B59B6", hex: 0x9b59b6, label: "Фиолетовый", emoji: "🟣" },
  { value: "8E44AD", hex: 0x8e44ad, label: "Пурпурный", emoji: "🟪" },
  { value: "5B2C6F", hex: 0x5b2c6f, label: "Индиго", emoji: "🍇" },
  { value: "E91E63", hex: 0xe91e63, label: "Розовый", emoji: "💗" },
  { value: "FF69B4", hex: 0xff69b4, label: "Фуксия", emoji: "🌸" },
  { value: "A569BD", hex: 0xa569bd, label: "Лавандовый", emoji: "💜" },
  { value: "A0522D", hex: 0xa0522d, label: "Коричневый", emoji: "🟤" },
  { value: "95A5A6", hex: 0x95a5a6, label: "Серый", emoji: "⚫" },
  { value: "7F8C8D", hex: 0x7f8c8d, label: "Тёмно-серый", emoji: "🔘" },
  { value: "EAECEE", hex: 0xeaecee, label: "Белый", emoji: "⬜" },
  { value: "23272A", hex: 0x23272a, label: "Чёрный", emoji: "⬛" },
];

export function findColor(valueOrHex) {
  const asNumber =
    typeof valueOrHex === "number"
      ? valueOrHex
      : valueOrHex === "DEFAULT"
        ? 0
        : parseInt(String(valueOrHex).replace("#", ""), 16);

  return (
    COLORS.find((color) => color.value === valueOrHex || color.hex === asNumber) ??
    null
  );
}

export function colorName(hex) {
  return findColor(hex)?.label ?? `#${hex.toString(16).padStart(6, "0").toUpperCase()}`;
}
