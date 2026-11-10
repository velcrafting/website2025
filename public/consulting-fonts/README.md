# Fonts for consulting brief exports

The PDF generator loads these files on demand and embeds glyph subsets. The
font bytes are unmodified and supplied by this app from fixed URLs.

| File | Source revision | License | SHA-256 |
| --- | --- | --- | --- |
| NotoSans-Regular.ttf | [Noto Fonts, ffebf8c](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans/NotoSans-Regular.ttf) | [OFL 1.1](./OFL-NotoSans.txt) | `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5` |
| NotoSansDevanagari-Regular.ttf | [Noto Fonts, ffebf8c](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf) | [OFL 1.1](./OFL-NotoSans.txt) | `385e78e6359a9d88a0f243d53b1209d7548361ba2194e2b9ec779bcaa7e8949d` |
| NotoSansJP-Regular.otf | [Noto CJK Sans 2.004](https://github.com/notofonts/noto-cjk/blob/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf) | [OFL 1.1](./OFL-NotoSansJP.txt) | `dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073` |

The verified PDF coverage includes Latin with combining marks, Greek,
Cyrillic, Devanagari, and Japanese glyphs in this font release. The
renderer checks each grapheme for glyph coverage. It rejects unsupported
content instead of replacing characters. Arabic and other unverified
right-to-left layouts, emoji, and characters outside the bundled fonts
remain available in Markdown and clipboard export.
