const ROOT = "(?:[A-G])";
const ACCIDENTAL = "(?:#|b|♯|♭)?";
const QUALITIES =
  "(?:(?:maj|min|m|dim|aug|sus(?:2|4)?|add(?:9|11|13)?|m?maj|m?add|m?dim|m?aug))?";
const EXTENSIONS = "(?:6|7|9|11|13)?";
const OPTIONAL_ALT =
  "(?:(?:maj|add|sus)(?:6|7|9|11|13))?"; // provide a little extra flexibility
const SLASH_BASS = `(?:/${ROOT}${ACCIDENTAL})?`;

const CHORD_PATTERN = `^(?:N\\.?C\\.?|${ROOT}${ACCIDENTAL}${QUALITIES}${EXTENSIONS}${OPTIONAL_ALT}${SLASH_BASS})$`;

export const CHORD_REGEX = new RegExp(CHORD_PATTERN, "i");

export const isChordToken = (value) => {
  if (!value) {
    return false;
  }

  return CHORD_REGEX.test(value.trim());
};

export const normalizeChordSpelling = (value) => {
  if (!value) {
    return "";
  }

  return value.replace(/♯/g, "#").replace(/♭/g, "b");
};
