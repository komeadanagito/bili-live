import { describe, expect, it } from 'vitest';
import { appendMessage, duration, flattenAreas, MESSAGE_LIMIT } from './utils';
import type { LiveMessage } from './types';
const message = (id: number): LiveMessage => ({ id: String(id), roomId: '1', kind: 'danmaku', user: '测试', uid: '1', text: '你好', timestamp: id });
describe('message buffer', () => {
  it('retains only the latest 500 messages', () => {
    const previous = Array.from({ length: MESSAGE_LIMIT }, (_, index) => message(index));
    const result = appendMessage(previous, message(500));
    expect(result).toHaveLength(500);
    expect(result[0].id).toBe('1');
    expect(result.at(-1)?.id).toBe('500');
    expect(previous[0].id).toBe('0');
  });
  it('ignores duplicate event ids', () => {
    const previous = [message(1)];
    expect(appendMessage(previous, message(1))).toBe(previous);
  });
});
describe('area options', () => {
  it('selects leaf areas and retains hierarchical labels', () => {
    expect(flattenAreas([{ id: 1, name: '游戏', children: [{ id: 2, name: '单机', children: [] }] }])).toEqual([{ id: 2, name: '游戏 / 单机' }]);
  });
});
describe('duration', () => {
  it('formats seconds and clamps negatives', () => {
    expect(duration(3661)).toBe('1小时 1分钟 1秒');
    expect(duration(-1)).toBe('0小时 0分钟 0秒');
  });
});
