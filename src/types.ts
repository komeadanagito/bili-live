export interface Account { uid: string; uname: string; roomId: string; avatar: string; liveStatus: number }
export interface QrLogin { url: string; key: string; image: string }
export interface QrResult { status: 'waiting' | 'scanned' | 'expired' | 'success'; account: Account | null }
export interface Area { id: number; name: string; children: Area[] }
export interface StreamInfo { addr: string; code: string; liveKey: string }
export interface LiveStats { available: boolean; warning: string | null; addFans: number; danmuNum: number; hamsterRmb: number; liveTime: number; maxOnline: number; newFansClub: number; watchedCount: number }
export type MessageKind = 'danmaku' | 'gift' | 'guard' | 'superchat' | 'superchat-delete' | 'interact' | 'notice';
export interface LiveMessage { id: string; roomId: string; kind: MessageKind; user: string; uid: string; text: string; timestamp: number; amount?: number; quantity?: number; medal?: string; raw?: unknown }
export interface ConnectionStatus { state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'; roomId: string; message: string }
export type Theme = 'dark' | 'pink-light';
