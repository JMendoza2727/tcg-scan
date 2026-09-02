(() => {
  // PokEX production scanner speed/quality profile.
  // Keep the confidence threshold strict enough to avoid obvious false positives,
  // but require fewer consecutive confirmations so the result arrives faster.
  const settings = {
    cv_min_match_score: "0.75",
    cv_min_matches: "2",
    cv_scan_interval_ms: "90"
  };

  try {
    for (const [key, value] of Object.entries(settings)) {
      localStorage.setItem(key, value);
    }
  } catch (_) {}

  window.PokEXScannerQuality = Object.freeze({
    minMatchScore: 0.75,
    minMatches: 2,
    scanIntervalMs: 90
  });
})();