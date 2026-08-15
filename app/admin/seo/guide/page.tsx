import GuideClient from './GuideClient';

// Статична сторінка — жодних звернень ні до GSC, ні до БД: увесь вміст
// зібраний із тих самих констант, що й довідка на екранах.
export default function SeoGuidePage() {
  return <GuideClient />;
}
