import React from 'react';

/**
 * B站官方常用基础高频表情 CDN 映射表 (备用兜底字典)
 */
export const BILI_DEFAULT_EMOTICONS: Record<string, string> = {
  '[花]': 'https://i0.hdslb.com/bfs/live/23b7cc51e604a91979144a8a47895e07a3c3f876.png',
  '[比心]': 'https://i0.hdslb.com/bfs/live/a98e37947137a544b6c31a74208a0d014bc08920.png',
  '[点赞]': 'https://i0.hdslb.com/bfs/live/0e071720d09995166299b6f120155b4129e92823.png',
  '[打call]': 'https://i0.hdslb.com/bfs/live/21a1662584144360e227976e1076f82780ee6e3d.png',
  '[妙啊]': 'https://i0.hdslb.com/bfs/live/9ea1d07ec6fc5beea264101bb0a77884d5dfb2b0.png',
  '[doge]': 'https://i0.hdslb.com/bfs/live/49603cd711a9386c91d8e126939fca8dfba2f483.png',
  '[保佑]': 'https://i0.hdslb.com/bfs/live/60f8fb0869a039775fb9eef4b89ff4cfa06ba26f.png',
  '[给力]': 'https://i0.hdslb.com/bfs/live/63359d95f850d51be02a0a25fe37cf1bf2c659e2.png',
  '[吃瓜]': 'https://i0.hdslb.com/bfs/live/5e098dc08e195e7c83f9f38fca641492d5be3ec8.png',
  '[泪目]': 'https://i0.hdslb.com/bfs/live/64ff3f5fb479b1bfb9045cb9d2b8b9ba5e7d5668.png',
  '[傲娇]': 'https://i0.hdslb.com/bfs/live/13c1c9812ddfa4dc8be98f7e34ef3e6488d752ad.png',
  '[喜欢]': 'https://i0.hdslb.com/bfs/live/e22c0022f421f1d13f59fa0f9ea7713d2f95447a.png',
  '[支持]': 'https://i0.hdslb.com/bfs/live/e22c0022f421f1d13f59fa0f9ea7713d2f95447a.png',
  '[加油]': 'https://i0.hdslb.com/bfs/live/c584fb3a0c4f8115668b8e058d99cbbd5f1ad9bb.png',
  '[笑哭]': 'https://i0.hdslb.com/bfs/live/f6eb8e578c784917469a473e659b8cf1a4d9aa74.png',
  '[偷笑]': 'https://i0.hdslb.com/bfs/live/b3b28b6d8db463665a3c94511993414840d5854b.png',
  '[生病]': 'https://i0.hdslb.com/bfs/live/38e4a778b871c4c1a7228807d896174151744577.png',
  '[惊讶]': 'https://i0.hdslb.com/bfs/live/d81cb4e4db544577b311736780004bc7a59e9c70.png',
  '[害羞]': 'https://i0.hdslb.com/bfs/live/f47a61d68377cb14777e384877395e868f1ef929.png',
  '[大笑]': 'https://i0.hdslb.com/bfs/live/b0cc5aae3d59664daeb2786a34bb04c8fcf10287.png',
  '[疑问]': 'https://i0.hdslb.com/bfs/live/5df32997637841c6f5984620b75496a79ee2e742.png',
  '[白眼]': 'https://i0.hdslb.com/bfs/live/0d4be10ee2a3ce3764ee71a53365ad463cbb9e27.png',
  '[哭泣]': 'https://i0.hdslb.com/bfs/live/60f25e4c0d0d8f070cbab3497d3b0c538cb17482.png',
  '[困]': 'https://i0.hdslb.com/bfs/live/3e8a49c6d59ce66e95b058a5b28d4d8ef588c27f.png',
  '[嫌弃]': 'https://i0.hdslb.com/bfs/live/4ef1788c0678280f9ef46a9e2f9d854e4c274da5.png',
  '[无语]': 'https://i0.hdslb.com/bfs/live/989ec6a4bb6dd0d6c4e09f87c80524f2b1d31024.png',
  '[酸了]': 'https://i0.hdslb.com/bfs/live/09b2e04e9081e7d23f46f48a1fb4d650cf2a4db3.png',
};

/**
 * 将弹幕文本中的表情标记 [xxx] 转换为对应的高清表情图片
 */
export function renderMessageWithEmoticons(
  text: string,
  emots?: Record<string, string>
): React.ReactNode {
  if (!text) return null;

  // 匹配形如 [花]、[比心] 的表情标签
  const regex = /\[([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 文本部分
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const fullTag = match[0]; // e.g. "[花]"
    // 优先匹配当前弹幕协议自带的 emots，其次使用官方备用字典
    const emotUrl = emots?.[fullTag] || BILI_DEFAULT_EMOTICONS[fullTag];

    if (emotUrl) {
      parts.push(
        <img
          key={`emot-${match.index}`}
          src={emotUrl}
          alt={fullTag}
          title={fullTag}
          className="danmaku-emoticon"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      );
    } else {
      // 未识别则保留原文本
      parts.push(fullTag);
    }

    lastIndex = regex.lastIndex;
  }

  // 剩余文本
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
