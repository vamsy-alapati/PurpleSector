import type { AttemptResult, SectorStatus } from '../game/Game';
import { formatTime } from './format';

const SECTOR_EMOJI: Record<SectorStatus, string> = {
  best: '🟪',
  pb: '🟩',
  slower: '🟨',
  invalid: '⬛',
};

/** Link players are sent to (the game's home page; challenge links come with the leaderboard). */
export function playUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Spoiler-free, Wordle-style result text. */
export function shareText(
  r: AttemptResult,
  trackName: string,
  dateLabel: string,
  rank: { rank: number; total: number } | null,
): string {
  const sectors = r.sectorStatus.map((s) => (s ? SECTOR_EMOJI[s] : '⬜')).join('');
  return [
    `🟣 Purple Sector · ${trackName} (${dateLabel})`,
    `⏱️ ${formatTime(r.time)}  ${sectors}${rank ? `  🏁 #${rank.rank}/${rank.total}` : ''}`,
    `Can you beat it?`,
  ].join('\n');
}

export interface ShareTarget {
  id: string;
  label: string;
  url: (text: string, link: string) => string;
}

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: 'x',
    label: 'X',
    url: (t, l) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(l)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    url: (t, l) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${l}`)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    url: (_t, l) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(l)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    url: (t, l) => `https://www.reddit.com/submit?url=${encodeURIComponent(l)}&title=${encodeURIComponent(t.split('\n')[0]!)}`,
  },
];

/** Native share sheet on phones (WhatsApp, Instagram, Messages…); false if unavailable/cancelled. */
export async function nativeShare(text: string, link: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ text, url: link });
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
