(() => {

  let fallback = null;

  async function load() {

    if (fallback)
      return fallback;

    const r = await fetch(
      "./data/en-image-fallback-v21.json?v=212"
    );

    if (!r.ok)
      throw new Error(
        "No se pudo cargar el respaldo de imágenes EN."
      );

    fallback = await r.json();

    console.log(
      `🖼️ PokEX EN fallback: ${Object.keys(fallback).length} imágenes`
    );

    return fallback;
  }


  async function apply(cards) {

    const db =
      await load();

    for (const card of cards || []) {

      if (card.image)
        continue;

      const extra =
        db[card.id];

      if (
        extra &&
        extra.image
      ) {

        card.image =
          extra.image;

        card._pokexImageSource =
          extra.source ||
          "PokEX EN";
      }
    }

    return cards;
  }


  async function applyOne(card) {

    if (!card)
      return card;

    await apply([card]);

    return card;
  }


  window.PokEXENImages = {
    load,
    apply,
    applyOne
  };

})();
