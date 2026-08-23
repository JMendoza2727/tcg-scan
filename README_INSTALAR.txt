TCG Scan - prueba en iPhone desde Ubuntu

1) Descomprime esta carpeta en Ubuntu.
2) Abre una terminal dentro de la carpeta.
3) Ejecuta:
   python3 -m http.server 8080 --bind 0.0.0.0

4) Mira la IP de Ubuntu:
   hostname -I

5) Con el iPhone en la misma Wi‑Fi abre Safari:
   http://IP_DE_UBUNTU:8080

Esta prueba local sirve para comprobar buscador, cámara/OCR y precios.
El Service Worker/PWA completa requiere HTTPS. Si la prueba funciona, el siguiente paso
es subir esta misma carpeta gratis a GitHub Pages/Cloudflare Pages y añadirla a la
pantalla de inicio del iPhone.

Datos:
- Catálogo, imágenes y precios: TCGdex.
- OCR: Tesseract.js ejecutado en el navegador del iPhone.
- No usa el Samsung ni un backend propio.
