/**
 * B-2: 盤面コアの自前実装（fastboard）。
 * tsshogi と完全互換とする（生成順序・SFEN 表記・合法判定・成り / 打つルール）。
 * node_modules への依存ゼロ（tsshogi を import しない）。
 *
 * 構成:
 *   - FastBoard        内部 API（手 = int32、駒 = Uint8）。perft / 探索 / 計測用。
 *   - ShogiBoardFast   board.js の ShogiBoard と同一公開 API の互換ラッパー。
 *
 * 内部表現:
 *   - mailbox 盤（W=13, ix = file*13 + rank, rib 幅1 … 端は OFF）。
 *   - 駒整数: 型 1..14。先手 = 型そのまま、後手 = 型 + WHITE_BIT(16)。
 *   - 手の int32: from 8bit(打ちは DROP_FROM=255) | to 8bit | promote 1bit |
 *     movedType 4bit | capturedType 4bit。
 *
 * 互換の方針（B-3）:
 *   - legalMoves の生成順序・SFEN・判定は tsshogi の該当実装をそのまま再現する。
 *   - 公開ラッパー（ShogiBoardFast）の 12 メソッドは src/core/board.js と同一の
 *     名前・引数・戻り値の形を維持する。
 */

export const INITIAL_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

/* ================= 基本定数 ================= */

export const BLACK = 0;
export const WHITE = 1;
export const WHITE_BIT = 16;
const EMPTY = 0;
const OFF = 255;

const PAWN = 1;
const LANCE = 2;
const KNIGHT = 3;
const SILVER = 4;
const GOLD = 5;
const BISHOP = 6;
const ROOK = 7;
const KING = 8;
const PROM_PAWN = 9;
const PROM_LANCE = 10;
const PROM_KNIGHT = 11;
const PROM_SILVER = 12;
const HORSE = 13;
const DRAGON = 14;

/** 型 1..14 → tsshogi PieceType 文字列 */
export const TYPE_STRING = [
  "",
  "pawn",
  "lance",
  "knight",
  "silver",
  "gold",
  "bishop",
  "rook",
  "king",
  "promPawn",
  "promLance",
  "promKnight",
  "promSilver",
  "horse",
  "dragon",
];
/** tsshogi PieceType 文字列 → 型番号 */
const TYPE_NUM = {
  pawn: 1,
  lance: 2,
  knight: 3,
  silver: 4,
  gold: 5,
  bishop: 6,
  rook: 7,
  king: 8,
  promPawn: 9,
  promLance: 10,
  promKnight: 11,
  promSilver: 12,
  horse: 13,
  dragon: 14,
};

/** 持ち駒になり得る型（tsshogi handPieceTypes 順） */
const HAND_TYPE = [PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK];
/** 持ち駒スロット番号 */
const HAND_TYPE_IDX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
/** 持ち駒 SFEN 出力順（tsshogi Hand.formatSFEN: R,B,G,S,N,L,P） */
const HAND_SFYEN_ORDER = [ROOK, BISHOP, GOLD, SILVER, KNIGHT, LANCE, PAWN];

const PROMOTABLE = [
  false,
  true, // pawn
  true, // lance
  true, // knight
  true, // silver
  false, // gold
  true, // bishop
  true, // rook
  false, // king
  false,
  false,
  false,
  false,
  false,
  false,
];

/**
 * 探索で「成れるときは常に成る」対象の駒種（歩・角・飛）。香・桂・銀は不成が有用な場面があるので対象外。
 * 探索専用（legalMovesForSearch / legalCapturesForSearch）。通常の legalMoves() には影響しない。
 */
const FORCE_PROMOTE = [0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0];

const PROMOTED_TYPE = [
  0,
  PROM_PAWN,
  PROM_LANCE,
  PROM_KNIGHT,
  PROM_SILVER,
  0,
  HORSE,
  DRAGON,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
];
const UNPROMOTED_TYPE = [
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  PAWN,
  LANCE,
  KNIGHT,
  SILVER,
  BISHOP,
  ROOK,
];

/** 手数分け（B-4 の難局面が金/銀を「成り不可」扱いにしないことを確認済み） */

/* 方向（tsshogi directions 配列順） */
const DIR_UP = 0;
const DIR_DF = new Int8Array([
  //   UP  DOWN LEFT RIGHT LUP RUP LDN RDN LUPK RUPK LDNK RDNK  (square.cjs neighbor 準拠)
  0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1,
]);
const DIR_DR = new Int8Array([-1, 1, 0, 0, -1, -1, 1, 1, -2, -2, 2, 2]);
const DIR_REV = [1, 0, 3, 2, 7, 6, 5, 4, 11, 10, 9, 8];
const DIR_NONE = 0;
const DIR_SHORT = 1;
const DIR_LONG = 2;

/* movableDirections の順序も含めた移動表（MoveType 由来の順） */
const DIR_LIST = [];
const DIR_IS_LONG = [];
const MOVE_TYPE_AT = []; // [color][type*12+dir] → 0/SHORT/LONG

(function buildMoveTables() {
  // 先手
  const spec0 = {
    [PAWN]: [[0, DIR_SHORT]],
    [LANCE]: [[0, DIR_LONG]],
    [KNIGHT]: [
      [8, DIR_SHORT],
      [9, DIR_SHORT],
    ],
    [SILVER]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [6, DIR_SHORT],
      [7, DIR_SHORT],
    ],
    [GOLD]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [BISHOP]: [
      [4, DIR_LONG],
      [5, DIR_LONG],
      [6, DIR_LONG],
      [7, DIR_LONG],
    ],
    [ROOK]: [
      [0, DIR_LONG],
      [2, DIR_LONG],
      [3, DIR_LONG],
      [1, DIR_LONG],
    ],
    [KING]: [
      [6, DIR_SHORT],
      [7, DIR_SHORT],
      [4, DIR_SHORT],
      [5, DIR_SHORT],
      [1, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [PROM_PAWN]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [PROM_LANCE]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [PROM_KNIGHT]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [PROM_SILVER]: [
      [4, DIR_SHORT],
      [0, DIR_SHORT],
      [5, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [HORSE]: [
      [4, DIR_LONG],
      [5, DIR_LONG],
      [6, DIR_LONG],
      [7, DIR_LONG],
      [0, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [1, DIR_SHORT],
    ],
    [DRAGON]: [
      [0, DIR_LONG],
      [2, DIR_LONG],
      [3, DIR_LONG],
      [1, DIR_LONG],
      [4, DIR_SHORT],
      [5, DIR_SHORT],
      [6, DIR_SHORT],
      [7, DIR_SHORT],
    ],
  };
  // 後手
  const spec1 = {
    [PAWN]: [[1, DIR_SHORT]],
    [LANCE]: [[1, DIR_LONG]],
    [KNIGHT]: [
      [10, DIR_SHORT],
      [11, DIR_SHORT],
    ],
    [SILVER]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [4, DIR_SHORT],
      [5, DIR_SHORT],
    ],
    [GOLD]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [BISHOP]: [
      [6, DIR_LONG],
      [7, DIR_LONG],
      [4, DIR_LONG],
      [5, DIR_LONG],
    ],
    [ROOK]: [
      [1, DIR_LONG],
      [2, DIR_LONG],
      [3, DIR_LONG],
      [0, DIR_LONG],
    ],
    [KING]: spec0[KING],
    [PROM_PAWN]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [PROM_LANCE]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [PROM_KNIGHT]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [PROM_SILVER]: [
      [6, DIR_SHORT],
      [1, DIR_SHORT],
      [7, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [HORSE]: [
      [6, DIR_LONG],
      [7, DIR_LONG],
      [4, DIR_LONG],
      [5, DIR_LONG],
      [1, DIR_SHORT],
      [2, DIR_SHORT],
      [3, DIR_SHORT],
      [0, DIR_SHORT],
    ],
    [DRAGON]: [
      [1, DIR_LONG],
      [2, DIR_LONG],
      [3, DIR_LONG],
      [0, DIR_LONG],
      [6, DIR_SHORT],
      [7, DIR_SHORT],
      [4, DIR_SHORT],
      [5, DIR_SHORT],
    ],
  };
  for (let c = 0; c <= 1; c++) {
    const spec = c === 0 ? spec0 : spec1;
    const list = new Array(15);
    const long = new Array(15);
    const mta = new Uint8Array(15 * 12);
    for (let type = 1; type <= 14; type++) {
      const dirs = spec[type] || [];
      const dirArr = new Int8Array(dirs.length);
      const longArr = new Uint8Array(dirs.length);
      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i][0];
        const mt = dirs[i][1];
        dirArr[i] = dir;
        longArr[i] = mt === DIR_LONG ? 1 : 0;
        mta[type * 12 + dir] = mt;
      }
      list[type] = dirArr;
      long[type] = longArr;
    }
    DIR_LIST.push(list);
    DIR_IS_LONG.push(long);
    MOVE_TYPE_AT.push(mta);
  }
})();

/* 行き所のない駒（tsshogi invalidRankMap） */
const BASE_RANK_OK = [];
(function buildBaseRankOk() {
  // 1..9 で成り不可ランクを 0 に。black: 歩/香 r1, 桂 r1-2 / white: 歩/香 r9, 桂 r8-9。
  for (let c = 0; c <= 1; c++) {
    const table = [];
    for (let type = 0; type <= 14; type++) {
      const ranks = new Uint8Array(10);
      ranks.fill(1, 1, 10);
      if (type === PAWN || type === LANCE || type === KNIGHT) {
        if (c === BLACK) {
          ranks[1] = 0;
          if (type === KNIGHT) ranks[2] = 0;
        } else {
          ranks[9] = 0;
          if (type === KNIGHT) ranks[8] = 0;
        }
      }
      table.push(ranks);
    }
    BASE_RANK_OK.push(table);
  }
})();

/* 成等地（tsshogi isPromotableRank） */
const ZONE = [];
(function buildZone() {
  for (let c = 0; c <= 1; c++) {
    const z = new Uint8Array(10);
    for (let r = 1; r <= 9; r++) {
      z[r] = c === BLACK ? (r <= 3 ? 1 : 0) : r >= 7 ? 1 : 0;
    }
    ZONE.push(z);
  }
})();

/* ================= mailbox 盤のインデックス ================= */

const W = 13;
const BLEN = W * W; // 169
const ixOf = (f, r) => f * W + r;
export const IX_F = new Int8Array(BLEN);
export const IX_R = new Int8Array(BLEN);
/** internal ix → tsshogi Square.index（0=9一 … 80=1九） */
export const IX_TO_TSSHOGI = new Uint8Array(BLEN).fill(OFF);
/** tsshogi Square.index → internal ix */
const IX_FROM_TSSHOGI = new Uint8Array(81);
/** tsshogi 手数分け（B-3）square.file/rank → internal ix */
export const SQ_TO_IX = new Uint16Array(10 * 10).fill(OFF); // [file*10+rank] 遅延参照用ではなくアクセラレータ

(function buildSquareMaps() {
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const ix = ixOf(f, r);
      IX_F[ix] = f;
      IX_R[ix] = r;
      const t = (r - 1) * 9 + (9 - f); // Square.index: x = 9-file, y = rank-1
      IX_TO_TSSHOGI[ix] = t;
      IX_FROM_TSSHOGI[t] = ix;
      SQ_TO_IX[f * 10 + r] = ix;
    }
  }
})();

/** SFEN 駒文字（先手。後手は toLowerCase） */
const SFEN_CHARS = [
  "",
  "P",
  "L",
  "N",
  "S",
  "G",
  "B",
  "R",
  "K",
  "+P",
  "+L",
  "+N",
  "+S",
  "+B",
  "+R",
];
/** 手 int32 の from が「打ち」であることを表す値 */
const DROP_FROM = 255;
export const PROMOTE_BIT = 0x10000;

const encodeMove = (from, to, promote, movedType, capturedType) =>
  from | (to << 8) | (promote ? PROMOTE_BIT : 0) | (movedType << 17) | (capturedType << 21);

/** SFEN 駒文字 → {type, black} or null（tsshogi sfenCharToTypeMap 相当） */
function pieceFromSFENChar(c) {
  if (!c) {
    return null;
  }
  const isProm = c.length === 2;
  const base = isProm ? c[1] : c;
  if (isProm ? c[0] !== "+" : base === "+") {
    return null;
  }
  const upper = base.toUpperCase();
  const black = base === upper;
  const baseType = PIECE_BY_SFEN_CHAR[upper];
  if (!baseType || (isProm && baseType === KING)) {
    return null;
  }
  const type = isProm ? PROMOTED_BY_SFHEN_CHAR[upper] : baseType;
  return { type, black };
}

const PIECE_BY_SFEN_CHAR = {
  P: PAWN,
  L: LANCE,
  N: KNIGHT,
  S: SILVER,
  G: GOLD,
  B: BISHOP,
  R: ROOK,
  K: KING,
};
const PROMOTED_BY_SFHEN_CHAR = {
  P: PROM_PAWN,
  L: PROM_LANCE,
  N: PROM_KNIGHT,
  S: PROM_SILVER,
  B: HORSE,
  R: DRAGON,
};

const HAND_VALID_RE = /^(?:[0-9]{0,2}[PLNSGBRplnsgbr])+$/;

/* ================= Zobrist ハッシュ（置換表のキー） =================
 * 局面（盤・手番・持ち駒）を 64 ビット（hi/lo の 2 つの int32）の XOR で表す。SFEN 文字列を毎ノード作るより
 * 大幅に速い（2026-11-05。探索の時間 -29%）。区別の単位は SFEN の先頭3フィールドと同じ（手数は含まない）。
 * 置換表のキーは zkey()（53 ビットの整数）。衝突しても検出はしない（約 10 万局面で確率 1e-6 のオーダー）。
 * 駒の符号は 0〜31（種類 | 後手ビット）、持ち駒は (色, 種類) ごとに枚数 0〜19 の乱数を持つ。 */
const ZP_HI = new Int32Array(32 * BLEN);
const ZP_LO = new Int32Array(32 * BLEN);
const ZH_HI = new Int32Array(2 * 7 * 20);
const ZH_LO = new Int32Array(2 * 7 * 20);
let ZT_HI = 0; // 手番（後手番のとき XOR）
let ZT_LO = 0;
{
  // 固定シードの mulberry32（実行のたびに同じ表になる＝キーも再現できる）
  let a = 0x9e3779b9;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
  for (let i = 0; i < ZP_HI.length; i++) {
    ZP_HI[i] = rnd();
    ZP_LO[i] = rnd();
  }
  for (let i = 0; i < ZH_HI.length; i++) {
    ZH_HI[i] = rnd();
    ZH_LO[i] = rnd();
  }
  ZT_HI = rnd();
  ZT_LO = rnd();
}

/* ================= FastBoard（内部API） ================= */

export class FastBoard {
  constructor() {
    this.board = new Uint8Array(BLEN);
    this.turnN = BLACK;
    // 手数（SFEN の末尾の「手数」と同じ数え方：次に指す手が何手目か。初形は 1）。makeMove で +1、unmakeMove で -1。
    // 玉の位置の評価（2026-11-10 §4）が「対局の手数」を見るために持つ。sfen() の出力には載せない（局面の同一判定に使うため）。
    this.plyN = 1;
    this.hands = [new Uint16Array(7), new Uint16Array(7)];
    this.kingSq = new Int16Array(2); // -1 = 不在
    this.piecePos = [new Uint8Array(40), new Uint8Array(40)];
    this.pieceCnt = [0, 0];
    this.pieceIdx = [new Uint8Array(BLEN).fill(OFF), new Uint8Array(BLEN).fill(OFF)];
    this.undoCap = []; // 捕獲の際の captured 位置（リスト内 index）
    this.scratchPin = new Uint8Array(BLEN);
    // Zobrist ハッシュ（hi/lo）と、makeMove ごとに積む戻し用のスタック（unmakeMove で復元する）
    this.zhi = 0;
    this.zlo = 0;
    this.zsp = 0;
    this.zsHi = new Int32Array(1024);
    this.zsLo = new Int32Array(1024);
    this.clear();
  }

  clear() {
    this.board.fill(0);
    this.turnN = BLACK;
    this.plyN = 1;
    this.hands[0].fill(0);
    this.hands[1].fill(0);
    this.kingSq[0] = -1;
    this.kingSq[1] = -1;
    this.pieceCnt[0] = 0;
    this.pieceCnt[1] = 0;
    this.pieceIdx[0].fill(OFF);
    this.pieceIdx[1].fill(OFF);
    this.undoCap.length = 0;
  }

  resetBySFEN(sfen) {
    if (typeof sfen !== "string" || !FastBoard.isValidSFEN(sfen)) {
      return false;
    }
    const sections = sfen.split(" ");
    if ((sections.length === 5 || sections.length === 4) && sections[0] === "sfen") {
      sections.shift();
    }
    if (sections.length !== 4 && sections.length !== 3) {
      return false;
    }
    this.clear();
    this._resetBoardBySFEN(sections[0]);
    this.turnN = sections[1] === "b" ? BLACK : WHITE;
    const hands = FastBoard.parseHandSFEN(sections[2]);
    if (!hands) {
      return false;
    }
    this.hands[BLACK] = hands[0];
    this.hands[WHITE] = hands[1];
    if (sections.length === 4) {
      const n = Number(sections[3]);
      this.plyN = Number.isInteger(n) && n >= 1 ? n : 1;
    }
    this._computeZobrist();
    return true;
  }

  /** Zobrist ハッシュを盤面から作り直す（resetBySFEN の最後に1回。以降は makeMove が差分で更新する）。 */
  _computeZobrist() {
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < BLEN; i++) {
      const pc = this.board[i];
      if (pc !== EMPTY) {
        hi ^= ZP_HI[pc * BLEN + i];
        lo ^= ZP_LO[pc * BLEN + i];
      }
    }
    for (let c = 0; c < 2; c++) {
      for (let k = 0; k < 7; k++) {
        const j = (c * 7 + k) * 20 + this.hands[c][k];
        hi ^= ZH_HI[j];
        lo ^= ZH_LO[j];
      }
    }
    if (this.turnN === WHITE) {
      hi ^= ZT_HI;
      lo ^= ZT_LO;
    }
    this.zhi = hi;
    this.zlo = lo;
    this.zsp = 0;
  }

  /**
   * 局面のキー（盤・手番・持ち駒。sfen() の先頭3フィールドと同じ区別）。53 ビットの整数。
   * 置換表（Map）のキーに使う。
   */
  zkey() {
    return (this.zhi >>> 0) * 2097152 + (this.zlo >>> 11);
  }

  _resetBoardBySFEN(boardSFEN) {
    // 事前に isValidSFEN 通過済み前提のパース。
    const rows = boardSFEN.split("/");
    for (let y = 0; y < 9; y++) {
      let x = 0;
      const row = rows[y];
      for (let i = 0; i < row.length; i++) {
        let c = row[i];
        if (c === "+") {
          i += 1;
          c += row[i];
        }
        if (c >= "1" && c <= "9") {
          x += Number(c);
        } else {
          const piece = pieceFromSFENChar(c);
          const f = 9 - x;
          const r = y + 1;
          const ix = ixOf(f, r);
          const pc = piece.type | (piece.black ? 0 : WHITE_BIT);
          this.board[ix] = pc;
          if (piece.type === KING) {
            this.kingSq[piece.black ? BLACK : WHITE] = ix;
          }
          x += 1;
        }
      }
    }
    this._rebuildPieceLists();
  }

  _rebuildPieceLists() {
    for (let c = 0; c <= 1; c++) {
      this.pieceCnt[c] = 0;
      this.pieceIdx[c].fill(OFF);
      for (let t = 0; t < 81; t++) {
        const ix = IX_FROM_TSSHOGI[t];
        const p = this.board[ix];
        if (p !== 0 && (p >= WHITE_BIT ? WHITE : BLACK) === c) {
          this._listAdd(c, ix);
        }
      }
    }
  }

  _listAdd(c, ix) {
    const pos = this.piecePos[c];
    const idx = this.pieceIdx[c];
    const k = this.pieceCnt[c];
    pos[k] = ix;
    idx[ix] = k;
    this.pieceCnt[c] = k + 1;
  }

  /** swap-remove。戻り値は構造が復元できるよう「捨てた位置」 */
  _listRemoveAt(c, ix) {
    const pos = this.piecePos[c];
    const idx = this.pieceIdx[c];
    const k = idx[ix];
    const last = this.pieceCnt[c] - 1;
    if (k !== last) {
      const li = pos[last];
      pos[k] = li;
      idx[li] = k;
    }
    idx[ix] = OFF;
    this.pieceCnt[c] = last;
    return k;
  }

  /* ---------------- SFEN ---------------- */

  sfen() {
    let s = "";
    for (let r = 1; r <= 9; r++) {
      let empty = 0;
      for (let x = 0; x <= 8; x++) {
        const f = 9 - x;
        const p = this.board[ixOf(f, r)];
        if (p === EMPTY) {
          empty += 1;
        } else {
          if (empty) {
            s += empty;
            empty = 0;
          }
          const t = p & 15;
          let ch = SFEN_CHARS[t];
          if (p >= WHITE_BIT) {
            ch = ch.toLowerCase();
          }
          s += ch;
        }
      }
      if (empty) {
        s += empty;
      }
      if (r !== 9) {
        s += "/";
      }
    }
    s += this.turnN === BLACK ? " b " : " w ";
    s += this._handStr();
    s += " 1";
    return s;
  }

  /** tsshogi Hand.formatSFEN 相当: 先手分と後手分を RBGSNLP 順で連結 */
  _handStr() {
    let b = "";
    let w = "";
    for (const t of HAND_SFYEN_ORDER) {
      const ch = SFEN_CHARS[t];
      const nb = this.hands[BLACK][HAND_TYPE_IDX[t]];
      const nw = this.hands[WHITE][HAND_TYPE_IDX[t]];
      if (nb !== 0) {
        b += (nb > 1 ? nb : "") + ch;
      }
      if (nw !== 0) {
        w += (nw > 1 ? nw : "") + ch.toLowerCase();
      }
    }
    if (b === "" && w === "") {
      return "-";
    }
    if (w === "") {
      return b;
    }
    if (b === "") {
      return w;
    }
    return b + w;
  }

  /* ---------------- 合法手生成（tsshogi legalMoves と同一順序） ---------------- */

  legalMoves() {
    return this._genLegal(false);
  }

  /**
   * 合法手のうち「捕獲手」のみ（legalMoves().filter((m) => m.capturedPieceType)
   * と完全に同一の内容・順序）。打ち手は捕獲にならないため生成しない。
   * 静止探索（capture-only、src/search/negamax.js）用。
   */
  legalCaptures() {
    return this._genLegal(true);
  }

  /**
   * 探索用の合法手。legalMoves() から「成れるのに成らない歩・角・飛の手」だけを除いたもの
   * （順序は legalMoves() と同じ）。成れる手は常に成る手のほうを読む（2026-11 ユーザー指示 ①）。
   * 成れる場合、成る手は必ず合法なので、手が全部消えることはない（合法手0の判定は変わらない）。
   * 相手（人間）が不成で指した手を盤に反映するのは通常の legalMoves() 側の仕事で、ここでは扱わない。
   */
  legalMovesForSearch() {
    return this._genLegal(false, true);
  }

  /** 探索用の捕獲手（legalCaptures() から同様に不成の歩・角・飛を除く）。静止探索用。 */
  legalCapturesForSearch() {
    return this._genLegal(true, true);
  }

  /** @private 合法手生成の本体（capturesOnly=true で捕獲手のみ・順序も一致。forcePromote=true で歩角飛の不成を除く） */
  _genLegal(capturesOnly, forcePromote = false) {
    const moves = [];
    const board = this.board;
    const turn = this.turnN;
    const e = turn ^ 1;
    const king = this.kingSq[turn];
    const pin = this.scratchPin;
    let inCheck = false;
    if (king >= 0) {
      inCheck = this.isAttackedByRaw(king, e);
      if (!inCheck) {
        this._computePins(king, e);
      }
    }
    for (let t = 0; t < 81; t++) {
      const from = IX_FROM_TSSHOGI[t];
      const pc = board[from];
      if (pc === EMPTY) {
        continue;
      }
      const pcIsWhite = pc >= WHITE_BIT;
      if ((pcIsWhite ? WHITE : BLACK) !== turn) {
        continue;
      }
      const ptype = pc & 15;
      const mustVerify =
        king >= 0 && (ptype === KING || inCheck || pin[from] !== 0);
      const dirs = DIR_LIST[turn][ptype];
      const longs = DIR_IS_LONG[turn][ptype];
      const nD = dirs.length;
      const fromR = IX_R[from];
      for (let d = 0; d < nD; d++) {
        const di = dirs[d];
        const isLong = longs[d] === 1;
        const df = DIR_DF[di];
        const dr = DIR_DR[di];
        let f = IX_F[from];
        let r = fromR;
        while (true) {
          f += df;
          r += dr;
          if (f < 1 || f > 9 || r < 1 || r > 9) {
            break;
          }
          const to = f * W + r;
          const occ = board[to];
          if (occ !== EMPTY && (occ >= WHITE_BIT ? WHITE : BLACK) === turn) {
            break; // 自分の駒でブロック
          }
          const capType = occ === EMPTY ? 0 : occ & 15;
          if (capturesOnly && occ === EMPTY) {
            // 空きマスは捕獲ではないので push しない（駒の無い方向は元の legalMoves と同じ規則で止まる）
            if (!isLong) {
              break;
            }
            continue;
          }
          if (mustVerify) {
            // 自玉の安全確認: 王手放置の isAttacked 判定
            const safe =
              ptype === KING
                ? !this.isAttackedByRaw(to, e, -1, from)
                : !this.isAttackedByRaw(king, e, to, from);
            if (safe) {
              // base（非成り）
              const canPromote = PROMOTABLE[ptype] && (ZONE[turn][r] === 1 || ZONE[turn][fromR] === 1);
              if (BASE_RANK_OK[turn][ptype][r] && !(forcePromote && canPromote && FORCE_PROMOTE[ptype] === 1)) {
                moves.push(encodeMove(from, to, false, ptype, capType));
              }
              // 成り（base → promote の順）
              if (canPromote) {
                moves.push(encodeMove(from, to, true, ptype, capType));
              }
            }
          } else {
            const canPromote = PROMOTABLE[ptype] && (ZONE[turn][r] === 1 || ZONE[turn][fromR] === 1);
            if (BASE_RANK_OK[turn][ptype][r] && !(forcePromote && canPromote && FORCE_PROMOTE[ptype] === 1)) {
              moves.push(encodeMove(from, to, false, ptype, capType));
            }
            if (canPromote) {
              moves.push(encodeMove(from, to, true, ptype, capType));
            }
          }
          if (occ !== EMPTY) {
            break; // 相手の駒を取って止まる
          }
          if (!isLong) {
            break;
          }
        }
      }
    }
    if (capturesOnly) {
      // 打ち手は捕獲にならない（legalMoves での順序でも打ちは末尾）→ ここで終わり
      return moves;
    }
    // 打つ
    for (let hi = 0; hi < HAND_TYPE.length; hi++) {
      const htype = HAND_TYPE[hi];
      if (this.hands[turn][hi] === 0) {
        continue;
      }
      for (let t2 = 0; t2 < 81; t2++) {
        const to = IX_FROM_TSSHOGI[t2];
        if (board[to] !== EMPTY) {
          continue;
        }
        const r = IX_R[to];
        if (!BASE_RANK_OK[turn][htype][r]) {
          continue;
        }
        if (htype === PAWN && this._hasPawnInFile(turn, IX_F[to])) {
          continue; // 二歩
        }
        if (inCheck) {
          if (king >= 0 && this.isAttackedByRaw(king, e, to)) {
            continue; // 王手放置の打ち
          }
        }
        if (htype === PAWN && this._isPawnDropMate(to)) {
          continue; // 打ち歩詰め
        }
        moves.push(encodeMove(DROP_FROM, to, false, htype, 0));
      }
    }
    return moves;
  }

  /**
   * 合法手が1つでもあるか（legalMoves().length > 0 と完全に同じ結果）。
   * 探索の葉ノードの詰み判定用（2026-11-05）：全合法手を作らず、最初に見つかった時点で true を返す。
   * _genLegal から機械的に派生させたもの（捕獲だけの分岐を除き、push を return true に替えた）。
   * 一致は test/core/has-legal-move.test.js が、実戦に近い多数の局面で legalMoves と突き合わせる。
   * _genLegal の合法判定（ピン・王手・二歩・打ち歩詰め）を直したら、こちらも同じに直すこと。
   */
  hasLegalMove() {
    const board = this.board;
    const turn = this.turnN;
    const e = turn ^ 1;
    const king = this.kingSq[turn];
    const pin = this.scratchPin;
    let inCheck = false;
    if (king >= 0) {
      inCheck = this.isAttackedByRaw(king, e);
      if (!inCheck) {
        this._computePins(king, e);
      }
    }
    for (let t = 0; t < 81; t++) {
      const from = IX_FROM_TSSHOGI[t];
      const pc = board[from];
      if (pc === EMPTY) {
        continue;
      }
      const pcIsWhite = pc >= WHITE_BIT;
      if ((pcIsWhite ? WHITE : BLACK) !== turn) {
        continue;
      }
      const ptype = pc & 15;
      const mustVerify =
        king >= 0 && (ptype === KING || inCheck || pin[from] !== 0);
      const dirs = DIR_LIST[turn][ptype];
      const longs = DIR_IS_LONG[turn][ptype];
      const nD = dirs.length;
      const fromR = IX_R[from];
      for (let d = 0; d < nD; d++) {
        const di = dirs[d];
        const isLong = longs[d] === 1;
        const df = DIR_DF[di];
        const dr = DIR_DR[di];
        let f = IX_F[from];
        let r = fromR;
        while (true) {
          f += df;
          r += dr;
          if (f < 1 || f > 9 || r < 1 || r > 9) {
            break;
          }
          const to = f * W + r;
          const occ = board[to];
          if (occ !== EMPTY && (occ >= WHITE_BIT ? WHITE : BLACK) === turn) {
            break; // 自分の駒でブロック
          }
          if (mustVerify) {
            // 自玉の安全確認: 王手放置の isAttacked 判定
            const safe =
              ptype === KING
                ? !this.isAttackedByRaw(to, e, -1, from)
                : !this.isAttackedByRaw(king, e, to, from);
            if (safe) {
              // base（非成り）
              if (BASE_RANK_OK[turn][ptype][r]) {
                return true;
              }
              // 成り（base → promote の順）
              if (PROMOTABLE[ptype] && (ZONE[turn][r] === 1 || ZONE[turn][fromR] === 1)) {
                return true;
              }
            }
          } else {
            if (BASE_RANK_OK[turn][ptype][r]) {
              return true;
            }
            if (PROMOTABLE[ptype] && (ZONE[turn][r] === 1 || ZONE[turn][fromR] === 1)) {
              return true;
            }
          }
          if (occ !== EMPTY) {
            break; // 相手の駒を取って止まる
          }
          if (!isLong) {
            break;
          }
        }
      }
    }
    // 打つ
    for (let hi = 0; hi < HAND_TYPE.length; hi++) {
      const htype = HAND_TYPE[hi];
      if (this.hands[turn][hi] === 0) {
        continue;
      }
      for (let t2 = 0; t2 < 81; t2++) {
        const to = IX_FROM_TSSHOGI[t2];
        if (board[to] !== EMPTY) {
          continue;
        }
        const r = IX_R[to];
        if (!BASE_RANK_OK[turn][htype][r]) {
          continue;
        }
        if (htype === PAWN && this._hasPawnInFile(turn, IX_F[to])) {
          continue; // 二歩
        }
        if (inCheck) {
          if (king >= 0 && this.isAttackedByRaw(king, e, to)) {
            continue; // 王手放置の打ち
          }
        }
        if (htype === PAWN && this._isPawnDropMate(to)) {
          continue; // 打ち歩詰め
        }
        return true;
      }
    }
    return false;
  }

  /**
   * hasPower 相当: target への byColor の利きがあるか。
   * 現局面の盤面ベースで filled / ignore 付き（tsshogi hasPower 準拠）。
   */
  isAttackedByRaw(target, byColor, filled = -1, ignore = -1) {
    const board = this.board;
    const tf = IX_F[target];
    const tr = IX_R[target];
    for (let di = 0; di < 12; di++) {
      const df = DIR_DF[di];
      const dr = DIR_DR[di];
      let f = tf;
      let r = tr;
      let step = 0;
      while (true) {
        f += df;
        r += dr;
        if (f < 1 || f > 9 || r < 1 || r > 9) {
          break;
        }
        step += 1;
        const ix = f * W + r;
        if (ix === filled) {
          break;
        }
        if (ix === ignore) {
          continue;
        }
        const p = board[ix];
        if (p === EMPTY) {
          continue;
        }
        if ((p >= WHITE_BIT ? WHITE : BLACK) !== byColor) {
          break; // この方向は相手ではない駒でブロック → 発見できない
        }
        const mt = MOVE_TYPE_AT[byColor][(p & 15) * 12 + DIR_REV[di]];
        if (mt === DIR_LONG || (mt === DIR_SHORT && step === 1)) {
          return true;
        }
        break;
      }
    }
    return false;
  }

  /**
   * 王手がかかっているか（turnN の玉）。
   */
  isChecked() {
    const king = this.kingSq[this.turnN];
    if (king < 0) {
      return false; // findKing が null の場合は false（tsshogi 同等）
    }
    return this.isAttackedByRaw(king, this.turnN ^ 1);
  }

  /** 指定マス（turn 側玉）への pin を scratchPin に記録（高速経路用） */
  _computePins(king, e) {
    const pin = this.scratchPin;
    pin.fill(0);
    const board = this.board;
    const turn = this.turnN;
    for (let di = 0; di < 8; di++) {
      const df = DIR_DF[di];
      const dr = DIR_DR[di];
      let f = IX_F[king];
      let r = IX_R[king];
      let firstIx = -1;
      while (true) {
        f += df;
        r += dr;
        if (f < 1 || f > 9 || r < 1 || r > 9) {
          firstIx = -1;
          break;
        }
        const ix = f * W + r;
        if (board[ix] !== EMPTY) {
          firstIx = ix;
          break;
        }
      }
      if (firstIx < 0) {
        continue;
      }
      const p = board[firstIx];
      if ((p >= WHITE_BIT ? WHITE : BLACK) !== turn) {
        continue; // 返り先が相手側 → pin にはならない（王手は inCheck で捕捉）
      }
      // もう1段先が相手でLONG攻撃（その方向）なら firstIx は pin
      while (true) {
        f += df;
        r += dr;
        if (f < 1 || f > 9 || r < 1 || r > 9) {
          break;
        }
        const q = board[f * W + r];
        if (q === EMPTY) {
          continue;
        }
        if ((q >= WHITE_BIT ? WHITE : BLACK) === e) {
          const mt = MOVE_TYPE_AT[e][(q & 15) * 12 + DIR_REV[di]];
          if (mt === DIR_LONG) {
            pin[firstIx] = 1;
          }
        }
        break;
      }
    }
  }

  _hasPawnInFile(color, file) {
    const board = this.board;
    const base = file * W;
    for (let r = 1; r <= 9; r++) {
      const p = board[base + r];
      if (p !== 0 && (p & 15) === PAWN && (p >= WHITE_BIT ? WHITE : BLACK) === color) {
        return true;
      }
    }
    return false;
  }

  /**
   * 打ち歩詰めかどうか（tsshogi isPawnDropMate 相当）。
   * 直前の状態で「この歩打ち」が相手玉に王手になり、
   * 相手の玉が逃げられず・取り返しもない場合 true。
   */
  _isPawnDropMate(to) {
    const board = this.board;
    const c = this.turnN;
    const e = c ^ 1;
    // 逃となる玉の位置: to の「前方」方向（black なら UP）
    const dr = c === BLACK ? -1 : 1;
    let f = IX_F[to];
    let r = IX_R[to] + dr;
    // 安い早期排除: 打ち歩詰めになり得るのは「to が相手玉の直前」のときだけ。
    // 相手玉の位置は kingSq[e]（尽く盤上に1つ。無ければ -1 → 一致せず false）
    if (f * W + r !== this.kingSq[e]) {
      return false;
    }
    const kk = f * W + r;
    const kp = board[kk];
    if (kp === EMPTY) {
      return false;
    }
    if ((kp & 15) !== KING) {
      return false;
    }
    const kc = kp >= WHITE_BIT ? WHITE : BLACK;
    if (kc === c) {
      return false; // 相手の玉ではない
    }
    // 玉が逃げられるか: KING の movableDirections
    const dirs = DIR_LIST[kc][KING];
    for (let d = 0; d < dirs.length; d++) {
      const di = dirs[d];
      const ef = f + DIR_DF[di];
      const er = r + DIR_DR[di];
      if (ef < 1 || ef > 9 || er < 1 || er > 9) {
        continue;
      }
      const ix = ef * W + er;
      const occ = board[ix];
      if (occ !== EMPTY && (occ >= WHITE_BIT ? WHITE : BLACK) === kc) {
        continue;
      }
      if (!this.isAttackedByRaw(ix, c, to)) {
        return false;
      }
    }
    // 駒を取り返せるか（listSquaresByColor 相当）
    const count = this.pieceCnt[kc];
    const pos = this.piecePos[kc];
    for (let i = 0; i < count; i++) {
      const fx = pos[i];
      if (fx === kk) {
        continue;
      }
      if (this.isMovableOnBoard(fx, to) && !this.isAttackedByRaw(kk, c, to, fx)) {
        return false;
      }
    }
    return true;
  }

  /**
   * tsshogi isMovable 相当（盤面をまたぐ高速判定）。
   */
  isMovableOnBoard(from, to) {
    const board = this.board;
    const fromF = IX_F[from];
    const fromR = IX_R[from];
    const toF = IX_F[to];
    const toR = IX_R[to];
    // vectorToDirectionAndDistance: x = to.x - from.x = fromF - toF, y = toR - fromR
    const dx = fromF - toF;
    const dy = toR - fromR;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    let di;
    let distance;
    if (ax === 1 && ay === 2) {
      // 桂ジャンプ（vectorToDirectionAndDistance は distance 1 を返す）
      distance = 1;
      di = dx === 1 ? (dy === -2 ? 9 : 11) : dy === -2 ? 8 : 10;
    } else if (ax === 0 && ay === 0) {
      return false;
    } else if (ax !== 0 && ay !== 0 && ax !== ay) {
      return false;
    } else {
      distance = ax !== 0 ? ax : ay;
      const ndx = ax === 0 ? 0 : dx / ax;
      const ndy = ay === 0 ? 0 : dy / ay;
      // tsshogi の 8 方向分岐（square.cjs neighbor の挙動）
      if (ndx === -1 && ndy === -1) {
        di = 4; // left_up (file+1, rank-1)
      } else if (ndx === 0 && ndy === -1) {
        di = 0; // up
      } else if (ndx === 1 && ndy === -1) {
        di = 5; // right_up
      } else if (ndx === -1 && ndy === 0) {
        di = 2; // left = file+1
      } else if (ndx === 1 && ndy === 0) {
        di = 3; // right = file-1
      } else if (ndx === -1 && ndy === 1) {
        di = 6; // left_down
      } else if (ndx === 0 && ndy === 1) {
        di = 1; // down
      } else {
        di = 7; // right_down
      }
    }
    const p = board[from];
    if (p === EMPTY) {
      return false;
    }
    const pc = p >= WHITE_BIT ? WHITE : BLACK;
    const ptype = p & 15;
    const mt = MOVE_TYPE_AT[pc][ptype * 12 + di];
    if (mt === DIR_NONE) {
      return false;
    }
    if (mt === DIR_SHORT) {
      return distance === 1;
    }
    // LONG: 途中の駒をまたぐ手は不可（tsshogi 同等）
    let f = fromF;
    let r = fromR;
    const df = DIR_DF[di];
    const dr = DIR_DR[di];
    while (true) {
      f += df;
      r += dr;
      if (f < 1 || f > 9 || r < 1 || r > 9) {
        return false;
      }
      if (f === toF && r === toR) {
        return true;
      }
      if (board[f * W + r] !== EMPTY) {
        return false;
      }
    }
  }

  /* ---------------- make / unmake ---------------- */

  makeMove(m) {
    const from = m & 0xff;
    const to = (m >>> 8) & 0xff;
    const t = (m >>> 17) & 0xf;
    const capType = (m >>> 21) & 0xf;
    const mover = this.turnN;
    const pb = (m & PROMOTE_BIT ? PROMOTED_TYPE[t] : t) | (mover === WHITE ? WHITE_BIT : 0);
    // Zobrist の差分更新（現在値をスタックに積み、手番・動いた駒・取った駒・持ち駒の枚数を XOR する）
    if (this.zsp === this.zsHi.length) {
      this._growZobristStack();
    }
    this.zsHi[this.zsp] = this.zhi;
    this.zsLo[this.zsp] = this.zlo;
    this.zsp++;
    let zh = this.zhi ^ ZT_HI ^ ZP_HI[pb * BLEN + to];
    let zl = this.zlo ^ ZT_LO ^ ZP_LO[pb * BLEN + to];
    if (from === DROP_FROM) {
      const hj = (mover * 7 + HAND_TYPE_IDX[t]) * 20 + this.hands[mover][HAND_TYPE_IDX[t]];
      zh ^= ZH_HI[hj] ^ ZH_HI[hj - 1]; // 持ち駒 n 枚 → n-1 枚
      zl ^= ZH_LO[hj] ^ ZH_LO[hj - 1];
      this.zhi = zh;
      this.zlo = zl;
      this.board[to] = pb;
      this._listAdd(mover, to);
      this.hands[mover][HAND_TYPE_IDX[t]] -= 1;
    } else {
      const p0 = this.board[from];
      zh ^= ZP_HI[p0 * BLEN + from];
      zl ^= ZP_LO[p0 * BLEN + from];
      if (capType) {
        const pc = this.board[to];
        zh ^= ZP_HI[pc * BLEN + to];
        zl ^= ZP_LO[pc * BLEN + to];
        const hIdx = HAND_TYPE_IDX[UNPROMOTED_TYPE[capType] || capType];
        if (hIdx !== undefined) {
          // 玉を取る手は持ち駒にならない（合法手では起きない）
          const hj = (mover * 7 + hIdx) * 20 + this.hands[mover][hIdx];
          zh ^= ZH_HI[hj] ^ ZH_HI[hj + 1]; // 持ち駒 n 枚 → n+1 枚
          zl ^= ZH_LO[hj] ^ ZH_LO[hj + 1];
        }
      }
      this.zhi = zh;
      this.zlo = zl;
      this.undoCap.push(capType ? this._listRemoveAt(mover ^ 1, to) : -1);
      if (capType) {
        // 捕獲は成りを外した型が持ち駒に加わる（tsshogi doMove 準拠）
        const capHandType = UNPROMOTED_TYPE[capType] || capType;
        this.hands[mover][HAND_TYPE_IDX[capHandType]] += 1;
      }
      const k2 = this.pieceIdx[mover][from];
      this.pieceIdx[mover][from] = OFF;
      this.pieceIdx[mover][to] = k2;
      this.piecePos[mover][k2] = to;
      this.board[to] = pb;
      this.board[from] = EMPTY;
      if (t === KING) {
        this.kingSq[mover] = to;
      }
    }
    this.turnN = mover ^ 1;
    this.plyN++;
  }

  _growZobristStack() {
    const n = this.zsHi.length * 2;
    const hi = new Int32Array(n);
    const lo = new Int32Array(n);
    hi.set(this.zsHi);
    lo.set(this.zsLo);
    this.zsHi = hi;
    this.zsLo = lo;
  }

  unmakeMove(m) {
    const from = m & 0xff;
    const to = (m >>> 8) & 0xff;
    const t = (m >>> 17) & 0xf;
    const capType = (m >>> 21) & 0xf;
    const mover = this.turnN ^ 1;
    const enemy = this.turnN;
    this.turnN = mover;
    this.plyN--;
    // Zobrist は、makeMove で積んだ値に戻す（どの経路で戻っても同じ）
    this.zsp--;
    this.zhi = this.zsHi[this.zsp];
    this.zlo = this.zsLo[this.zsp];
    if (from === DROP_FROM) {
      this.board[to] = EMPTY;
      this._listRemoveAt(mover, to);
      this.hands[mover][HAND_TYPE_IDX[t]] += 1;
      return;
    }
    this.board[from] = t | (mover === WHITE ? WHITE_BIT : 0);
    const k2 = this.pieceIdx[mover][to];
    this.pieceIdx[mover][to] = OFF;
    this.pieceIdx[mover][from] = k2;
    this.piecePos[mover][k2] = from;
    if (t === KING) {
      this.kingSq[mover] = from;
    }
    if (capType) {
      // 動かした駒のリストを戻し、取った駒を capK 位置に復元
      this.board[to] = capType | (enemy === WHITE ? WHITE_BIT : 0);
      const capK = this.undoCap.pop();
      if (capK >= 0) {
        // swap-remove の逆を行う
        let n = this.pieceCnt[enemy];
        const pos = this.piecePos[enemy];
        const idx = this.pieceIdx[enemy];
        this.pieceCnt[enemy] = n + 1;
        if (capK !== n) {
          const li = pos[capK];
          pos[n] = li;
          idx[li] = n;
        }
        pos[capK] = to;
        idx[to] = capK;
      } else {
        // 不整合（未コミット経路）: 安全のため単純追加
        this._listAdd(enemy, to);
      }
      if (capType !== KING) {
        // 捕獲と同じ成りを外した型の持ち駒スロットから減らす
        const capHandType = UNPROMOTED_TYPE[capType] || capType;
        this.hands[mover][HAND_TYPE_IDX[capHandType]] -= 1;
      }
    } else {
      this.board[to] = EMPTY;
    }
  }

  isGameOver() {
    return this.legalMoves().length === 0;
  }

  /* ---------------- 検証（tsshogi isValidMove 相当） ---------------- */

  isValidMoveInt(m) {
    const board = this.board;
    const turn = this.turnN;
    const e = turn ^ 1;
    const from = m & 0xff;
    const to = (m >>> 8) & 0xff;
    if (from === DROP_FROM) {
      const t = (m >>> 17) & 0xf;
      if (t < 1 || t > 7) {
        return false;
      }
      if (this.hands[turn][HAND_TYPE_IDX[t]] === 0) {
        return false;
      }
      if (board[to] !== EMPTY) {
        return false;
      }
      const r = IX_R[to];
      if (!BASE_RANK_OK[turn][t][r]) {
        return false;
      }
      if (t === PAWN && this._hasPawnInFile(turn, IX_F[to])) {
        return false;
      }
      const king = this.kingSq[turn];
      if (king >= 0 && this.isAttackedByRaw(king, e, to)) {
        return false;
      }
      if (t === PAWN && this._isPawnDropMate(to)) {
        return false;
      }
      return true;
    }
    const pc = board[from];
    if (pc === EMPTY) {
      return false;
    }
    if ((pc >= WHITE_BIT ? WHITE : BLACK) !== turn) {
      return false;
    }
    const ptype = pc & 15;
    if (((m >>> 17) & 0xf) !== ptype) {
      return false;
    }
    const occ = board[to];
    if (occ !== EMPTY && (occ >= WHITE_BIT ? WHITE : BLACK) === turn) {
      return false;
    }
    const capActual = occ === EMPTY ? 0 : occ & 15;
    if (capActual !== ((m >>> 21) & 0xf)) {
      return false;
    }
    const fromR = IX_R[from];
    const toR = IX_R[to];
    if (m & PROMOTE_BIT) {
      if (!PROMOTABLE[ptype]) {
        return false;
      }
      if (!(ZONE[turn][fromR] === 1 || ZONE[turn][toR] === 1)) {
        return false;
      }
    } else if (!BASE_RANK_OK[turn][ptype][toR]) {
      return false;
    }
    if (!this.isMovableOnBoard(from, to)) {
      return false;
    }
    // 自玉への利き（王手放置）
    if (ptype !== KING) {
      const king = this.kingSq[turn];
      if (king >= 0 && this.isAttackedByRaw(king, e, to, from)) {
        return false;
      }
    } else {
      if (this.isAttackedByRaw(to, e, -1, from)) {
        return false;
      }
    }
    return true;
  }

  /**
   * `countAttackers(target, byColor)` と必ず同じ値を返す高速版（2026-11-06、docs/PLAN.md ⑩）。
   * byColor の全駒を調べる代わりに、target から12方向へ走査し、各方向で最初に見つかる駒が
   * byColor の駒でその方向に利きを持つものを数える（isAttackedByRaw と同じ走査。直したら両方同じに直す）。
   */
  countAttackersScan(target, byColor) {
    const board = this.board;
    const tf = IX_F[target];
    const tr = IX_R[target];
    let n = 0;
    for (let di = 0; di < 12; di++) {
      const df = DIR_DF[di];
      const dr = DIR_DR[di];
      let f = tf;
      let r = tr;
      let step = 0;
      while (true) {
        f += df;
        r += dr;
        if (f < 1 || f > 9 || r < 1 || r > 9) {
          break;
        }
        step += 1;
        const p = board[f * W + r];
        if (p === EMPTY) {
          continue;
        }
        if ((p >= WHITE_BIT ? WHITE : BLACK) !== byColor) {
          break;
        }
        const mt = MOVE_TYPE_AT[byColor][(p & 15) * 12 + DIR_REV[di]];
        if (mt === DIR_LONG || (mt === DIR_SHORT && step === 1)) {
          n += 1;
        }
        break;
      }
    }
    return n;
  }

  /** 指定マスへの利き数（color 側の駒の）tsshogi countAttackersOn 相当 */
  countAttackers(target, color) {
    let n = 0;
    const c = this.pieceCnt[color];
    const pos = this.piecePos[color];
    for (let i = 0; i < c; i++) {
      if (this.attacksSquareOnBoard(pos[i], target)) {
        n += 1;
      }
    }
    return n;
  }

  /** tsshogi ShogiBoard.attacksSquare 相当（movableDirections ベースの移動可能距離） */
  attacksSquareOnBoard(from, to) {
    const board = this.board;
    const p = board[from];
    if (p === EMPTY) {
      return false;
    }
    const pc = p >= WHITE_BIT ? WHITE : BLACK;
    const ptype = p & 15;
    const dirs = DIR_LIST[pc][ptype];
    const longs = DIR_IS_LONG[pc][ptype];
    const fromF = IX_F[from];
    const fromR = IX_R[from];
    const toF = IX_F[to];
    const toR = IX_R[to];
    for (let d = 0; d < dirs.length; d++) {
      const di = dirs[d];
      const isLong = longs[d] === 1;
      let f = fromF;
      let r = fromR;
      while (true) {
        f += DIR_DF[di];
        r += DIR_DR[di];
        if (f < 1 || f > 9 || r < 1 || r > 9) {
          break;
        }
        if (f === toF && r === toR) {
          return true;
        }
        if (board[f * W + r] !== EMPTY) {
          break;
        }
        if (!isLong) {
          break;
        }
      }
    }
    return false;
  }

  /** 全81マスの利き数。attackCounts 用（tsshogi Square.index 順の配列） */
  computeAttackCounts() {
    const black = new Array(81).fill(0);
    const white = new Array(81).fill(0);
    this.computeAttackCountsInto(black, white);
    return { black, white };
  }

  /**
   * computeAttackCounts の本体。結果を渡された配列（81要素・呼び出し側で0にしておく）に足し込む。
   * 評価（control 項）が、評価のたびに配列を作らず使い回すための入口（2026-11-05）。
   */
  computeAttackCountsInto(black, white) {
    const board = this.board;
    for (let t = 0; t < 81; t++) {
      const from = IX_FROM_TSSHOGI[t];
      const p = board[from];
      if (p === EMPTY) {
        continue;
      }
      const out = p >= WHITE_BIT ? white : black;
      const pc = p >= WHITE_BIT ? WHITE : BLACK;
      const ptype = p & 15;
      const dirs = DIR_LIST[pc][ptype];
      const longs = DIR_IS_LONG[pc][ptype];
      let f = IX_F[from];
      const fromR = IX_R[from];
      let r = fromR;
      for (let d = 0; d < dirs.length; d++) {
        const di = dirs[d];
        const isLong = longs[d] === 1;
        f = IX_F[from];
        r = fromR;
        while (true) {
          f += DIR_DF[di];
          r += DIR_DR[di];
          if (f < 1 || f > 9 || r < 1 || r > 9) {
            break;
          }
          const ix = f * W + r;
          out[IX_TO_TSSHOGI[ix]] += 1;
          if (board[ix] !== EMPTY) {
            break;
          }
          if (!isLong) {
            break;
          }
        }
      }
    }
  }

  /* ---------------- SFEN 検証・解析（使い回し用） ---------------- */

  static isValidSFEN(sfen) {
    if (typeof sfen !== "string") {
      return false;
    }
    const sections = sfen.split(" ");
    if ((sections.length === 5 || sections.length === 4) && sections[0] === "sfen") {
      sections.shift();
    }
    if (sections.length !== 4 && sections.length !== 3) {
      return false;
    }
    if (!FastBoard.isValidBoardSFEN(sections[0])) {
      return false;
    }
    if (sections[1] !== "b" && sections[1] !== "w") {
      return false;
    }
    const hand = sections[2];
    if (hand !== "-" && !HAND_VALID_RE.test(hand)) {
      return false;
    }
    if (sections.length === 4 && !/[0-9]+/.test(sections[3])) {
      return false;
    }
    return true;
  }

  static isValidBoardSFEN(boardSFEN) {
    const rows = boardSFEN.split("/");
    if (rows.length !== 9) {
      return false;
    }
    for (let y = 0; y < 9; y++) {
      let x = 0;
      const row = rows[y];
      for (let i = 0; i < row.length; i++) {
        let c = row[i];
        if (c === "+") {
          i += 1;
          c += row[i];
        }
        if (c >= "1" && c <= "9") {
          x += Number(c);
        } else if (pieceFromSFENChar(c)) {
          x += 1;
        } else {
          return false;
        }
      }
      if (x !== 9) {
        return false;
      }
    }
    return true;
  }

  /** 持ち駒 SFEN の解析。black/white の Uint16Array を返す（無効は null） */
  static parseHandSFEN(hand) {
    const out = [new Uint16Array(7), new Uint16Array(7)];
    if (hand === "-") {
      return out;
    }
    const matched = typeof hand === "string" ? hand.match(/[0-9]{0,2}[PLNSGBRplnsgbr]/g) : null;
    if (!matched) {
      return null;
    }
    for (const sec of matched) {
      let n = 1;
      if (sec.length >= 2) {
        n = Number(sec.substring(0, sec.length - 1));
      }
      const ch = sec[sec.length - 1];
      const upper = ch.toUpperCase();
      const color = upper === ch ? BLACK : WHITE;
      const charTable = {
        R: ROOK,
        B: BISHOP,
        G: GOLD,
        S: SILVER,
        N: KNIGHT,
        L: LANCE,
        P: PAWN,
      };
      const type = charTable[upper];
      if (!type) {
        return null;
      }
      out[color][HAND_TYPE_IDX[type]] += n;
    }
    return out;
  }
}

/* ================= Square / Move の軽量ラッパー ================= */

/** tsshogi Square 互換（軽量・固定 81 インスタンス） */
class FastSquare {
  constructor(file, rank) {
    this.file = file;
    this.rank = rank;
  }
  get x() {
    return 9 - this.file;
  }
  get y() {
    return this.rank - 1;
  }
  get index() {
    return (this.rank - 1) * 9 + (9 - this.file);
  }
  get valid() {
    return this.file >= 1 && this.file <= 9 && this.rank >= 1 && this.rank <= 9;
  }
  get usi() {
    return `${this.file}${"abcdefghi"[this.rank - 1]}`;
  }
  get sfen() {
    return this.usi;
  }
  get opposite() {
    return new FastSquare(10 - this.file, 10 - this.rank);
  }
  equals(square) {
    return !!square && this.file === square.file && this.rank === square.rank;
  }
  /** tsshogi Direction 文字列 or (dx, dy) 数値を取る */
  neighbor(arg0, arg1) {
    switch (arg0) {
      case "up":
        return new FastSquare(this.file, this.rank - 1);
      case "down":
        return new FastSquare(this.file, this.rank + 1);
      case "left":
        return new FastSquare(this.file + 1, this.rank);
      case "right":
        return new FastSquare(this.file - 1, this.rank);
      case "left_up":
        return new FastSquare(this.file + 1, this.rank - 1);
      case "right_up":
        return new FastSquare(this.file - 1, this.rank - 1);
      case "left_down":
        return new FastSquare(this.file + 1, this.rank + 1);
      case "right_down":
        return new FastSquare(this.file - 1, this.rank + 1);
      case "left_up_knight":
        return new FastSquare(this.file + 1, this.rank - 2);
      case "right_up_knight":
        return new FastSquare(this.file - 1, this.rank - 2);
      case "left_down_knight":
        return new FastSquare(this.file + 1, this.rank + 2);
      case "right_down_knight":
        return new FastSquare(this.file - 1, this.rank + 2);
    }
    return new FastSquare(this.file - arg0, this.rank + arg1);
  }
  directionTo(square) {
    void square;
    return null; // 必要となる想定外のため未実装（tsshogi 互換外）
  }
}

/** Square.all 相当（index 0..80 順） */
const SQUARES = [];
for (let i = 0; i < 81; i++) {
  const file = 9 - (i % 9);
  const rank = Math.trunc(i / 9) + 1;
  SQUARES.push(new FastSquare(file, rank));
}
/** internal ix → FastSquare */
const SQUARE_BY_IX = new Array(BLEN).fill(null);
for (let i = 0; i < 81; i++) {
  SQUARE_BY_IX[IX_FROM_TSSHOGI[i]] = SQUARES[i];
}

/** tsshogi Move 互換（軽量・不変）。int は内部符号化のキャッシュ（探索の高速化用。省略可）。 */
class FastMove {
  constructor(from, to, promote, color, pieceType, capturedPieceType, int) {
    this.from = from;
    this.to = to;
    this.promote = promote;
    this.color = color;
    this.pieceType = pieceType;
    this.capturedPieceType = capturedPieceType;
    this.int = int;
  }
  get usi() {
    let ret = "";
    if (typeof this.from === "string") {
      // tsshogi pieceTypeToSFEN は先手フォーマット（大文字）固定
      ret += SFEN_UPPER[this.from] + "*";
    } else {
      ret += this.from.usi;
    }
    ret += this.to.usi;
    if (this.promote) {
      ret += "+";
    }
    return ret;
  }
  withPromote() {
    // int キャッシュは promote 掛け後と異なるので落としておく（encodePublicMove で再構築される）
    return new FastMove(this.from, this.to, true, this.color, this.pieceType, this.capturedPieceType, undefined);
  }
  equals(move) {
    if (!move) {
      return false;
    }
    const fromEqual =
      (typeof this.from === "string" && typeof move.from === "string" && this.from === move.from) ||
      (typeof this.from !== "string" && typeof move.from !== "string" && this.from.equals(move.from));
    return (
      fromEqual &&
      this.to.equals(move.to) &&
      this.promote === move.promote &&
      this.color === move.color &&
      this.pieceType === move.pieceType &&
      this.capturedPieceType === move.capturedPieceType
    );
  }
}

/** 打ち手の USI 部分用の大文字一覧 */
const SFEN_UPPER = {
  pawn: "P",
  lance: "L",
  knight: "N",
  silver: "S",
  gold: "G",
  bishop: "B",
  rook: "R",
  king: "K",
};

/* ================= ShogiBoardFast（公開互換ラッパー） ================= */

const COLOR_STRING = ["black", "white"];

function normalizeColor(color) {
  if (color === "black" || color === "white") {
    return color === "black" ? BLACK : WHITE;
  }
  if (color === "b" || color === "sente" || color === "先手") {
    return BLACK;
  }
  if (color === "w" || color === "gote" || color === "後手") {
    return WHITE;
  }
  throw new Error(`Unknown color: ${color}`);
}

function squareLikeTo(ixOrSquare) {
  if (typeof ixOrSquare === "number") {
    return ixOrSquare;
  }
  const sq = ixOrSquare;
  const f = sq.file;
  const r = sq.rank;
  if (!Number.isInteger(f) || !Number.isInteger(r) || f < 1 || f > 9 || r < 1 || r > 9) {
    return -1;
  }
  return SQ_TO_IX[f * 10 + r];
}

/** 手オブジェクト（tsshogi Move 互換 or USI 文字列）を内部 int 化。
 *  成功は int、失敗は null。
 *
 * 盤面の駒は使わず move 自身の pieceType / capturedPieceType を使う。
 * make 後の盤面からも unmakeMove が再エンコードできるようにするため
 * （盤面参照だと from が空になって読めない）。盤面との整合は
 * isValidMoveInt が tsshogi isValidMove と同一条件で検証する。
 * USI 文字列の場合のみ createMoveByUSI 相当の盤面参照を行う。
 */
export function encodePublicMove(board, move) {
  if (typeof move === "string") {
    return parseUSIMoveToInt(board, move);
  }
  let from;
  let movedType;
  if (typeof move.from === "string") {
    movedType = TYPE_NUM[move.from];
    if (!movedType || movedType > 7) {
      return null;
    }
    from = DROP_FROM;
  } else {
    from = squareLikeTo(move.from);
    if (from < 0) {
      return null;
    }
    movedType = TYPE_NUM[move.pieceType];
    if (!movedType) {
      return null;
    }
  }
  const to = squareLikeTo(move.to);
  if (to < 0) {
    return null;
  }
  const capType = move.capturedPieceType ? TYPE_NUM[move.capturedPieceType] || 0 : 0;
  const promote = !!move.promote;
  return encodeMove(from, to, promote, movedType, capType);
}

/** tsshogi parseUSIMove 相当（速版: int 化まで行う） */
function parseUSIMoveToInt(board, usi) {
  if (typeof usi !== "string" || usi.length < 4) {
    return null;
  }
  let from;
  let movedType;
  if (usi[1] === "*") {
    const type = HAND_BY_USI_CHAR[usi[0]];
    if (!type) {
      return null;
    }
    movedType = type;
    from = DROP_FROM;
  } else {
    const f = Number(usi[0]);
    const rl = RANK_BY_LETTER[usi[1]];
    if (!(f >= 1 && f <= 9) || !rl) {
      return null;
    }
    from = SQ_TO_IX[f * 10 + rl];
    if (from === OFF || from === undefined) {
      return null;
    }
    const p = board.board[from];
    if (p === EMPTY) {
      return null;
    }
    movedType = p & 15;
  }
  const f2 = Number(usi[2]);
  const rl2 = RANK_BY_LETTER[usi[3]];
  if (!(f2 >= 1 && f2 <= 9) || !rl2) {
    return null;
  }
  const to = SQ_TO_IX[f2 * 10 + rl2];
  if (to === OFF || to === undefined) {
    return null;
  }
  const occ = board.board[to];
  const capType = occ === EMPTY ? 0 : occ & 15;
  const promote = usi.length >= 5 && usi[4] === "+";
  return encodeMove(from, to, promote, movedType, capType);
}

const HAND_BY_USI_CHAR = {
  P: PAWN,
  L: LANCE,
  N: KNIGHT,
  S: SILVER,
  G: GOLD,
  B: BISHOP,
  R: ROOK,
  p: PAWN,
  l: LANCE,
  n: KNIGHT,
  s: SILVER,
  g: GOLD,
  b: BISHOP,
  r: ROOK,
};
const RANK_BY_LETTER = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
  i: 9,
};

export class ShogiBoardFast {
  /** @param {string} [sfen] */
  constructor(sfen = INITIAL_SFEN) {
    this.fb = new FastBoard();
    const ok = this.fb.resetBySFEN(sfen);
    if (!ok) {
      throw new Error(`Invalid SFEN: ${sfen}`);
    }
  }

  /** 局面のキー（Zobrist。置換表のキー。FastBoard.zkey と同じ） */
  zkey() {
    return this.fb.zkey();
  }

  /** 合法手の一覧（tsshogi Move 互換オブジェクトの配列） */
  legalMoves() {
    return this._movsFromInts(this.fb.legalMoves());
  }

  /** 合法な捕獲手のみ（legalMoves().filter(捕獲) と同一内容・同一順序。静止探索用） */
  legalCaptures() {
    return this._movsFromInts(this.fb.legalCaptures());
  }

  /** 探索用の合法手（成れるときの歩・角・飛の不成を除く。FastBoard.legalMovesForSearch 参照） */
  legalMovesForSearch() {
    return this._movsFromInts(this.fb.legalMovesForSearch());
  }

  /** 内部 int 手 → tsshogi Move 互換オブジェクト化 */
  _movsFromInts(ints) {
    const fb = this.fb;
    const out = [];
    for (let i = 0; i < ints.length; i++) {
      const m = ints[i];
      const fromRaw = m & 0xff;
      const toRaw = (m >>> 8) & 0xff;
      const movedType = (m >>> 17) & 0xf;
      const capType = (m >>> 21) & 0xf;
      const promote = (m & PROMOTE_BIT) !== 0;
      const from = fromRaw === DROP_FROM ? TYPE_STRING[movedType] : SQUARE_BY_IX[fromRaw];
      out.push(
        new FastMove(
          from,
          SQUARE_BY_IX[toRaw],
          promote,
          COLOR_STRING[fb.turnN],
          TYPE_STRING[movedType],
          capType === 0 ? null : TYPE_STRING[capType],
          m,
        ),
      );
    }
    return out;
  }

  /**
   * 指す -> boolean。board.js と同様に検証付き。
   * @param {object|string} move tsshogi Move 互換オブジェクト or USI 文字列
   */
  makeMove(move) {
    const m = encodePublicMove(this.fb, move);
    if (m === null) {
      return false;
    }
    if (!this.fb.isValidMoveInt(m)) {
      return false;
    }
    this.fb.makeMove(m);
    return true;
  }

  /** 検証なしで指す。探索内部専用（move はこの局面での合法手）。置換えは public makeMove と同じ。 */
  makeMoveRaw(move) {
    const m = move instanceof FastMove ? move.int : encodePublicMove(this.fb, move);
    if (m === null || m === undefined) {
      return false;
    }
    this.fb.makeMove(m);
    return true;
  }

  /** 戻す（検証なし 上記 unmakeMove 同様 tsshogi undoMove 準拠） */
  unmakeMove(move) {
    const m = encodePublicMove(this.fb, move);
    if (m === null) {
      return;
    }
    this.fb.unmakeMove(m);
  }

  /** 検証なしで戻す。探索内部専用（makeMoveRaw の直後であること）。 */
  unmakeMoveRaw(move) {
    const m = move instanceof FastMove ? move.int : encodePublicMove(this.fb, move);
    if (m === null || m === undefined) {
      return;
    }
    this.fb.unmakeMove(m);
  }

  /** 終局判定（合法手0 = 詰み/ステイルメイト扱い） */
  isGameOver() {
    return this.fb.legalMoves().length === 0;
  }

  /**
   * マスにある駒。USI 文字列や tsshogi Square 互換オブジェクトを受ける。
   * @returns {{color: string, type: string}|null}
   */
  pieceAt(sq) {
    const ix = squareLikeTo(typeof sq === "string" ? parseUSI(sq) : sq);
    if (ix < 0) {
      return null;
    }
    const p = this.fb.board[ix];
    if (p === EMPTY) {
      return null;
    }
    return {
      color: p >= WHITE_BIT ? "white" : "black",
      type: TYPE_STRING[p & 15],
    };
  }

  /** 持ち駒。全 7 種の Record を返す */
  hand(color) {
    const c = normalizeColor(color);
    const h = this.fb.hands[c];
    const out = {};
    for (let i = 0; i < HAND_TYPE.length; i++) {
      out[TYPE_STRING[HAND_TYPE[i]]] = h[i];
    }
    return out;
  }

  /** 手番 Color（"black" / "white"） */
  turn() {
    return COLOR_STRING[this.fb.turnN];
  }

  /** 手数（SFEN の末尾と同じ数え方：次に指す手が何手目か。初形は 1。SFEN で渡された手数から数え始める） */
  moveNumber() {
    return this.fb.plyN;
  }

  /** 王手がかかっているか */
  inCheck() {
    return this.fb.isChecked();
  }

  sfen() {
    return this.fb.sfen();
  }

  /** USI文字列で1手指す（検証用ショートカット） */
  makeMoveByUSI(usi) {
    const m = parseUSIMoveToInt(this.fb, usi);
    if (m === null) {
      return null;
    }
    if (!this.fb.isValidMoveInt(m)) {
      return null;
    }
    // 戻り値は Move オブジェクト（board.js の makeMoveByUSI 準拠）。
    // ただしこの SFEN に都度オブジェクトを生成する。
    const before = this.fb.turnN;
    const capType = (m >>> 21) & 0xf;
    const movedType = (m >>> 17) & 0xf;
    const fromRaw = m & 0xff;
    this.fb.makeMove(m);
    const from = fromRaw === DROP_FROM ? TYPE_STRING[movedType] : SQUARE_BY_IX[fromRaw];
    return new FastMove(
      from,
      SQUARE_BY_IX[(m >>> 8) & 0xff],
      (m & PROMOTE_BIT) !== 0,
      COLOR_STRING[before],
      TYPE_STRING[movedType],
      capType === 0 ? null : TYPE_STRING[capType],
      m,
    );
  }

  /**
   * 指定マスへの利き数を数える（自他問わず）。
   * @param {string} color "black"/"white"
   * @param {string|object} sq "7g" のようなUSI or Square
   */
  countAttackers(sq, color) {
    const ix = squareLikeTo(typeof sq === "string" ? parseUSI(sq) : sq);
    if (ix < 0) {
      return 0;
    }
    const c = normalizeColor(color);
    return this.fb.countAttackers(ix, c);
  }

  /**
   * 4-0-2(a): 全81マスの利き数を1回の走査で数える。
   * @returns {{black: number[], white: number[]}} 81要素（tsshogi Square.index 順）
   */
  attackCounts() {
    return this.fb.computeAttackCounts();
  }

  static get INITIAL_SFEN() {
    return INITIAL_SFEN;
  }

  /** tsshogi PieceType と同じ文字列 enum */
  static get PieceType() {
    return SHOGI_PIECE_TYPES;
  }

  /** tsshogi Color と同じ文字列 enum */
  static get Color() {
    return SHOGI_COLORS;
  }

  /** board.js の静的ユーティリティ互換（内部実装は fastboard） */
  static attacksSquare(board, from, to) {
    if (board instanceof ShogiBoardFast) {
      return board.fb.attacksSquareOnBoard(
        squareLikeTo(typeof from === "string" ? parseUSI(from) : from),
        squareLikeTo(typeof to === "string" ? parseUSI(to) : to),
      );
    }
    return false;
  }

  static normalizeColor(color) {
    return COLOR_STRING[normalizeColor(color)];
  }
}

const SHOGI_PIECE_TYPES = {
  pawn: "pawn",
  lance: "lance",
  knight: "knight",
  silver: "silver",
  gold: "gold",
  bishop: "bishop",
  rook: "rook",
  king: "king",
  promPawn: "promPawn",
  promLance: "promLance",
  promKnight: "promKnight",
  promSilver: "promSilver",
  horse: "horse",
  dragon: "dragon",
};

const SHOGI_COLORS = {
  BLACK: "black",
  WHITE: "white",
};

/** USI のマス目文字列 → internal ix */
function parseUSI(usi) {
  if (typeof usi !== "string" || usi.length < 2) {
    return -1;
  }
  const f = Number(usi[0]);
  const rl = RANK_BY_LETTER[usi[1]];
  if (!(f >= 1 && f <= 9) || !rl) {
    return -1;
  }
  const ix = SQ_TO_IX[f * 10 + rl];
  return ix === undefined ? -1 : ix;
}

void COLOR_STRING;

/* ================= 探索（search/.js）が int 手で動くための境界 ================= */

/**
 * 内部 int 手 → tsshogi Move 互換オブジェクト。
 * 探索の最終結果・置換表の bestMove 化など「境界」で使う（ホットループでは int のまま渡す）。
 */
export function intToMove(fb, m) {
  const fromRaw = m & 0xff;
  const toRaw = (m >>> 8) & 0xff;
  const movedType = (m >>> 17) & 0xf;
  const capType = (m >>> 21) & 0xf;
  const from = fromRaw === DROP_FROM ? TYPE_STRING[movedType] : SQUARE_BY_IX[fromRaw];
  return new FastMove(
    from,
    SQUARE_BY_IX[toRaw],
    (m & PROMOTE_BIT) !== 0,
    COLOR_STRING[fb.turnN],
    TYPE_STRING[movedType],
    capType === 0 ? null : TYPE_STRING[capType],
    m,
  );
}

/** USI 文字列 → 内部 int 手（置換表の bestMoveUsi を手と照合する用。失敗は null） */
export function parseMoveInt(fb, usi) {
  return parseUSIMoveToInt(fb, usi);
}

/* ============ 評価の駒走査（util.forEachPiece の速い直接読み版） ============ */

/** (駒コード) → tsshogi piece 互換オブジェクトの使い回し（読み取り専用で使う） */
const PIECE_REFS = new Map();
function pieceRefOf(p) {
  let ref = PIECE_REFS.get(p);
  if (ref === undefined) {
    ref = { color: p >= WHITE_BIT ? "white" : "black", type: TYPE_STRING[p & 15] };
    PIECE_REFS.set(p, ref);
  }
  return ref;
}

/** internal ix → "7g" のようなマス名（文字列生成を避けるための表） */
const SQUARE_NAME_BY_IX = new Array(BLEN);
for (let f = 1; f <= 9; f++) {
  for (let r = 1; r <= 9; r++) {
    SQUARE_NAME_BY_IX[SQ_TO_IX[f * 10 + r]] = `${f}${"abcdefghi"[r - 1]}`;
  }
}

/**
 * 盤上の全駒を走査する。cb({ piece, file, rank, sq })。
 * 走査順は 筋1→9、段1→9（util.forEachPiece と同じ）。
 * `board.fb` を持つ（ShogiBoardFast 等）盤面では内部配列を直接読む。
 */
export function forEachPieceFast(pboard, cb) {
  if (pboard.fb) {
    const arr = pboard.fb.board;
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        const ix = SQ_TO_IX[f * 10 + r];
        const p = arr[ix];
        if (p !== EMPTY) {
          cb({ piece: pieceRefOf(p), file: f, rank: r, sq: SQUARE_NAME_BY_IX[ix] });
        }
      }
    }
    return;
  }
  // 汎用フォールバック（文字列マス名を parseUSI で読む）
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const sq = `${f}${"abcdefghi"[r - 1]}`;
      const piece = pboard.pieceAt(sq);
      if (piece) {
        cb({ piece, file: f, rank: r, sq });
      }
    }
  }
}
