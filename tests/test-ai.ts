async function main() {
  const url = "https://api.bluesminds.com/v1/chat/completions";
  const apiKey = "sk-wQlPOIKM11wjcZXtpwDNUIJfzoV105B7hXuxR19NGzj67B0F";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-v4.1-flash-uncen",
      messages: [{ role: "user", content: "Reply with short JSON: {\"status\": \"ok\"}" }],
    }),
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
