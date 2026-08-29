export const ROLE_EMOJIS = [
  { id: "medal", emoji: "🥇", label: "Медаль" },
  { id: "crown", emoji: "👑", label: "Корона" },
  { id: "star", emoji: "⭐", label: "Звезда" },
  { id: "glow", emoji: "🌟", label: "Сияние" },
  { id: "sparkles", emoji: "✨", label: "Искры" },
  { id: "fire", emoji: "🔥", label: "Огонь" },
  { id: "gem", emoji: "💎", label: "Алмаз" },
  { id: "red", emoji: "❤️", label: "Сердце" },
  { id: "blue", emoji: "💙", label: "Синее сердце" },
  { id: "green", emoji: "💚", label: "Зелёное сердце" },
  { id: "yellow", emoji: "💛", label: "Жёлтое сердце" },
  { id: "purple", emoji: "💜", label: "Фиолетовое сердце" },
  { id: "moon", emoji: "🌙", label: "Луна" },
  { id: "sun", emoji: "☀️", label: "Солнце" },
  { id: "flower", emoji: "🌸", label: "Цветок" },
  { id: "clover", emoji: "🍀", label: "Клевер" },
  { id: "zap", emoji: "⚡", label: "Молния" },
  { id: "game", emoji: "🎮", label: "Игра" },
  { id: "music", emoji: "🎵", label: "Музыка" },
  { id: "snow", emoji: "❄️", label: "Снежинка" },
  { id: "rocket", emoji: "🚀", label: "Ракета" },
  { id: "ghost", emoji: "👻", label: "Призрак" },
  { id: "wolf", emoji: "🐺", label: "Волк" },
  { id: "dragon", emoji: "🐉", label: "Дракон" },
];

export function findRoleEmoji(idOrEmoji) {
  return ROLE_EMOJIS.find((item) => item.id === idOrEmoji || item.emoji === idOrEmoji) ?? null;
}
