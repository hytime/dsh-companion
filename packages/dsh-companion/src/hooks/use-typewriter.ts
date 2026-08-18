import { useEffect, useState } from 'react';

/**
 * 打字机效果：文本逐字显示（CJK 按字符，speed 为每字符毫秒数）。
 * text 变化时从头开始；text 为空时返回空串。
 */
export function useTypewriter(text: string | undefined, speed = 35): string {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (text === undefined || text === '') return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return text === undefined ? '' : text.slice(0, count);
}
