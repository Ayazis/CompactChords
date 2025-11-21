const mapUnicodeAccidentals = (line) =>
  line.replace(/♯/g, "#").replace(/♭/g, "b");

const trimLineEndings = (line) => line.replace(/\s+$/g, "");

const normalizeInnerWhitespace = (line) => {
  if (!line.trim()) {
    return "";
  }

  const leading = line.match(/^\s*/)?.[0] ?? "";
  const rest = line.trimStart();
  const collapsed = rest.replace(/\s{2,}/g, " ");
  return `${leading}${collapsed}`;
};

export const normalizeText = (input) => {
  const text = input ?? "";
  const unix = text.replace(/\r\n?/g, "\n");

  return unix.split("\n").map((line) => {
    const mapped = mapUnicodeAccidentals(line);
    const trimmedEnd = trimLineEndings(mapped);
    return normalizeInnerWhitespace(trimmedEnd);
  });
};
