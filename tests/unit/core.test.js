import test from "node:test";
import assert from "node:assert/strict";
import { tokenizeLine } from "../../src/core/tokenizer.js";
import { normalizeText } from "../../src/core/normalizer.js";
import { isChordToken } from "../../src/core/chord-grammar.js";
import { classifyLine } from "../../src/core/classifier.js";
import { processSong } from "../../src/app/app.js";

test("tokenizeLine splits chords, words, and symbols", () => {
  const tokens = tokenizeLine("C#m7 F#m7 | A B");

  assert.deepStrictEqual(tokens, [
    { value: "C#m7", type: "word" },
    { value: "F#m7", type: "word" },
    { value: "|", type: "symbol" },
    { value: "A", type: "word" },
    { value: "B", type: "word" },
  ]);
});

test("normalizeText maps Unicode accidentals and collapses spaces", () => {
  const lines = normalizeText("C♯m7   F♭\r\nLyric   line  ");

  assert.deepStrictEqual(lines, ["C#m7 Fb", "Lyric line"]);
});

test("isChordToken and classifier differentiate chord vs lyric lines", () => {
  assert.ok(isChordToken("C#m7/G#"));
  assert.ok(!isChordToken("Chorus"));

  const chordLine = "C#m7 F#m7";
  const chordTokens = tokenizeLine(chordLine);
  const chordClassification = classifyLine(chordLine, chordTokens, {
    classifierThreshold: 0.5,
  });
  assert.equal(chordClassification.type, "Chord");
  assert.ok(chordClassification.score > 0.9);

  const lyricLine = "Meet me at midnight";
  const lyricTokens = tokenizeLine(lyricLine);
  const lyricClassification = classifyLine(lyricLine, lyricTokens, {
    classifierThreshold: 0.5,
  });
  assert.equal(lyricClassification.type, "Lyric");
  assert.ok(lyricClassification.score < 0.5);
});

test("processSong builds stats and blocks for a song snippet", () => {
  const input = `Intro:
C#m7 F#m7 A B
Words line

[Chorus]
C#m7 F#m7 A B`;

  const output = processSong(input);

  assert.equal(output.lines.length, 6);
  assert.equal(output.stats.chordLines, 2);
  assert.equal(output.stats.lyricLines, 3);
  assert.equal(output.stats.blankLines, 1);
  assert.equal(output.blocks.length, 2);
  assert.equal(output.blocks[0].label, "Intro:");
  assert.equal(output.blocks[1].label, "[Chorus]");
  assert.match(output.blocks[0].content, /C#m7 F#m7 A B/);
});
