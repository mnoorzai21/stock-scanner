// Headlines that only say a stock is moving, without a catalyst.
const GENERIC_HEADLINE_PATTERNS = [
  /\bstocks moving\b/i,
  /\bstocks are moving\b/i,
  /\bpre-market session\b/i,
  /\bafter-market session\b/i,
  /\bintraday session\b/i,
  /\bbiggest gainers\b/i,
  /\bbiggest losers\b/i,
  /\btop gainers\b/i,
  /\btop losers\b/i,
  /\bmarket movers\b/i,
  /\bwhy .* stock is (up|down|moving)\b/i,
  /\bmid-day (gainers|losers)\b/i,
  /\bwhat'?s behind the move\b/i,
];

// Articles tagged with more symbols than this are treated as market
// roundups unless the headline names the stock.
const MAX_SYMBOLS_FOR_DEDICATED_ARTICLE = 3;

function isGenericHeadline(headline = "") {
  return GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True when the article is about this stock, not a roundup that only
// happens to tag it: the ticker is in the headline, or the article is
// tagged with only a few symbols including this one.
function isAboutSymbol(article, symbol) {
  if (!symbol) {
    return true;
  }

  const tickerInHeadline = new RegExp(
    `(^|[^A-Za-z0-9])${escapeRegExp(symbol)}([^A-Za-z0-9]|$)`,
  ).test(article.headline || "");

  if (tickerInHeadline) {
    return true;
  }

  const symbols = Array.isArray(article.symbols) ? article.symbols : [];

  return (
    symbols.includes(symbol) &&
    symbols.length <= MAX_SYMBOLS_FOR_DEDICATED_ARTICLE
  );
}

// Pick the newest fresh article that is specifically about the stock.
function summarizeNews(
  articles,
  { symbol, now = Date.now(), maxAgeHours = 24 } = {},
) {
  const ageHours = (article) =>
    (now - new Date(article.created_at).getTime()) / 3_600_000;

  const relevant = articles.filter((article) => {
    const age = ageHours(article);

    return (
      Number.isFinite(age) &&
      age >= -0.1 &&
      age <= maxAgeHours &&
      !isGenericHeadline(article.headline) &&
      isAboutSymbol(article, symbol)
    );
  });

  if (relevant.length === 0) {
    return {
      hasNews: articles.length > 0,
      isFresh: false,
      ageInHours: null,
      headline: null,
      createdAt: null,
      source: null,
      url: null,
    };
  }

  const latest = relevant.reduce((newest, article) =>
    new Date(article.created_at) > new Date(newest.created_at)
      ? article
      : newest,
  );

  return {
    hasNews: true,
    isFresh: true,
    ageInHours: Number(Math.max(0, ageHours(latest)).toFixed(2)),
    headline: latest.headline,
    createdAt: latest.created_at,
    source: latest.source,
    url: latest.url,
  };
}

module.exports = {
  GENERIC_HEADLINE_PATTERNS,
  isGenericHeadline,
  isAboutSymbol,
  summarizeNews,
};
