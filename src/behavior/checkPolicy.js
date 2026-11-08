/**
 * REQUIREMENTS §4.1 無駄王手の排除（簡易版）＋ DECISIONS D-001。
 *
 * 王手は許可制。王手で指した後、相手の応手を全て試し、
 * こちらの次の1手で「駒が取れる」か「詰みがある」かを確認する。
 * どちらもなければ不許可（= 手数を伸ばす理由だけの王手は選ばせない）。
 *
 * 条件を満たさない王手は通常の評価値で他の手と同列に扱う。
 * 王手全般に減点はしない（王手飛車取りが壊れるため）。
 *
 * Node / ブラウザ / Web Worker 共通のピュアJS(ESM)。
 */

/**
 * 手番側が王手をかけた直後の局面で、
 * 相手の全応手に対して「駒取り or 1手詰み」の返しがあるか。
 * @param {import("../core/board.js").ShogiBoard} board 王手を指した直後の局面（相手番）
 * @returns {boolean}
 */
export function hasDecisiveReply(board) {
  const replies = board.legalMoves();
  if (replies.length === 0) {
    // 相手が詰み = 即詰み筋。許可。
    return true;
  }
  for (const reply of replies) {
    board.makeMove(reply);
    // 旧実装は canCaptureNow と isCheckEvasionMate の2回それぞれ legalMoves を呼んでいた。
    // 同一局面の配列を使い回す（結果の判定内容は同一: 捕獲があれば有効、
    // 捕獲がなく合法手0なら相手が詰み筋 … の各区別は同じ）。
    // 注: ここは公開の makeMove/unmakeMove を使う。search の int 版（hasDecisiveReplyInt）は
    // FastBoard の makeMoveRaw/unmakeMoveRaw を使うが、オブジェクト版は「ShogiBoard の公開
    // インターフェースだけ」で動く契約を保つ（board-tsshogi のオラクルとも互換）。
    const replyAfter = board.legalMoves();
    let decisive = false;
    for (const m of replyAfter) {
      if (m.capturedPieceType) {
        decisive = true;
        break;
      }
    }
    if (!decisive) {
      decisive = replyAfter.length === 0;
    }
    board.unmakeMove(reply);
    if (!decisive) {
      // この応手に決め手がない = 相手が正しく受ければ何も起きない王手
      return false;
    }
  }
  return true;
}

/**
 * その局面の手番側が、この1手で相手の駒を取れるか。
 * 打ち歩詰め等の違法手は legalMoves 済みなので考慮不要。
 */
export function canCaptureNow(board) {
  for (const m of board.legalMoves()) {
    if (m.capturedPieceType) {
      return true;
    }
  }
  return false;
}

/**
 * その局面の手番側が詰まされているか（合法手0）。
 * 王手をかけられた側の応手確認用。
 */
export function isCheckEvasionMate(board) {
  return board.legalMoves().length === 0;
}

/**
 * この王手は許可されるか。
 * 非王手は常に true（許可制の対象外）。
 * 王手と同時に駒を取る手（王手飛車取り等）は無条件で許可する。
 * @param {import("../core/board.js").ShogiBoard} board 王手を指す前の局面（自分番）
 * @param {import("tsshogi").Move} move 候補手
 * @returns {boolean}
 */
export function isAllowedCheck(board, move) {
  if (move.capturedPieceType) {
    return true; // 王手飛車取り等: 取った時点で駒得が確定している
  }
  board.makeMove(move);
  const givesCheck = board.inCheck();
  let allowed = true;
  if (givesCheck) {
    allowed = hasDecisiveReply(board);
  }
  board.unmakeMove(move);
  return allowed;
}

/**
 * 候補手から不許可の王手を取り除く。
 * 非王手はすべて残す。
 * @param {import("../core/board.js").ShogiBoard} board
 * @param {import("tsshogi").Move[]} moves
 * @returns {import("tsshogi").Move[]}
 */
export function filterAllowedMoves(board, moves) {
  return moves.filter((m) => isAllowedCheck(board, m));
}

/* ============ 内部 int 手版（探索ホットパス用。挙動は上のオブジェクト版と同じ） ============ */

/**
 * isAllowedCheck の int 版。@param m はこの局面での合法手（FastBoard int 符号）。
 * 捕獲手（capType != 0）は object 版の move.capturedPieceType と同一条件で無条件許可。
 */
export function isAllowedCheckInt(fb, m) {
  if ((m >>> 21) & 0xf) {
    return true; // 王手飛車取り等: 取った時点で駒得が確定している
  }
  fb.makeMove(m);
  const givesCheck = fb.isChecked();
  let allowed = true;
  if (givesCheck) {
    allowed = hasDecisiveReplyInt(fb);
  }
  fb.unmakeMove(m);
  return allowed;
}

/**
 * hasDecisiveReply の int 版。（object 版と同じ判定内容・打ち切り順序）
 */
export function hasDecisiveReplyInt(fb) {
  const replies = fb.legalMoves();
  if (replies.length === 0) {
    return true;
  }
  for (const reply of replies) {
    fb.makeMove(reply);
    const replyAfter = fb.legalMoves();
    let decisive = false;
    for (const m of replyAfter) {
      if ((m >>> 21) & 0xf) {
        decisive = true;
        break;
      }
    }
    if (!decisive) {
      decisive = replyAfter.length === 0;
    }
    fb.unmakeMove(reply);
    if (!decisive) {
      return false;
    }
  }
  return true;
}

/** filterAllowedMoves の int 版（@param moves はこの局面の合法 int 手配列） */
export function filterAllowedMovesInt(board, moves) {
  const fb = board.fb;
  return moves.filter((m) => isAllowedCheckInt(fb, m));
}
