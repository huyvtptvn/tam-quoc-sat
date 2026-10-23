// ============================================================
// Giao thức WebSocket giữa client và server (JSON).
// Client gửi ClientMsg, server gửi ServerMsg. Trường "t" là loại tin nhắn.
// ============================================================
import type { GameResult } from '../core/game.js';
import type { Request, Response } from '../core/types.js';
import type { PlayerView } from '../core/view.js';
import type { ScoreBoard } from '../hegemony/scoring.js';
import type { PublicProfile } from './accounts.js';

export type ClientMsg =
  /** Mở đầu kết nối. Gửi lại token cũ để kết nối lại đúng người chơi sau khi rớt mạng. */
  | { t: 'hello'; name: string; token?: string;
      /** Mã đăng nhập tài khoản (từ /api/account/login). null = đăng xuất, chơi như khách. */ auth?: string | null }
  | { t: 'listRooms' }
  | { t: 'createRoom'; name?: string; seats?: number; timeoutSec?: number; /** id bộ bài: quocchien | quantranh | ungbien */ deck?: string;
      /** Chế độ chọn tướng: normal | free | chaos */ mode?: string; /** Cho đổi bài khởi đầu (mặc định có) */ mulligan?: boolean;
      /** Cho đổi chủ tướng thành quân chủ (mặc định có) */ lord?: boolean;
      /** Thảo Phạt: id boss (bỏ trống = ván Quốc Chiến thường) và độ khó normal | hard | nightmare */ boss?: string; bossDifficulty?: string;
      /** Mật khẩu phòng (bỏ trống = phòng mở). */ password?: string }
  | { t: 'joinRoom'; roomId: string; /** Mật khẩu (phòng có khóa). */ password?: string }
  /** Vào theo dõi một phòng (đang chờ hoặc đang chơi). Thoát bằng 'leaveRoom'. */
  | { t: 'spectate'; roomId: string; password?: string }
  /** Chủ phòng giải tán phòng (ván đang chơi bị hủy). */
  | { t: 'dissolveRoom' }
  /** Đầu hàng: tử trận ngay ở lần hỏi kế tiếp, không được tính thắng. */
  | { t: 'surrender' }
  | { t: 'leaveRoom' }
  | { t: 'addBot' }
  | { t: 'removeBot' }
  | { t: 'start' }
  /** Trả lời một câu hỏi của engine (reqId lấy từ tin nhắn 'request'). */
  | { t: 'answer'; reqId: number; response: Response }
  | { t: 'chat'; text: string };

export interface SeatInfo {
  index: number;
  kind: 'human' | 'bot';
  name: string;
  connected: boolean;
  /** Tên đăng nhập nếu người chơi có tài khoản. */
  username?: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  host: string;
  /** Ghế của chủ phòng (để client biết mình có phải chủ phòng). */
  hostSeat: number | null;
  status: 'waiting' | 'playing' | 'finished';
  maxSeats: number;
  timeoutSec: number;
  /** Bộ bài của phòng (id và tên hiển thị). */
  deck: string;
  deckLabel: string;
  mode: string;
  modeLabel: string;
  mulligan: boolean;
  /** Cho đổi chủ tướng thành quân chủ (Lưu Bị, Trương Giác, Tào Tháo, Tôn Quyền - Quân). */
  lord: boolean;
  /** Thảo Phạt: boss và độ khó (null = ván thường). */
  boss: { id: string; name: string; difficulty: string; difficultyLabel: string } | null;
  /** Tên các khán giả đang theo dõi. */
  spectators: string[];
  /** Phòng có mật khẩu. */
  locked?: boolean;
  seats: SeatInfo[];
}

export type ServerMsg =
  | { t: 'welcome'; playerId: string; token: string; name: string; contentVersion: number; account?: PublicProfile | null }
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'room'; room: RoomInfo | null; yourSeat: number | null; /** Bạn đang theo dõi (khán giả). */ spectating?: boolean }
  /** Engine hỏi bạn. Trả lời bằng 'answer' với cùng reqId trước khi hết giờ (hết giờ thì bot trả lời thay). */
  | { t: 'request'; reqId: number; request: Request; view: PlayerView; timeoutMs: number }
  /** Câu hỏi đã hết giờ hoặc không còn hiệu lực. */
  | { t: 'requestClosed'; reqId: number; reason: 'timeout' | 'answered' }
  /** Trạng thái bàn chơi mới nhất từ góc nhìn của bạn + các dòng nhật ký mới. */
  | { t: 'state'; view: PlayerView; log: string[] }
  | { t: 'gameOver'; result: GameResult; scores?: ScoreBoard;
      /** Ván đã lưu: mã ván, có tính xếp hạng không, Elo trước/sau từng ghế (null = khách/bot). */
      match?: { id: string; ranked: boolean; ratings: { before: number | null; after: number | null }[] } }
  | { t: 'chat'; from: string; text: string }
  /** Âm thanh: lồng tiếng kỹ năng của tướng, hoặc câu nói khi tử trận. Client tự chọn file theo skin đang dùng. */
  | { t: 'sfx'; kind: 'skill' | 'death'; seat: number; general: string; skill?: string }
  | { t: 'notice'; text: string }
  /** Phòng có mật khẩu: client hỏi mật khẩu rồi gửi lại joinRoom/spectate kèm password. wrong = vừa nhập sai. */
  | { t: 'needPassword'; roomId: string; action: 'join' | 'spectate'; wrong: boolean }
  | { t: 'error'; message: string };
