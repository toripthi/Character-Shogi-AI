import {
  Position,
  Square,
  Piece,
  PieceType,
  Color,
  handPieceTypes,
  movableDirections,
  resolveMoveType,
  MoveType,
} from "tsshogi";

const INITIAL_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

/**
 * Phase 0: tsshogi の上に被せる薄い窓口。
 * Node / ブラウザ / Web Worker 共通で使えるよう Node API・DOM に依存しない。
 *
 * board.legalMoves() // 合法手の一覧 (tsshogi Move の配列)
 * board.makeMove(m)  // 指す -> boolean
 * board.unmakeMove(m)// 戻す
 * board.isGameOver() // 終局判定（合法手0なら詰み/ステイルメイト負け扱い）
 * board.pieceAt(sq)  // マスにある駒 {color,type} or null
 * board.hand(color)  // 持ち駒 {pawn: n, ...}
 * board.turn()       // 手番 Color ("black"/"white")
 * board.inCheck()    // 王手がかかっているか
 */
export class ShogiBoard {
  /** @param {string} [sfen] */
  constructor(sfen = INITIAL_SFEN) {
    this.position = new Position();
    const ok = this.position.resetBySFEN(sfen);
    if (!ok) {
      throw new Error(`Invalid SFEN: ${sfen}`);
    }
    // 手数（SFEN の末尾と同じ数え方。fastboard の moveNumber と同じ意味。2026-11-10）
    const n = Number(String(sfen).trim().split(/\s+/).at(-1));
    this.plyN = String(sfen).trim().split(/\s+/).length >= 4 && Number.isInteger(n) && n >= 1 ? n : 1;
  }

  /** 手数（次に指す手が何手目か。初形は 1） */
  moveNumber() {
    return this.plyN;
  }

  /** @returns {import("tsshogi").Move[]} */
  legalMoves() {
    const pos = this.position;
    const result = [];

    // --- 盤上の駒の移動: 利きベースで擬似合法手を生成し isValidMove で絞る ---
    for (const from of Square.all) {
      const piece = pos.board.at(from);
      if (!piece || piece.color !== pos.color) {
        continue;
      }
      const destinations = ShogiBoard.pseudoDestinations(pos, from);
      for (const to of destinations) {
        const base = pos.createMove(from, to);
        if (!base) {
          continue;
        }
        if (pos.isValidMove(base)) {
          result.push(base);
        }
        // 成り: 成れる駒だけ両方試し、isValidMove に最終判定させる
        if (piece.isPromotable()) {
          const promoted = base.withPromote();
          if (pos.isValidMove(promoted)) {
            result.push(promoted);
          }
        }
      }
    }

    // --- 持ち駒の打つ手 ---
    const hand = pos.hand(pos.color);
    for (const pieceType of handPieceTypes) {
      if (hand.count(pieceType) === 0) {
        continue;
      }
      for (const to of Square.all) {
        if (pos.board.at(to)) {
          continue;
        }
        const move = pos.createMove(pieceType, to);
        if (move && pos.isValidMove(move)) {
          result.push(move);
        }
      }
    }

    return result;
  }

  /**
   * 利きベースの行き先列挙（王手放置・二歩・打ち歩詰め等は考慮しない）。
   * 最終的な合法判定は Position.isValidMove に任せる。
   */
  static pseudoDestinations(pos, from) {
    const piece = pos.board.at(from);
    if (!piece) {
      return [];
    }
    const destinations = [];
    let directions;
    try {
      directions = movableDirections(piece);
    } catch {
      return [];
    }
    for (const dir of directions) {
      const moveType = resolveMoveType(piece, dir);
      let cur = from.neighbor(dir);
      while (cur.valid) {
        const occupant = pos.board.at(cur);
        if (occupant && occupant.color === piece.color) {
          break; // 自分の駒でブロック
        }
        destinations.push(cur);
        if (occupant && occupant.color !== piece.color) {
          break; // 駒を取る手で止まる
        }
        if (moveType === MoveType.SHORT) {
          break;
        }
        cur = cur.neighbor(dir);
      }
    }
    return destinations;
  }

  /** @param {import("tsshogi").Move} move */
  makeMove(move) {
    const ok = this.position.doMove(move);
    if (ok) this.plyN++;
    return ok;
  }

  /** @param {import("tsshogi").Move} move */
  unmakeMove(move) {
    this.position.undoMove(move);
    this.plyN--;
  }

  isGameOver() {
    return this.legalMoves().length === 0;
  }

  /**
   * @param {string|import("tsshogi").Square} sq "7g" のようなUSI or Square
   * @returns {{color: string, type: string}|null}
   */
  pieceAt(sq) {
    const square = typeof sq === "string" ? Square.newByUSI(sq) : sq;
    if (!square) {
      return null;
    }
    const piece = this.position.board.at(square);
    if (!piece) {
      return null;
    }
    return { color: piece.color, type: piece.type };
  }

  /**
   * @param {string} color "black"/"white" or Color
   * @returns {Record<string, number>}
   */
  hand(color) {
    const c = ShogiBoard.normalizeColor(color);
    const h = this.position.hand(c);
    const out = {};
    for (const t of handPieceTypes) {
      out[t] = h.count(t);
    }
    return out;
  }

  /** @returns {string} Color.BLACK ("black") / Color.WHITE ("white") */
  turn() {
    return this.position.color;
  }

  inCheck() {
    return this.position.checked;
  }

  sfen() {
    return this.position.sfen;
  }

  /** USI文字列で1手指す（検証用ショートカット） */
  makeMoveByUSI(usi) {
    const move = this.position.createMoveByUSI(usi);
    if (!move) {
      return null;
    }
    return this.makeMove(move) ? move : null;
  }

  /**
   * 指定マスへの利き数を数える（自他問わず）。
   * @param {string} color "black"/"white"
   * @param {string|import("tsshogi").Square} sq
   */
  countAttackers(sq, color) {
    const square = typeof sq === "string" ? Square.newByUSI(sq) : sq;
    if (!square) {
      return 0;
    }
    const c = ShogiBoard.normalizeColor(color);
    return ShogiBoard.countAttackersOn(this.position.board, square, c);
  }

  /**
   * 4-0-2(a): 全81マスの利き数を1回の走査で数える。
   * control項など「多数のマスの利きを合計する」用途向け。
   * @returns {{black: number[], white: number[]}} 筋1→9×段1→9の順の81要素。
   */
  attackCounts() {
    const board = this.position.board;
    const black = new Array(81).fill(0);
    const white = new Array(81).fill(0);
    for (const from of board.listNonEmptySquares()) {
      const piece = board.at(from);
      if (!piece) {
        continue;
      }
      const out = piece.color === Color.BLACK ? black : white;
      let directions;
      try {
        directions = movableDirections(piece);
      } catch {
        continue;
      }
      for (const dir of directions) {
        const moveType = resolveMoveType(piece, dir);
        let cur = from.neighbor(dir);
        while (cur.valid) {
          out[cur.index] += 1;
          if (board.at(cur)) {
            break;
          }
          if (moveType === MoveType.SHORT) {
            break;
          }
          cur = cur.neighbor(dir);
        }
      }
    }
    return { black, white };
  }

  static countAttackersOn(board, square, color) {
    const target = color === Color.BLACK ? new Piece(Color.BLACK, PieceType.KING) : new Piece(Color.WHITE, PieceType.KING);
    void target;
    // tsshogi Board には利き数取得がないため、駒ごとの movableDirections で数える
    let n = 0;
    for (const from of board.listNonEmptySquares()) {
      const piece = board.at(from);
      if (!piece || piece.color !== color) {
        continue;
      }
      if (ShogiBoard.attacksSquare(board, from, square)) {
        n += 1;
      }
    }
    return n;
  }

  static attacksSquare(board, from, to) {
    const piece = board.at(from);
    if (!piece) {
      return false;
    }
    let directions;
    try {
      directions = movableDirections(piece);
    } catch {
      return false;
    }
    for (const dir of directions) {
      const moveType = resolveMoveType(piece, dir);
      let cur = from.neighbor(dir);
      while (cur.valid) {
        if (cur.equals(to)) {
          return true;
        }
        if (board.at(cur)) {
          break;
        }
        if (moveType === MoveType.SHORT) {
          break;
        }
        cur = cur.neighbor(dir);
      }
    }
    return false;
  }

  static normalizeColor(color) {
    if (color === Color.BLACK || color === Color.WHITE) {
      return color;
    }
    if (color === "black" || color === "b" || color === "sente" || color === "先手") {
      return Color.BLACK;
    }
    if (color === "white" || color === "w" || color === "gote" || color === "後手") {
      return Color.WHITE;
    }
    throw new Error(`Unknown color: ${color}`);
  }

  static get INITIAL_SFEN() {
    return INITIAL_SFEN;
  }

  static get PieceType() {
    return PieceType;
  }

  static get Color() {
    return Color;
  }
}
