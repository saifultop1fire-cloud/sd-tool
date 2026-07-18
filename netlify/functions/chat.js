const https = require("https");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { messages } = JSON.parse(event.body);
    const dataStr = JSON.stringify({
      model: "google/gemma-2-9b-it:free",
      messages: messages
    });

    const responseData = await new Promise((resolve, reject) => {
      const options = {
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dataStr)
        }
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => resolve({ statusCode: res.statusCode, body }));
      });

      req.on("error", (e) => reject(e));
      req.write(dataStr);
      req.end();
    });

    return {
      statusCode: responseData.statusCode,
      headers,
      body: responseData.body
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
