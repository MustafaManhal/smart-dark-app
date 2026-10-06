import type { Voice } from "./speaker";

/**
 * Device voices differ a lot in quality, and the system default is often one
 * of the old robotic ones. A score from the voice's name puts the natural ones
 * first, so read aloud can start with the best voice the device has.
 */

// macOS and iOS novelty voices (they sing, whisper or joke) and the oldest synthetic ones.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|princess|bruce|agnes|vicki|victoria)\b/i;
// The "Eloquence" set on Apple devices: clear, but the classic robot sound.
const ELOQUENCE = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

export function voiceQuality(v: Voice): number {
  const name = v.name;
  let score = 0;
  if (/\b(natural|neural)\b/i.test(name)) score += 75; // Microsoft Edge online voices
  if (/premium/i.test(name)) score += 50;
  if (/siri/i.test(name)) score += 45;
  if (/enhanced/i.test(name)) score += 40;
  if (/^google\b/i.test(name)) score += 20; // Chrome's online voices
  if (/\b(alex|samantha|daniel|karen|moira|tessa|ava|allison|susan|tom|zoe|evan|nathan|joelle|noelle|maged|majed|laila|mariam|tarik)\b/i.test(name)) score += 10;
  if (NOVELTY.test(name)) score -= 60;
  if (ELOQUENCE.test(name)) score -= 40;
  if (/espeak|compact/i.test(name)) score -= 30;
  if (v.local) score += 2; // works offline
  return score;
}

const sameLanguage = (v: Voice, lang: string) => v.lang.toLowerCase().replace("_", "-").startsWith(lang.toLowerCase());

/** Voices for a language, best first; ties keep the device's region first, then the name. */
export function rankVoices(voices: Voice[], lang: string, region = ""): Voice[] {
  const regional = (v: Voice) => (region && v.lang.toLowerCase().replace("_", "-") === region.toLowerCase() ? 1 : 0);
  return voices
    .filter((v) => sameLanguage(v, lang))
    .sort((a, b) => voiceQuality(b) - voiceQuality(a) || regional(b) - regional(a) || a.name.localeCompare(b.name));
}

/** The voice read aloud starts with when the reader has not picked one. */
export function bestVoice(voices: Voice[], lang: string, region = ""): Voice | null {
  return rankVoices(voices, lang, region)[0] ?? null;
}
