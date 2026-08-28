(() => {
  // PokEX production scanner quality profile.
  // The embedded scanner reads these same-origin localStorage preferences
  // dynamically before accepting a match.
  const settings = {
    cv_min_match_score: "0.95",
    cv_min_matches: "4",
    cv_scan_interval_ms: "125"
  };

  try {
    for (const [key, value] of Object.entries(settings)) {
      localStorage.setItem(key, value);
    }
  } catch (_) {}

  window.PokEXScannerQuality = Object.freeze({
    minMatchScore: 0.95,
    minMatches: 4,
    scanIntervalMs: 125
  });
})();
