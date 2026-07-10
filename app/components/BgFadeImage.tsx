'use client';

import { useEffect, useState } from 'react';

type Props = {
  src: string;
  style?: React.CSSProperties;
};

// Plain CSS background-image has no load event, so a large photo just pops in
// mid-paint once the network request resolves. Preloading it with a real
// Image object and fading the layer in on completion (instant if already
// cached) smooths that out.
export default function BgFadeImage({ src, style }: Props) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setLoaded(true);
    img.src = src;
    if (img.complete) setLoaded(true);
    return () => { img.onload = null; };
  }, [src]);

  return (
    <div style={{
      ...style,
      backgroundImage: `url(${src})`,
      opacity: loaded ? 1 : 0,
      transition: 'opacity 500ms ease',
    }} />
  );
}
