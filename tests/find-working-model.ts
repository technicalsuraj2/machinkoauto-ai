async function testAll() {
  const models = [
    'nvidia/ising-calibration-1.5-31b',
    'nvidia/nemotron-3.5-content-safety',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'nvidia/riva-translate-4b-instruct-v2',
    'meta/muse-glimmer-30b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/riva-translate-4b-instruct-v1.1',
    'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    'google/diffusiongemma-26b-a4b-it'
  ];

  for (const m of models) {
    try {
      const res = await fetch('https://api.bluesminds.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'user', content: 'Reply: {"status":"ok"}' }],
          max_tokens: 30,
        }),
      });
      console.log(m, '=> status:', res.status);
      if (res.status === 200) {
        const d = await res.json();
        console.log('OUTPUT from', m, ':', d.choices?.[0]?.message?.content);
      }
    } catch (e: any) {
      console.log(m, 'error:', e.message);
    }
  }
}

testAll();
