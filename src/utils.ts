import type { Area, LiveMessage } from './types';
export const MESSAGE_LIMIT = 500;
export function appendMessage(messages: LiveMessage[], message: LiveMessage): LiveMessage[] {
  if (messages.some(item => item.id === message.id)) return messages;
  return [...messages, message].slice(-MESSAGE_LIMIT);
}
export function flattenAreas(areas: Area[], prefix = ''): { id: number; name: string }[] {
  return areas.flatMap(area => area.children.length ? flattenAreas(area.children, `${prefix}${area.name} / `) : [{ id: area.id, name: `${prefix}${area.name}` }]);
}
export function duration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 3600)}小时 ${Math.floor(value % 3600 / 60)}分钟 ${value % 60}秒`;
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '操作失败，请稍后重试。';
}
