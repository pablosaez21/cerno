# RAG corpus source review

**Review date:** 2026-07-30  
**Scope:** licensed middlegame and endgame material for `rag-v1`

## Selection rules

The review required a named provenance, an explicit reuse license, a stable
automatable endpoint, human-authored teaching value, and compatibility with the
current bounded-text/metadata pipeline. Public visibility or exportability
alone was not treated as permission to redistribute.

Wikibooks states that its text is generally available under
[CC BY-SA 4.0 and the GFDL](https://en.wikibooks.org/wiki/Wikibooks:Copyrights).
The selected pages are downloaded through the
[official MediaWiki Action API](https://www.mediawiki.org/wiki/API:Main_page)
at a pinned revision. Cerno stores the revision, collective author, permanent
source URL, history URL, and CC BY-SA license with every resulting chunk.
Tables, figures, reference sections, superscript citations, and block quotes
are excluded from ingestion. The explicit quotation-heavy introduction of the
pawn-structure page is also excluded.

## Incorporated sources

All six sources are attributed to **Wikibooks contributors**, use **CC BY-SA
4.0**, and are classified as English because the source prose is English.

| Source | Pinned revision | Phase / category | Coverage | Chunks |
| --- | ---: | --- | --- | ---: |
| [Chess Strategy](https://en.wikibooks.org/w/index.php?title=Chess_Strategy&oldid=4632732) | 4632732 | middlegame / `middlegame_strategy` | positional evaluation and forming plans | 1 |
| [Pawn Structure](https://en.wikibooks.org/w/index.php?title=Chess_Strategy/Pawn_structure&oldid=4567221) | 4567221 | middlegame / `pawn_structures` | doubled, isolated, hanging, backward, and passed pawns | 14 |
| [The Positions of the Kings](https://en.wikibooks.org/w/index.php?title=Chess_Strategy/The_positions_of_the_kings&oldid=4598380) | 4598380 | middlegame / `king_safety` | castling, pawn shield, pawn storms, and open lines | 10 |
| [Pawn Endings](https://en.wikibooks.org/w/index.php?title=Chess/The_Endgame/Pawn_Endings&oldid=4242584) | 4242584 | endgame / `pawn_endgames` | opposition, rule of the square, and passed pawns | 9 |
| [Rook and Pawn Endings](https://en.wikibooks.org/w/index.php?title=Chess/The_Endgame/Rook_and_Pawn_Endings&oldid=2064888) | 2064888 | endgame / `rook_endgames` | one, two, and three-pawn rook endings | 4 |
| [Minor Piece Endings](https://en.wikibooks.org/w/index.php?title=Chess/The_Endgame/Minor_Piece_endings&oldid=4627782) | 4627782 | endgame / `minor_piece_endgames` | two-bishop and bishop-and-knight basic mates | 5 |

The pages are relatively small, reviewable teaching chapters rather than a
bulk dump. Revision pinning prevents upstream edits from changing chunk IDs
without a manifest review. If Cerno intentionally adopts a later revision, the
manifest must be updated and evaluation repeated.

## Investigated but not incorporated

| Candidate | Finding | Decision |
| --- | --- | --- |
| Public [Lichess studies](https://lichess.org/study) | Structured PGN and easy automation, but a study being public does not provide an explicit reuse license for its author's annotations. | Rejected for licensing uncertainty. Existing historical sources remain unchanged; no new study was added. |
| [Lichess open databases](https://database.lichess.org/) | Stable bulk access and clear open-data terms for games/puzzles, but raw games do not provide human strategic explanations. | Rejected for teaching quality and fit. |
| [InterwebAlchemy Lichess puzzle PGN dataset](https://huggingface.co/datasets/InterwebAlchemy/pgn-lichess-puzzle-dataset) | CC0 and structured PGN, but reconstructed engine/puzzle data emphasizes tactics rather than human-authored middlegame plans or endgame instruction. | Rejected as automatically derived and off-target. |
| [Easy2Hard-Bench chess data](https://papers.nips.cc/paper_files/paper/2024/file/4e6f22305275966513990f53cec908e0-Paper-Datasets_and_Benchmarks_Track.pdf) | Open benchmark annotations and chess tags, but designed for puzzle difficulty evaluation rather than reusable explanatory theory. | Rejected for product fit and automatic annotation risk. |
| [Chess endgame records at CentAUR](https://centaur.reading.ac.uk/34268/) | PGN/annotated-PGN research material with named provenance, but no sufficiently clear redistribution license was found and the corpus focuses on record positions, not basic instruction. | Rejected for license and scope. |
| Project Gutenberg chess books | Stable public-domain distribution, but determining EU rights and extracting a small, current, accurately attributed teaching subset would add avoidable legal and parsing complexity. | Rejected for this phase. |

No copied commercial books, scraped unlicensed pages, or automatically
generated teaching prose were added.

## Coverage and remaining risks

The enabled index moves from 14 sources/387 opening chunks to 20 sources/430
chunks: 387 opening, 25 middlegame, and 18 endgame chunks. Coverage now includes
all requested categories, but it remains shallow compared with openings.

Known risks:

- source prose and human-readable metadata are English; Cerno currently
  supports English retrieval queries only;
- multilingual retrieval and query translation are outside the current scope;
- the rook chapter is concise and old, so it covers practical basics but not a
  comprehensive catalogue of theoretical positions;
- the basic minor-piece source covers mating material, not the full family of
  bishop-versus-knight or same/opposite-coloured bishop endings;
- CC BY-SA obligations travel with redistributed chunks, so attribution and
  license metadata must not be stripped by future interfaces;
- upstream pages may disappear even though permanent revision URLs make the
  selected content reproducible while Wikimedia retains revision history.
