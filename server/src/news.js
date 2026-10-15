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
];

function isGenericHeadline(headline = "") {
  return GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline));
}

// Pick the newest fresh, non-generic article from a list.
function summarizeNews(articles, { now = Date.now(), maxAgeHours = 24 } = {}) {
  const ageHours = (article) =>
    (now - new Date(article.created_at).getTime()) / 3_600_000;

  const relevant = articles.filter((article) => {
    const age = ageHours(article);

    return (
      Number.isFinite(age) &&
      age >= -0.1 &&
      age <= maxAgeHours &&
      !isGenericHeadline(article.headline)
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

module.exports = { GENERIC_HEADLINE_PATTERNS, isGenericHeadline, summarizeNews };
