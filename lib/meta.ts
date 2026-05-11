export function hreflang(url: string) {
  return {
    canonical: url,
    languages: {
      'uk': url,
      'ru': url,
      'x-default': url,
    },
  };
}
