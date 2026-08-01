# RAG corpus source review

**Review date:** 2026-08-01
**Scope:** restore the historical Lichess corpus and add reviewed educational
middlegame and endgame studies to `rag-v1`

## Selection rules

The manifest preserves every historical Lichess study that can be verified in
the repository. New studies were selected for human teaching comments,
chapter-based organization, stable public PGN export, named authorship, useful
coverage, and compatibility with the existing `python-chess` ingestion path.
Simple game collections, engine-only variations, generated prose, copied books,
and bulk datasets without explanations were not added.

Public availability and exportability do not establish an open-content license.
The selected studies therefore retain the author's name, profile, canonical
study URL, and `content_license: Unspecified` on every chunk. Cerno does not
describe this material as public domain or openly licensed. This is an explicit
portfolio-project corpus decision; a public redistribution policy would require
a separate permissions review.

## Historical corpus retained

The manifest retains all 15 historical Lichess source IDs present in versioned
project history. Fourteen are enabled and produce 387 opening chunks. Study
`6XvaoT1n` remains disabled because the public PGN export currently returns HTTP
403. The ignored historical Chroma volume is not versioned, so Git cannot prove
or reconstruct any additional source IDs that may once have existed only in a
developer's local index.

## Educational studies incorporated

| Study | Author | Public chapters | Indexed chapters / chunks | Phase / category | Teaching value |
| --- | --- | ---: | ---: | --- | --- |
| [Talk to your pieces! Developing plans I](https://lichess.org/study/kjBSgqoA) | [NoseKnowsAll](https://lichess.org/@/NoseKnowsAll) | 18 | 18 / 23 | middlegame / `middlegame_strategy` | Forming plans by identifying and improving inactive pieces, coordination, weaknesses, and prophylaxis. |
| [Pawns aren't people! Developing plans II](https://lichess.org/study/dYFcDtRq) | [NoseKnowsAll](https://lichess.org/@/NoseKnowsAll) | 17 | 10 / 13 | middlegame / `middlegame_strategy` | Dynamic play, activity over material, pawn breaks, outposts, opposite-side castling, and practical exercises. Seven opening-specific chapters are intentionally excluded. |
| [Intermediate: (Soltis) Pawn Structures](https://lichess.org/study/B5upGe9A) | [jomega](https://lichess.org/@/jomega) | 18 | 18 / 19 | middlegame / `pawn_structures` | Named structures with defining features and plans: Isolani, hanging pawns, pawn chains, Maróczy Bind, Hedgehog, and others. |
| [Intermediate: King Safety](https://lichess.org/study/WfPHnXa1) | [jomega](https://lichess.org/@/jomega) | 1 | 1 / 2 | middlegame / `king_safety` | Focused introduction to a king held in the center and a compromised kingside. |
| [King and Pawn vs King](https://lichess.org/study/EOqdyQeN) | [njswift](https://lichess.org/@/njswift) | about 37 | 32 producing chunks / 32 | endgame / `pawn_endgames` | Rule of the square, key squares, near/distant/diagonal opposition, rook-pawn exceptions, and exercises. |
| [Rook Endgames You Must Know!](https://lichess.org/study/bnboDhFM) | [NoseKnowsAll](https://lichess.org/@/NoseKnowsAll) | 28 | 28 / 32 | endgame / `rook_endgames` | Philidor, Lucena, Vancura, active-rook technique, connected passed pawns, and exercises. |
| [More Endgames You Must Know!](https://lichess.org/study/xtDSXkyi) | [NoseKnowsAll](https://lichess.org/@/NoseKnowsAll) | 22 | 14 / 15 | endgame / `minor_piece_endgames` | Knight-versus-pawn circuits and fortresses, bishop-versus-pawn play, wrong-colour bishops, and opposite-colour bishops. Non-minor-piece chapters are excluded. |

All seven exports returned HTTP 200 during the 2026-08-01 audit. Lichess's
study PGN endpoint is automatable, and each manifest entry records a canonical
study URL and author profile. Upstream authors can still edit, restrict, or
delete their studies, so reproducibility depends on the manifest plus a
successful rebuild at that point in time.

## Sources replaced or not incorporated

The six Wikibooks sources added during the previous corpus expansion are
removed from the active manifest. Their broad categories are replaced as
follows:

| Removed source | Lost coverage | Lichess replacement |
| --- | --- | --- |
| Chess Strategy | one generic evaluation/planning passage | `kjBSgqoA` and `dYFcDtRq`, with worked annotated positions and exercises |
| Pawn Structure | doubled, isolated, hanging, backward, and passed-pawn overview | `B5upGe9A`; strong named-structure coverage, but no general backward/doubled-pawn chapter |
| The Positions of the Kings | castling, pawn shields, pawn storms, and open files | `WfPHnXa1`; narrower coverage of central and compromised kings |
| Pawn Endings | opposition, rule of the square, and passed pawns | `EOqdyQeN`; deeper king-and-pawn fundamentals, but not a broad multi-pawn survey |
| Rook and Pawn Endings | brief one/two/three-pawn overview | `bnboDhFM`; substantially deeper named theoretical positions and practical exercises |
| Minor Piece Endings | two-bishop and bishop-and-knight mating technique | `xtDSXkyi`; richer bishop/knight-versus-pawn material, but no basic mating course |

Other reviewed candidates remain excluded:

| Candidate | Decision |
| --- | --- |
| Lichess open game and puzzle databases | Not educational prose; raw games and tactical puzzles do not explain strategic plans. |
| Automatically reconstructed puzzle PGN datasets | Engine/puzzle-derived and off-target for human educational retrieval. |
| Copied commercial books or unattributed web pages | Provenance and reuse risk are unacceptable. |
| Bulk annotated game collections | Not added unless their annotations form a coherent teaching course rather than a game dump. |

## Coverage and remaining risks

The enabled index changes from 20 sources/430 chunks (including six Wikibooks
sources) to 21 Lichess studies/523 chunks: 387 opening, 57 middlegame, and 79
endgame chunks. It now offers substantially deeper educational material in all
requested phases while remaining a small curated corpus.

Known limitations:

- king-safety coverage is narrow and should abstain on detailed pawn-storm or
  open-file methods not explained by the selected chapter;
- removing Wikibooks loses explicit doubled/backward-pawn and basic mating
  lessons; the golden dataset no longer labels those questions as answerable;
- all source prose and retrieval queries are English-only;
- licenses for the Lichess annotations are unspecified, so attribution must be
  retained and wider redistribution still needs a permissions decision;
- public study exports are mutable and may disappear or become restricted;
- `6XvaoT1n` remains unavailable rather than being silently replaced or indexed
  from an unverifiable copy.
