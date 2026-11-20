(async () => {
  const t0 = Date.now();
  try {
    const res = await fetch('https://www.youtube.com/watch?v=kR8bhkVAgBY', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    console.log('Result in', Date.now() - t0, 'ms. Duration:', m ? m[1] : 'null');
  } catch (err) {
    console.error('Error:', err);
  }
})();
