import { resolveStyle } from "../eval/index.js";
import { encodePublicMove, intToMove, parseMoveInt, PROMOTE_BIT, TYPE_STRING } from "../core/fastboard.js";
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

/** 内部 int 手の並べ替え本体（探索ホットパス） */
export function orderMovesInt(board, moves, style, tt) {
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
  const scored = new Array(n);
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
    }
    if (m & PROMOTE_BIT) {
      s += 500;
    }
    scored[i] = { m, s };
  }
  // 王手は実際に指して確認する（正確性優先）
  for (const entry of scored) {
    if (entry.s >= 1000000) {
      continue;
    }
    fb.makeMove(entry.m);
    if (fb.isChecked()) {
      entry.s += 300;
    }
    fb.unmakeMove(entry.m);
  }
  scored.sort((a, b) => b.s - a.s);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = scored[i].m;
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
 */
export function orderAndFilterInt(board, moves, style, tt, useCheckPolicy) {
  const fb = board.fb;
  const values = resolveStyle(style).pieceValues;
  let ttInt = null;
  if (tt) {
    const entry = tt.get(fb.zkey());
    if (entry?.bestMoveUsi) {
      ttInt = parseMoveInt(fb, entry.bestMoveUsi);
    }
  }
  const scored = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const isTtMove = ttInt !== null && m === ttInt;
    let s = 0;
    if (isTtMove) {
      s += 1000000;
    }
    const capType = (m >>> 21) & 0xf;
    let allowed = true;
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
      const victim = values[TYPE_STRING[capType]] ?? 0;
      const ptype = (m >>> 17) & 0xf;
      const attacker = values[TYPE_STRING[ptype]] ?? 0;
      s += 10000 + victim - attacker / 10;
    }
    if (m & PROMOTE_BIT) {
      s += 500;
    }
    if (!allowed) {
      continue; // 不許可の王手は候補から外す（全手不許可のフォールバックは呼び出し側）
    }
    scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const out = new Array(scored.length);
  for (let i = 0; i < scored.length; i++) {
    out[i] = scored[i].m;
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
