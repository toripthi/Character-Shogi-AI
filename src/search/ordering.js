import { resolveStyle } from "../eval/index.js";
import { encodePublicMove, intToMove, parseMoveInt, PROMOTE_BIT, PROMOTED_TYPE, TYPE_STRING, WHITE_BIT } from "../core/fastboard.js";
import { hasDecisiveReplyInt } from "../behavior/checkPolicy.js";

/**
 * 手の並べ替え（簡易MVV-LVA風）: 取る駒の価値中心、成り・王手に小加点。
 * 置換表のbestMoveがあれば最優先。
 *
 * 探索の内側は内部 int 手（FastBoard の符号化）で動く（orderMovesInt）。
 * tsshogi Move 互換オブジェクトの配列を受ける orderMoves は、互換のために
 * int 配列に写して orderMovesInt に渡し、結果をオブジェクトに戻すだけ。
 *
 * 前提: moves はこの局面の合法手（int 版は this.fb の生成順序そのまま）。
 */

/** 手 int の from が「打ち」を表す値（fastboard の move 符号化。DROP_FROM は未 export のためここに写す） */
const DROP_FROM = 255;

/**
 * その手が王手になりうるか（makeMove せずに判定する。2026-11-10 高速化）。
 *
 * 旧実装は全候補手を makeMove → isChecked → unmakeMove して王手加点の有無を決めていた。
 * 王手になるのは次の2経路しかないので、どちらも盤を動かさずに検出できる:
 *   (1) 動いた駒以外の自駒の利き: from が空き、to が塞がった盤面で相手玉への利きを見る
 *       （isAttackedByRaw の filled/ignore がこの仮想盤面を直接扱う。発見王手もここで拾う）。
 *   (2) 動いた駒自身の利き: 盤の2マス（from/to）だけを書き換えて attacksSquareOnBoard で見る
 *       （成りは PROMOTED_TYPE で反映する。書き換えは呼び出し前に必ず戻す）。
 * どちらでもなければ王手にはならない。なれば true を返し、呼び出し側は従来どおり
 * 実指しで確定させる（この関数は「ならない」ことの判定専用で、結果は旧実装と一致する）。
 */
export function mayGiveCheck(fb, m) {
  const mover = fb.turnN;
  const king = fb.kingSq[mover ^ 1];
  if (king < 0) {
    return false;
  }
  const from = m & 0xff;
  const to = (m >>> 8) & 0xff;
  if (fb.isAttackedByRaw(king, mover, to, from === DROP_FROM ? -1 : from)) {
    return true;
  }
  const board = fb.board;
  const savedTo = board[to];
  const savedFrom = from === DROP_FROM ? 0 : board[from];
  if (from !== DROP_FROM) {
    board[from] = 0; // EMPTY
  }
  const t = (m >>> 17) & 0xf;
  board[to] = (m & PROMOTE_BIT ? PROMOTED_TYPE[t] : t) | (mover === 1 ? WHITE_BIT : 0);
  const direct = fb.attacksSquareOnBoard(to, king);
  board[to] = savedTo;
  if (from !== DROP_FROM) {
    board[from] = savedFrom;
  }
  return direct;
}

/**
 * 履歴ヒューリスティック（2026-11-10）。βカットを起こした静かな手に、その深さの2乗を
 * 加点して蓄える。並べ替えでは上限つきでボーナスとして使う。キーは (手番, from, to)。
 * 駒を取る手には使わない（MVV-LVA が担当する）。表は think() の反復をまたいで共有され、
 * 1回の think（または searchBestMove）が終われば捨てられる。
 */
export const HISTORY_BONUS_CAP = 6000;

export function historyKey(color, m) {
  const from = m & 0xff;
  const to = (m >>> 8) & 0xff;
  return (color << 15) | (from << 7) | to;
}

export function historyBonus(history, color, m) {
  if (!history) {
    return 0;
  }
  const v = history.get(historyKey(color, m)) ?? 0;
  return v > HISTORY_BONUS_CAP ? HISTORY_BONUS_CAP : v;
}

export function historyUpdate(history, color, m, depth) {
  if (!history) {
    return;
  }
  const key = historyKey(color, m);
  history.set(key, (history.get(key) ?? 0) + depth * depth);
}

/** 内部 int 手の並べ替え本体（探索ホットパス） */
export function orderMovesInt(board, moves, style, tt, history = null) {
  const fb = board.fb;
  const values = resolveStyle(style).pieceValues;
  let ttInt = null;
  if (tt) {
    const entry = tt.get(fb.zkey());
    if (entry?.bestMoveUsi) {
      ttInt = parseMoveInt(fb, entry.bestMoveUsi);
    }
  }
  const n = moves.length;
  // スコアは {m, s} オブジェクトを作らず平行配列で持つ（2026-11-10 高速化。並びは従来と完全一致）。
  const ms = new Array(n);
  const ss = new Array(n);
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    let s = 0;
    if (ttInt !== null && m === ttInt) {
      s += 1000000;
    }
    const capType = (m >>> 21) & 0xf;
    if (capType) {
      const victim = values[TYPE_STRING[capType]] ?? 0;
      const ptype = (m >>> 17) & 0xf;
      const attacker = values[TYPE_STRING[ptype]] ?? 0;
      s += 10000 + victim - attacker / 10;
    } else if (history) {
      // 静かな手は履歴ボーナスで順序づける（取る手の帯域には届かない上限つき）
      s += historyBonus(history, fb.turnN, m);
    }
    if (m & PROMOTE_BIT) {
      s += 500;
    }
    // 王手加点は、王手になりうる手だけを実指しで確認する（従来は全手を実指ししていた）
    if (s < 1000000 && mayGiveCheck(fb, m)) {
      fb.makeMove(m);
      if (fb.isChecked()) {
        s += 300;
      }
      fb.unmakeMove(m);
    }
    ms[i] = m;
    ss[i] = s;
  }
  const idx = new Array(n);
  for (let i = 0; i < n; i++) {
    idx[i] = i;
  }
  idx.sort((a, b) => ss[b] - ss[a]); // 安定ソート: 同点は生成順序を保つ（従来のオブジェクト版と同じ）
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ms[idx[i]];
  }
  return out;
}

/**
 * 並べ替え＋無駄王手フィルタの統合版（negamax 深さ>=1 で使う）。
 * filterAllowedMovesInt（do not do: 検証なし make → isChecked → 必要なら全応手確認）
 * と orderMovesInt（同じく make → isChecked → unmake の王手判定）が
 * 同じ局面で重複していた make/unmake を1回に一本化したもの。
 *
 * 出手の判定内容・加点値・並び（安定ソート）は「filter してから順序付け」と完全一致。
 * 全手が不許可のときは空配列を返す（呼び出し側で元候補に戻して並べ替える＝従来の
 * filterAllowedWithFallback と同じフォールバック）。
 *
 * 2026-11-10 高速化: 王手になりえない手は実指し自体を省く（mayGiveCheck）。
 * 王手でない手はフィルタで不許可にならず加点も付かないため、判定内容は変わらない。
 * 王手になりうる手は従来どおり実指しして確定させる（hasDecisiveReplyInt は実指し後の
 * 局面でしか判定できないため、この経路の make/unmake は残る）。
 */
export function orderAndFilterInt(board, moves, style, tt, useCheckPolicy, history = null) {
  const fb = board.fb;
  const values = resolveStyle(style).pieceValues;
  let ttInt = null;
  if (tt) {
    const entry = tt.get(fb.zkey());
    if (entry?.bestMoveUsi) {
      ttInt = parseMoveInt(fb, entry.bestMoveUsi);
    }
  }
  const ms = [];
  const ss = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const isTtMove = ttInt !== null && m === ttInt;
    let s = 0;
    if (isTtMove) {
      s += 1000000;
    }
    const capType = (m >>> 21) & 0xf;
    let allowed = true;
    if (mayGiveCheck(fb, m)) {
      if (capType === 0) {
        // 王手は実際に指して確認する（旧 filterAllowedMovesInt と orderMoves で
        // 同じ make/inCheck/unmake を2回やっていたのをここで1回に落とす）。
        // hasDecisiveReplyInt は「王手を指した直後の局面」で判定すること（旧 isAllowedCheck と同じ）。
        fb.makeMove(m);
        const givesCheck = fb.isChecked();
        let checkBonus = false;
        if (givesCheck) {
          if (useCheckPolicy) {
            allowed = hasDecisiveReplyInt(fb);
          }
          checkBonus = !isTtMove;
        }
        fb.unmakeMove(m);
        if (checkBonus) {
          s += 300;
        }
      } else {
        // 捕獲手は無条件で許可（旧 isAllowedCheck: move.capturedPieceType → true）。
        // 王手加点だけは実指し確認（ttMove は旧 orderMoves と同じくスキップ）。
        fb.makeMove(m);
        if (fb.isChecked() && !isTtMove) {
          s += 300;
        }
        fb.unmakeMove(m);
      }
    }
    if (capType) {
      const victim = values[TYPE_STRING[capType]] ?? 0;
      const ptype = (m >>> 17) & 0xf;
      const attacker = values[TYPE_STRING[ptype]] ?? 0;
      s += 10000 + victim - attacker / 10;
    } else if (history) {
      s += historyBonus(history, fb.turnN, m);
    }
    if (m & PROMOTE_BIT) {
      s += 500;
    }
    if (!allowed) {
      continue; // 不許可の王手は候補から外す（全手不許可のフォールバックは呼び出し側）
    }
    ms.push(m);
    ss.push(s);
  }
  const n = ms.length;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) {
    idx[i] = i;
  }
  idx.sort((a, b) => ss[b] - ss[a]);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ms[idx[i]];
  }
  return out;
}

/** tsshogi Move 互換オブジェクトの配列を受ける互換版（selection など・探索では未使用） */
export function orderMoves(board, moves, style, tt) {
  const n = moves.length;
  const ints = new Array(n);
  for (let i = 0; i < n; i++) {
    const mv = moves[i];
    ints[i] = mv.int !== undefined ? mv.int : encodePublicMove(board.fb, mv);
  }
  const ordered = orderMovesInt(board, ints, style, tt);
  const out = new Array(ordered.length);
  for (let i = 0; i < ordered.length; i++) {
    out[i] = intToMove(board.fb, ordered[i]);
  }
  return out;
}
